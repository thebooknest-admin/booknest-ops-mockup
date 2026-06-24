# Phase 3A: Stale RPC and Security Cleanup Plan

**Status:** Planning only. No runtime code, migrations, SQL files, database data, API/UI behavior, or commits were changed.  
**Evidence reviewed:** Phase 2D–2H reports, the Phase 2G manual SQL result snapshot, current domain routers, legacy router implementations, Supabase REST helper usage, and the EasyPost tracking webhook.

## 1. Executive Summary

The backend has two layers that now need deliberate reconciliation: a mature Supabase operational schema/RPC layer and an application layer that still performs many multi-step direct REST writes. Only two Supabase RPCs are currently called by server code—`get_shipment_pick_list` and `select_books_for_shipment`—while the database exposes 21 additional RPCs for intake, labels, SKU generation, fulfillment, valuation, and member operations.

The first repair target is not a new inventory model. It is the safety boundary around existing behavior: verify and contain stale shipment RPCs, prevent direct-write paths from bypassing allocation safeguards, harden database/function security, and establish staging tests before any lifecycle change.

No changes should be made to customer-facing, WordPress, public signup, or marketing workflows. Phase 3 remains an internal operations backend cleanup.

## 2. Confirmed Application RPC Usage

### RPCs currently called by application code

| RPC | Current server call path | Current purpose | Initial status |
| --- | --- | --- | --- |
| `get_shipment_pick_list` | `fulfillment.picking.getShipmentPickList` | Reads the assigned pick list, then enriches it with the copy bin and section. | Keep but restrict / source-review. |
| `select_books_for_shipment` | `fulfillment.picking.swapShipmentBook` | Finds alternate candidate books during an operator-initiated swap. | Keep but restrict / source-review. |

The application uses direct PostgREST requests for nearly every other operational workflow. The absence of a current call does not mean a discovered RPC is unused: it may be called by scheduled jobs, dashboard actions outside this codebase, Edge Functions, or an external integration. That must be verified before any RPC is retired.

## 3. Discovered RPCs Not Currently Called by Application Code

| RPC | Likely overlap | Initial classification | Required action |
| --- | --- | --- | --- |
| `can_member_request_swap` | Member circulation/swap eligibility | Unresolved / needs test | Inspect source, callers, and whether it encodes the return gate. |
| `commit_intake_batch` | Intake batch finalization | Keep but restrict | Compare against direct `receive.addBook` flow; inspect transaction/locking behavior. |
| `compute_base_disposition` | Valuation/disposition | Unresolved / needs test | Keep separate from circulation disposition until source semantics are known. |
| `compute_value_band` | Valuation | Keep but restrict | Preserve; not an inventory-lifecycle replacement. |
| `create_label_batch` | Label workflow | Keep but restrict | Locate backing tables and validate ownership/permissions. |
| `create_shipment_with_books` | Shipment creation/allocation | Repair or retire | It writes an invalid `reserved` copy status; do not use until repaired and tested. |
| `create_shipments_for_ship_date` | Bulk shipment generation | Keep but restrict, pending repair | It may call the unsafe shipment-creation RPC. |
| `decrement_credit` | Member credit accounting | Unresolved / needs test | Inspect source, grants, idempotency, and current direct callers. |
| `generate_order_number` | Order numbering | Keep but restrict | Compare with direct client-side/server-side number scanning. |
| `generate_sku` | SKU assignment | Keep but restrict | Compare with `next_book_copy_sku` and `next_book_sku`; choose one authority only after source review. |
| `get_active_label_batch` | Label workflow | Keep but restrict | Verify active-batch locking and operator visibility. |
| `get_picking_queue` | Picking queue | Keep but restrict | Compare with direct shipment-status queues and `picking_queue` table. |
| `get_suggested_bin` | Inventory placement | Unresolved / needs test | Compare with current application bin heuristics. |
| `mark_book_kept` | Member/return history | Keep but restrict | Verify effect on return/circulation history. |
| `mark_label_batch_printed` | Label workflow | Keep but restrict | Verify atomic copy label/status changes. |
| `next_book_copy_sku` | Copy SKU assignment | Keep but restrict | Candidate authoritative allocator; inspect lock behavior. |
| `next_book_sku` | Book SKU assignment | Unresolved / needs test | Determine whether it is distinct, obsolete, or a duplicate generator. |
| `recompute_all_valuations` | Valuation | Keep but restrict | Preserve outside circulation cleanup; inspect execution authority. |
| `recompute_book_valuation` | Valuation | Keep but restrict | Preserve outside circulation cleanup; inspect execution authority. |
| `release_label_batch` | Label workflow | Keep but restrict | Verify release/idempotency and active-batch ownership. |
| `suggest_bin_from_tags` | Inventory placement | Unresolved / needs test | Compare with `get_suggested_bin` and application classification. |

## 4. Current Operational Call Paths

The following maps current *application* behavior, not the ideal target model. Most paths are multiple sequential REST requests and therefore lack a database transaction boundary.

### Intake

`receive.addBook` in the legacy operations router currently:

1. normalizes the age group, determines theme/tags, and derives a bin/section;
2. reads or creates tags and reads or creates/updates a book title;
3. derives a SKU in application logic;
4. creates or updates the book copy and its inventory/label state.

**Risk:** this duplicates existing `intake_batches`, `intake_batch_items`, `sku_counters`, `commit_intake_batch`, and SKU RPC capabilities. A partial failure can leave title, tags, copy, label, and stock state out of sync.

### Label batching

`labels.pending` reads pending copy labels. `labels.markPrinted` directly patches `book_copies.label_status` and separately changes `pending_label` copies to `pending_stock`.

**Risk:** it bypasses `create_label_batch`, `get_active_label_batch`, `mark_label_batch_printed`, and `release_label_batch`. Two requests mean status and print evidence can diverge on a partial failure.

### Picking

- `picking.dailyOrders` reads shipments with application status `picking`.
- `picking.suggestBooks` directly reads members, shipment history, and in-house copies, then scores selection in application code.
- `picking.getShipmentPickList` calls `get_shipment_pick_list` and enriches returned rows with current copy location.
- `picking.swapShipmentBook` calls `select_books_for_shipment`, then directly patches `shipment_books`, releases the old copy, and logs a swap.
- `picking.confirmPicks` validates scans and directly patches shipment books, shipment status, and member next-ship date.

**Risk:** application code assumes statuses such as `picking`, `ready_for_picking`, and in some guards `reserved`. It performs allocation-related updates in independent requests and can bypass the active-assignment index’s intended lifecycle semantics.

### Packing

`packing.markPacked` reads shipment and assignment state, then directly changes the shipment from `packing` to `packed`.

**Risk:** this is a simple transition but still depends on direct reads of copy and shipment-book state rather than a transactionally enforced state transition.

### Shipping and EasyPost

`shipping.markShipped`:

1. checks that a shipment is `packed` and each shipment book is picked/scanned;
2. patches copies to `in_transit`;
3. patches shipment books and the shipment to `shipped`;
4. writes `member_book_history` rows; and
5. registers the tracking number with EasyPost.

`shipping.saveReturnTracking` finds a requested return, saves a tracking number, then registers it with EasyPost.

**Risk:** this is a multi-write workflow without an atomic database boundary. History insert failure is logged but does not fail/reconcile the shipment. EasyPost registration failure is swallowed after internal state changes.

### Returns

The returns domain remains delegated to the legacy router. Its return processing performs direct reads/writes across copies, shipment books, returns, return books, member history, and potentially creates the next picking order.

**Risk:** return processing can create a follow-on shipment after return completion, but existing live data already showed overlapping outbound shipments for some members. The return gate must be verified under concurrent or retried calls.

### Member bundle creation

`members.requestBundle` calls an application helper, `createPickingOrderForMember`. The helper:

1. checks active outbound shipments and member eligibility;
2. reads member history and active assigned copies;
3. selects in-house copies and titles in application code;
4. generates shipment/order numbers by scanning current shipment rows; and
5. creates the shipment and `shipment_books` records through direct REST writes.

**Risk:** this duplicates likely database behavior in `create_shipment_with_books`, `create_shipments_for_ship_date`, `generate_order_number`, and selection RPCs. It is vulnerable to races between the read/check phase and writes, despite the partial unique active-copy-assignment index.

### EasyPost tracking webhook and shipment notification

The EasyPost tracking webhook uses the Supabase anon key to directly update a matching return and may directly create a new picking shipment after a return moves to `in_transit`. It derives identifiers by scanning existing shipment rows.

`notify_shipment_shipped` has a hardcoded token in its database implementation according to the manually collected SQL results.

**Risk:** webhook idempotency, source authenticity, retry behavior, number generation, and token storage must be reviewed. Direct webhook creation can race with the operator return workflow or another automatic delivery.

### Donations

The donations router delegates to the legacy router, which calls `/donations` directly for listing and creation.

**Risk:** `/donations` was absent from both PostgREST OpenAPI and the data baseline, so this route may currently be stale, unavailable, or targeting the wrong schema/relation. Do not repair by creating a replacement relation until full metadata confirms the intended model.

## 5. Stale and Dangerous Items

| Item | Evidence / concern | Classification | Phase 3 action |
| --- | --- | --- | --- |
| `create_shipment_with_books` | Writes `book_copies.status = reserved`, but `reserved` is not accepted by the current copy-status check. No trigger was found to translate it. | **Repair or retire** | Read source/callers, reproduce in non-production, then either repair its state model or restrict/retire it from all callers. |
| `create_shipments_for_ship_date` | Reportedly calls `create_shipment_with_books`; may propagate the invalid status write. | **Keep but restrict, pending repair** | Treat as unsafe until call graph and non-production behavior are verified. |
| Application checks for `reserved` | Picking paths accept `reserved` even though the live constraint does not. | **Repair** | Resolve application/live status drift before lifecycle changes. |
| Direct allocation updates | Swap, bundle creation, and pick confirmation span independent REST writes. | **Replace or repair** | Move to a source-reviewed RPC/transactional domain service after parity tests. |
| `notify_shipment_shipped` hardcoded token | Secret embedded in database function source. | **Repair** | Security review, approved secret storage, rotate/revoke as appropriate, and audit grants/security mode. |
| Operational tables without RLS | RLS is disabled on nearly all operational tables. | **Repair** | Plan staged RLS/grants hardening; do not enable policies without service-role and RPC regression coverage. |
| `event_signups` anon-all policy | Only observed policy permits all access to anon. | **Keep but restrict** | Confirm whether it remains required for acquisition; isolate it from operations and limit its scope if retained. |
| `donations` route | No relation found in API metadata/data baseline. | **Unresolved / needs test** | Verify every schema and PostgREST exposure before any code/database change. |
| `member_book_history` uniqueness | Includes `shipment_id`, allowing a same member/title in future shipments. | **Repair** | Decide lifetime/exception policy; then add transactional guard and future constraint plan. |
| `idx_unique_active_copy_assignment` | Existing partial unique safeguard on `shipment_books(book_copy_id)` where `scanned_at IS NULL`. | **Keep but restrict** | Preserve and test every transition against its exact predicate; do not supersede it casually. |
| Multiple SKU generators | Existing counters/RPCs plus application-side number generation. | **Repair** | Identify one authoritative generator after source/locking review. |
| Existing label/intake RPCs bypassed by direct writes | Duplicate workflow logic in application router. | **Unresolved / needs test** | Establish behavior parity before selecting RPC reuse or service replacement. |

## 6. Security Review Scope

### Required facts before security changes

Obtain a database-owner-approved, read-only export of:

- function source, owner, security mode, `search_path`, volatility, and grants;
- table grants, RLS enabled flags, and policies across all relevant schemas;
- trigger/function dependencies for shipment, label, intake, SKU, and return paths;
- PostgREST exposed schemas and the reason `donations` is absent;
- callers/scheduled jobs/Edge Functions for every discovered RPC.

### Security direction

- Keep Phase 1B operator authorization as the server-side boundary.
- Restrict public procedures to health and explicitly justified acquisition routes only.
- Do not expose service-role credentials or secrets to browser code or unverified webhooks.
- Verify EasyPost webhook authenticity and introduce idempotency design before changing its behavior.
- Do not enable RLS as a blanket action; stage policies with a complete server/RPC role matrix and non-production regression suite.

## 7. Safe Implementation Sequence for Phase 3B+

### First: verify, contain, and test

1. Capture function/security metadata and source for all fulfillment, label, intake, SKU, and notification RPCs.
2. In non-production, execute `create_shipment_with_books` with a safe fixture and document the exact status/constraint result; map every caller of `create_shipments_for_ship_date`.
3. Inventory every direct REST write in shipment creation, picking, packing, shipping, returns, intake, labels, and donations.
4. Add or expand regression tests around existing routes before replacing any implementation.
5. Freeze expansion of the unsafe shipment-creation RPCs and direct donation path until their behavior/metadata is verified.

### Second: repair the highest-risk boundaries

1. Approve the valid shipment/copy status state machine and resolve the `reserved` drift.
2. Repair or retire `create_shipment_with_books`; do not change its API shape without a documented compatibility plan.
3. Verify and restrict `create_shipments_for_ship_date` once its dependency is safe.
4. Remove hardcoded token handling from `notify_shipment_shipped` through an owner-approved security remediation.
5. Define an RLS/grants rollout plan, keeping server operator access and reviewed RPCs functional.

### Third: consolidate domain orchestration

1. Extract fulfillment operations into transaction-aware domain services while preserving current tRPC inputs/outputs.
2. Reuse validated label, intake, SKU, selection, and pick-list RPCs rather than duplicate their logic.
3. Replace only direct multi-write paths whose behavior is covered by new tests and staging evidence.
4. Keep valuation, acquisition, customer-facing, and WordPress scope untouched.

### Leave alone pending verification

- `bundles` / `bundle_items` and `book_status` enum;
- `compute_base_disposition` and valuation functions;
- archive-prefixed location/taxonomy structures;
- any discovered RPC without source, caller, security, and non-production behavior evidence;
- the donations data model until its actual relation is identified.

### Owner approvals required

- The canonical valid copy/shipment status set and treatment of `reserved`.
- The business meaning of lifetime duplicate-title prevention and approved exceptions.
- RLS role model, operator/service role boundaries, and any function security-definer changes.
- Hardcoded-token remediation and required outbound notification behavior.
- Whether a hidden/renamed donations relation should be repaired, exposed, or replaced.
- Whether `bundles` already represents member cycles or is legacy.

## 8. Required Tests Before Any Code or Database Change

### RPC call-path and parity tests

- Assert the exact application arguments and expected output/error behavior for `get_shipment_pick_list` and `select_books_for_shipment`.
- In staging, test every discovered operational RPC with authorized and unauthorized contexts; record affected tables and status transitions.
- Compare direct intake, label, SKU, selection, and bundle behavior with their candidate RPC equivalents before consolidation.
- Confirm all stale-RPC callers, including scheduled/automation paths, are represented in test coverage.

### Authorization and permission tests

- Roleless and unauthenticated sessions cannot call operator reads or mutations.
- Legacy acquisition routes remain public only where explicitly required.
- RLS/grants staging tests cover server procedures, RPCs, webhooks, and any job/automation identity before policy changes.
- `event_signups` policy behavior is tested separately from operational authorization.

### Allocation and lifecycle tests

- Two concurrent allocations of the same copy cannot both succeed.
- A copy with an active `shipment_books` assignment cannot be selected or picked again.
- Cancel/release paths make a copy available exactly once and do not conflict with the active-assignment partial index.
- Pick, pack, and ship tests verify legal copy, shipment-book, and shipment status transitions.
- A failure in the middle of a multi-write transition leaves no orphaned assignment or mismatched copy/shipment status.

### Member/title and return-cycle tests

- A member cannot receive a previously shipped title under the approved lifetime/exception rule.
- The present `member_book_history` uniqueness behavior is captured as a regression baseline before it changes.
- No new bundle/shipment is created while the member has an unresolved open outbound/return cycle.
- Retried return processing and EasyPost events do not create duplicate follow-on shipments.

### Label and intake tests

- A batch cannot be printed/released twice or leave copies in inconsistent label/status states.
- Intake failures do not leave partial title, tag, SKU, copy, or location records.
- SKU generation is collision-safe under concurrency and preserves existing format rules.
- Bin and section placement match the canonical age/taxonomy policies without bypassing existing constraints.

### Webhook and notification tests

- EasyPost webhook authenticity verification, idempotency, retry, and duplicate-delivery behavior.
- No webhook or notification path logs or returns secrets.
- `notify_shipment_shipped` replacement behavior is tested with securely supplied configuration and correct grant/security mode.
- Shipment events cannot create duplicate shipments or overwrite a manually resolved return.

## 9. Rollback Strategy for Future Changes

- **No destructive deployment:** use additive, feature-gated, and reversible application changes; retain old route implementations until parity tests pass.
- **Database changes later:** write preflight reports and backup/export plans first; apply constraint/RLS/function changes independently, with verified down/disable procedures where safe.
- **RPC repair:** preserve the old function definition and callers until the replacement passes non-production transition, concurrency, authorization, and integration tests. Do not silently repurpose a function contract.
- **RLS rollout:** enable policy coverage in a staging-like environment first; maintain a documented break-glass server/service access procedure with audit logging, not anonymous bypasses.
- **Webhook/notification remediation:** rotate credentials deliberately, support a temporary dual-read configuration only if approved, and monitor failure/duplicate rates before retiring the prior path.
- **Data integrity:** stop and roll back application traffic to the stable path if a staging or production canary reveals duplicate allocations, invalid statuses, missing history, or duplicate shipment creation.

## 10. Recommended Next Step

Proceed with **Phase 3B: Domain Service Extraction**, but only after the Phase 3A read-only metadata/source verification produces an owner-approved decision for the `reserved` status conflict, `create_shipments_for_ship_date`, `notify_shipment_shipped`, donation visibility, and the RLS/grants rollout.

The first implementation slice should be a behavior-preserving fulfillment service boundary with comprehensive tests—not a schema rewrite and not customer-facing work.