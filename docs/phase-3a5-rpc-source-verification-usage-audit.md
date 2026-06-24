# Phase 3A.5: RPC Source Verification and Usage Audit

**Status:** Documentation-only repository and metadata audit. No runtime code, migrations, SQL files, database state, API/UI behavior, deletions, or commits were changed.  
**Evidence boundary:** This report distinguishes repository-proven facts from inferences. The repository contains no checked-in Supabase function definitions. OpenAPI confirms that the listed functions are publicly exposed as RPC endpoints, but it does not provide SQL bodies, security mode, grants, triggers, owners, or caller history.

## 1. Executive Summary

The repository confirms exactly two executable application calls to operational Supabase RPCs:

- `get_shipment_pick_list`, from `fulfillment.picking.getShipmentPickList`;
- `select_books_for_shipment`, from `fulfillment.picking.swapShipmentBook`.

The other 21 RPCs are visible in the Phase 2E OpenAPI capture but are not called by current repository application code. Their database source and actual write/security behavior are unknown unless explicitly noted from the manual SQL results.

The most important verified conflict is `create_shipment_with_books`: the manual metadata results state that it writes `book_copies.status = reserved`, while the current `book_copies.status` check does not permit `reserved`. No trigger was found that translates `reserved` to another status. `create_shipments_for_ship_date` is unsafe to use until its dependency on that function is confirmed and the status conflict is repaired or the function is retired.

## 2. Audit Method and Evidence Levels

### Repository searches completed

The audit searched the repository for:

```text
.rpc(
/rpc/
get_shipment_pick_list
select_books_for_shipment
create_shipment_with_books
create_shipments_for_ship_date
commit_intake_batch
create_label_batch
mark_label_batch_printed
release_label_batch
next_book_copy_sku
generate_sku
mark_book_kept
compute_base_disposition
```

### Evidence labels

| Label | Meaning |
| --- | --- |
| **Repository-proven** | An executable call or implementation is present in current source. |
| **Metadata-proven** | The Phase 2E OpenAPI snapshot exposes the RPC and, for two functions, argument signatures. |
| **Manual metadata finding** | Reported by the Phase 2G manual SQL results. |
| **Inference / unverified** | Suggested by a function name or overlap only; source, grants, and effects must be inspected. |

### Source-verification result

No Supabase RPC SQL definitions, `CREATE FUNCTION` files, function grants, or security-mode declarations are checked into this repository. No function body is therefore “source-verified” by this phase. Any write/read label marked **unknown** must be verified through the approved read-only PostgreSQL metadata export before implementation changes.

## 3. Repository-Proven RPC Call Sites

| RPC | Caller | Workflow | Application use | Notes |
| --- | --- | --- | --- | --- |
| `get_shipment_pick_list` | `server/domains/fulfillment/picking.router.ts` → `picking.getShipmentPickList` | Picking | Query; POSTs `p_shipment_id`, then reads `book_copies` to enrich location | OpenAPI confirms required UUID `p_shipment_id`. The function is used as the current assigned-list source. |
| `select_books_for_shipment` | `server/domains/fulfillment/picking.router.ts` → `picking.swapShipmentBook` | Manual pick swap | Mutation helper; POSTs `p_member_id`, `p_shipment_id`, optional `p_books_needed` | The router selects one candidate from results, then independently patches `shipment_books`, `book_copies`, and `shipment_book_swaps`. |

No other executable `/rpc/` call or `.rpc(...)` call was found in current server, webhook, shared, or maintenance source. References in docs and the metadata-export script are documentation/export logic, not application invocation.

## 4. Full RPC Decision Table

The OpenAPI capture exposes 23 RPCs. “Read/write” describes verified behavior only where available; an RPC endpoint using HTTP POST is not proof that it writes database data.

| RPC | Current caller | Workflow | Read/write status | Overlap with app-layer logic | Risk | Recommendation | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `can_member_request_swap` | None found | Member swap/circulation | Unknown | Return and member bundle logic | Unknown | Investigate further | 3A verification, then 3E |
| `commit_intake_batch` | None found | Intake | Unknown; likely stateful by name | `receive.addBook` performs direct title/tag/copy/label work | Unknown | Investigate, then wrap if behavior fits | 3B/3C |
| `compute_base_disposition` | None found | Valuation/resale disposition | Unknown | No current circulation use | Unknown, outside circulation scope | Ignore for ops lifecycle; investigate only for valuation boundary | Deferred |
| `compute_value_band` | None found | Valuation | Unknown | No active ops lifecycle overlap | Unknown, outside scope | Ignore during current cleanup | Deferred |
| `create_label_batch` | None found | Labels | Unknown; likely stateful by name | `labels.pending` / `labels.markPrinted` direct copy writes | Unknown | Investigate, then wrap if behavior fits | 3B/3C |
| `create_shipment_with_books` | None found | Shipment creation/allocation | **Manual metadata finding: writes invalid `reserved` copy status** | `createPickingOrderForMember` creates shipments/books directly | Dangerous/stale | Do not use; repair or retire after staging reproduction | 3A repair gate |
| `create_shipments_for_ship_date` | None found | Bulk shipment creation | Unknown body; reported to call unsafe `create_shipment_with_books` | No direct app equivalent bulk route identified | Dangerous by dependency | Do not use; investigate and repair/restrict with its dependency | 3A repair gate |
| `decrement_credit` | None found | Member credits | Unknown | Direct member-credit handling exists in member creation | Unknown | Investigate further | 3E |
| `generate_order_number` | None found | Order/shipment numbering | Unknown; likely stateful/sequencing | App and webhook scan shipment rows to create numbers | Race-risk if parallel authority | Investigate; choose one authority before wrapping | 3B/3D |
| `generate_sku` | None found | SKU sequencing | Unknown; likely stateful/sequencing | Intake creates SKU in app code | Race-risk if parallel authority | Investigate; choose one authoritative generator | 3B/3C |
| `get_active_label_batch` | None found | Labels | Unknown; expected read by name | Direct label queue/read logic | Unknown | Investigate, then wrap if behavior fits | 3B/3C |
| `get_picking_queue` | None found | Picking queue | Unknown; expected read by name | `picking.dailyOrders` directly reads shipments | Unknown | Investigate, then wrap if it is authoritative | 3B/3D |
| `get_shipment_pick_list` | `picking.getShipmentPickList` | Picking | Expected read; body unverified | Application enriches location only | Medium: unknown filters/permissions | Keep, wrap behind a fulfillment service, source-review | 3B |
| `get_suggested_bin` | None found | Intake/location suggestion | Unknown | App derives bins/themes and section placement | Unknown | Investigate further | 3C |
| `mark_book_kept` | None found | Return/member history | Unknown; likely stateful by name | Legacy return handling updates `member_book_history` directly | Unknown | Investigate; wrap only after return semantics are mapped | 3E |
| `mark_label_batch_printed` | None found | Labels | Unknown; likely stateful by name | `labels.markPrinted` directly writes label/copy state | Unknown | Investigate, then wrap if it atomically records print state | 3B/3C |
| `next_book_copy_sku` | None found | Copy SKU sequencing | Unknown; likely stateful/sequencing | App generates copy SKU directly | Medium: concurrency/format risk | Investigate; likely authoritative candidate | 3B/3C |
| `next_book_sku` | None found | SKU sequencing | Unknown | Overlaps `next_book_copy_sku` and `generate_sku` | Medium: duplicate authority | Investigate and classify one of the generators | 3B/3C |
| `recompute_all_valuations` | None found | Valuation/resale | Unknown; likely stateful by name | No current ops lifecycle use | Outside current scope | Ignore during current cleanup | Deferred |
| `recompute_book_valuation` | None found | Valuation/resale | Unknown; likely stateful by name | No current ops lifecycle use | Outside current scope | Ignore during current cleanup | Deferred |
| `release_label_batch` | None found | Labels | Unknown; likely stateful by name | No direct batch-release equivalent | Unknown | Investigate, then wrap if behavior fits | 3B/3C |
| `select_books_for_shipment` | `picking.swapShipmentBook` | Picking/selection | Expected selection read; body unverified | App also runs its own suggestion/scoring and performs writes | Medium: unknown duplicate-title/allocation behavior | Keep, wrap behind fulfillment service, source-review | 3B/3D |
| `suggest_bin_from_tags` | None found | Intake/location suggestion | Unknown; expected read by name | App maps tags/theme to bin heuristics | Unknown | Investigate further | 3C |

## 5. Required RPC Verification Details

### `get_shipment_pick_list`

- **Application call:** repository-proven in `picking.getShipmentPickList`.
- **Known signature:** `p_shipment_id UUID` required.
- **Workflow:** returns the existing assignment list for one shipment; app code then reads current `book_copies.bin_id` and `section` to format location.
- **Read/write:** expected read, but SQL source is unavailable; do not claim read-only until source is exported.
- **Risk:** unknown permission model, status filtering, allocation filtering, and whether it relies on any `reserved` logic.
- **Action:** keep; wrap in a fulfillment service in Phase 3B without changing arguments/outputs; add contract and authorization tests first.

### `select_books_for_shipment`

- **Application call:** repository-proven in `picking.swapShipmentBook`.
- **Known signature:** `p_member_id UUID`, `p_shipment_id UUID`, optional `p_books_needed integer`.
- **Workflow:** candidate selection for a manual swap.
- **Read/write:** expected selection read, but unverified. It could record selection history or lock candidates.
- **Overlap:** `picking.suggestBooks` separately reads and ranks in-house copies in application code; the swap mutation then performs direct assignment writes.
- **Risk:** unknown lifetime duplicate-title rules, in-flight exclusion, locking, and treatment of existing active assignments.
- **Action:** keep; source-review; wrap in Phase 3B and use Phase 3D to decide whether selection/allocation must become one transaction.

### `create_shipment_with_books`

- **Application caller:** none found.
- **Manual metadata finding:** writes `book_copies.status = reserved`.
- **Constraint conflict:** `reserved` is not permitted by the captured `book_copies.status` check, and no trigger was found that converts it to a valid status.
- **Risk:** dangerous/stale; likely fails or depends on schema drift not reflected in current metadata.
- **Action:** do not call, wrap, or expose it. In non-production, capture definition/dependencies and reproduce with a fixture only after owner approval. Repair or retire is a Phase 3A decision.

### `create_shipments_for_ship_date`

- **Application caller:** none found.
- **Known risk:** Phase 2G/2H evidence indicates it calls `create_shipment_with_books`.
- **Read/write:** unknown source, but bulk-creation purpose implies stateful behavior.
- **Action:** do not use. Verify its dependency graph and non-production behavior only after the underlying shipment RPC is resolved. Keep restricted or retire as a pair with the dependency.

### `commit_intake_batch`

- **Application caller:** none found.
- **Existing app owner:** `receive.addBook` directly creates/updates tags, titles, copies, label state, bin/section data, and application-generated SKU state.
- **Read/write:** unknown; function name and intake-batch model suggest a stateful commit, but source is absent.
- **Action:** investigate rather than replace. Compare resulting records, lifecycle statuses, and failure atomicity in staging. If it is correct and transactional, wrap it in a future inventory service; if not, preserve application behavior until a replacement is tested.

### Label-batch RPCs

| RPC | Repository caller | Verification result | Action |
| --- | --- | --- | --- |
| `create_label_batch` | None | Body/security/backing relation unknown | Investigate, then wrap if it is the authoritative batch creator. |
| `get_active_label_batch` | None | Body/security/backing relation unknown | Investigate, likely read-only but unverified. |
| `mark_label_batch_printed` | None | Body/status transition behavior unknown | Investigate; compare against direct `labels.markPrinted`. |
| `release_label_batch` | None | Release/idempotency semantics unknown | Investigate before introducing any new print-job model. |

The application currently owns label behavior through direct `book_copies` patches. Do not switch it to batch RPCs until batch locking, ownership, print evidence, and atomic status behavior are source-verified.

### SKU RPCs

| RPC | Repository caller | Verification result | Action |
| --- | --- | --- | --- |
| `next_book_copy_sku` | None | Candidate copy-SKU allocator; source/locking unknown | Investigate first; likely candidate to wrap. |
| `next_book_sku` | None | Purpose relative to copy SKU unknown | Investigate; may be duplicate/legacy. |
| `generate_sku` | None | Purpose/locking unknown | Investigate; do not create another generator. |

The direct intake path and the EasyPost webhook both scan existing rows for generated identifiers. Phase 3C must select exactly one authoritative generator per identifier type after concurrent tests.

### `get_picking_queue`, `can_member_request_swap`, and `mark_book_kept`

- **`get_picking_queue`:** no repository caller. It overlaps direct shipment-status queues and the `picking_queue` relation. Investigate whether it is the authoritative queue before using it.
- **`can_member_request_swap`:** no repository caller. It may encode customer/circulation rules, which are outside active customer-facing work. Investigate only as needed for return/member-cycle enforcement.
- **`mark_book_kept`:** no repository caller. Legacy return handling updates history directly. Verify its relationship to return books, member history, credits, and current statuses before use.

### `compute_base_disposition`

- **Application caller:** none found.
- **Purpose:** metadata/reconciliation evidence suggests valuation or resale disposition.
- **Action:** ignore for current inventory/circulation cleanup. Do not use it as a substitute for canonical circulation disposition until source and policy owners confirm that meaning.

## 6. Authoritative Workflow Ownership Map

| Workflow | Current application owner | Existing Supabase RPC/table counterpart | Current authority | Phase 3 direction |
| --- | --- | --- | --- | --- |
| Intake | Legacy `receive.addBook` direct REST orchestration | `intake_batches`, `intake_batch_items`, `commit_intake_batch` | App code in practice; database batch semantics unverified | Verify batch RPC; choose one transactional authority in 3C. |
| Labels | Legacy `labels.pending` / `labels.markPrinted` | Label-batch RPCs, `label_batch_id` | App code in practice | Verify and potentially wrap label RPCs in 3C. |
| SKU generation | Direct intake helper / current code paths | `sku_counters`, `next_book_copy_sku`, `next_book_sku`, `generate_sku` | Split/unsafe authority | Choose one after source and concurrency verification in 3C. |
| Picking/list | `picking.dailyOrders`, `suggestBooks`, direct queries | `picking_queue`, `get_picking_queue`, `get_shipment_pick_list`, `select_books_for_shipment` | Mixed | Wrap current used read/selection RPCs in 3B; settle allocation in 3D. |
| Shipment creation | `createPickingOrderForMember` direct REST writes | `create_shipment_with_books`, `create_shipments_for_ship_date`, `generate_order_number` | App code in practice; DB RPCs unsafe/unverified | Do not adopt shipment RPCs until 3A repair decision; centralize in 3D. |
| Packing/shipping | Fulfillment packing/shipping routers direct REST + EasyPost | No verified shipping RPC | App code | Extract behavior-preserving service in 3B; transactional repair in 3D. |
| Returns | Legacy return processor direct REST + EasyPost webhook | `mark_book_kept`, `can_member_request_swap` | App code | Map return/member-cycle semantics in 3E before using hidden RPCs. |
| Donations | Legacy donations router direct `/donations` REST calls | No visible relation/RPC | Unresolved | Verify relation/schema before any implementation in 3F. |

## 7. RPCs Not Safe to Use Until Repaired or Verified

### Explicitly blocked

- `create_shipment_with_books` — invalid `reserved` status conflict.
- `create_shipments_for_ship_date` — potentially calls the blocked function.

### Restricted pending source/security verification

- `commit_intake_batch`
- `create_label_batch`
- `get_active_label_batch`
- `mark_label_batch_printed`
- `release_label_batch`
- `next_book_copy_sku`
- `next_book_sku`
- `generate_sku`
- `generate_order_number`
- `get_picking_queue`
- `can_member_request_swap`
- `mark_book_kept`
- `decrement_credit`
- both current application RPCs, `get_shipment_pick_list` and `select_books_for_shipment`, for any new write behavior or permission expansion.

Restriction does not mean removal. It means do not introduce a new caller or make a behavior change until function definition, grants, security mode, dependencies, and non-production effects are known.

## 8. Future Domain-Service Wrapping Candidates

### High-value Phase 3B wrappers

1. **Fulfillment read/selection adapter:** wrap `get_shipment_pick_list` and `select_books_for_shipment` behind one service interface, preserving their existing tRPC inputs/outputs and adding contract-level error handling.
2. **No behavior change to writes:** keep swap/pick/pack/ship direct write behavior intact during the first extraction; document rather than silently “fix” selection or allocation semantics.

### Candidate Phase 3C wrappers after verification

- `commit_intake_batch` for intake finalization;
- `next_book_copy_sku` or one selected SKU RPC;
- `create_label_batch`, `get_active_label_batch`, `mark_label_batch_printed`, and `release_label_batch`.

### Candidate Phase 3D/3E wrappers after lifecycle design

- `get_picking_queue` after queue ownership is confirmed;
- `can_member_request_swap` and `mark_book_kept` after returns/member-cycle policy is agreed;
- shipment creation functions only after the `reserved` conflict is fully resolved.

## 9. Required Staging Verification Pack

Before wrapping, repairing, retiring, or adding callers for a database RPC:

1. Export its exact function definition, signature, owner, grants, security mode, `search_path`, volatility, and dependency graph.
2. Confirm all callers: application, scheduled jobs, Edge Functions, database triggers, and external systems.
3. Run one authorized and one unauthorized invocation against non-production fixtures; capture affected rows and return/error shapes.
4. For write-capable functions, simulate retry and concurrent invocations.
5. For shipment/pick functions, verify the active-copy assignment index remains satisfied and no copy can be allocated twice.
6. For selection functions, verify in-flight copies and previously received titles are excluded according to approved policy.
7. For label/intake/SKU functions, verify partial failures leave no orphaned or inconsistent state.
8. For security-sensitive functions, inspect logs/output to ensure tokens and service credentials cannot be exposed.

## 10. Exactly What Phase 3B Should Do First

Phase 3B should start with a **behavior-preserving fulfillment service extraction around the two repository-proven RPC calls**:

1. Create a server-side fulfillment service boundary for getting a shipment pick list and selecting swap candidates.
2. Move only the existing router orchestration into that service; retain route names, inputs, outputs, direct Supabase helper behavior, and UI behavior.
3. Add focused contract tests for both RPC call payloads, response normalization, operator authorization, and failure handling.
4. Do **not** adopt, repair, or call `create_shipment_with_books`, `create_shipments_for_ship_date`, label-batch RPCs, intake-batch RPCs, or SKU RPCs in this first slice.
5. Keep customer-facing, WordPress, public signup, marketing, valuation/resale, and donation-model work outside the Phase 3B implementation scope.

This makes the first extraction small, reversible, and grounded in currently executed behavior while Phase 3A repair decisions and database-source verification continue.