# Phase 2H: Backend Architecture Cleanup Plan

**Status:** Planning only. This report consolidates Phase 1 through Phase 2G. No runtime code, migrations, database state, API behavior, UI behavior, or files outside this report were changed.  
**Scope boundary:** The Book Nest internal operations backend only. Customer portal, public signup, WordPress, and marketing work remain explicitly out of scope.

## 1. Executive Summary

The backend is more mature than originally assumed. The first-pass inventory plan correctly identified important operational invariants, but Phase 2D–2G showed that the live Supabase implementation already contains most of the operational foundation: bins, age-tier and theme catalogs, intake batches, status history, picking structures, shipment selection, label workflows, SKU sequencing, and several integrity indexes.

The governing direction is **reuse and extend first**. Future work should focus on safely consolidating backend boundaries, validating stale RPCs, and filling genuine integrity gaps—not rebuilding inventory operations as parallel tables and workflows.

The highest-priority blockers are database security and fulfillment correctness: RLS is disabled on almost all operational tables; `notify_shipment_shipped` contains a hardcoded token; `create_shipment_with_books` writes an invalid `reserved` status; and `create_shipments_for_ship_date` may inherit that unsafe path. These should be reviewed before changing inventory lifecycle behavior.

## 2. Confirmed Current Backend Architecture

### Application layer

- The server has already been split from the former monolithic router into domain router composition.
- Phase 1B established an application-level protected operator/admin procedure boundary for internal operations, while retaining public health and necessary legacy acquisition routes.
- The UI’s browser PIN can remain a convenience lock, but authorization is enforced at the server procedure boundary rather than by the PIN.
- Supabase remains the operational database layer; EasyPost, ISBN lookup/classification, barcode scanning, labels, intake, picking, shipping, returns, members, and donations remain within the intended backend scope.

### Database and RPC layer

The live schema exposes a substantial public operations model, including:

- Catalog/taxonomy: `age_tiers`, `themes`, `tags`, `subscription_tiers`.
- Inventory/location: `book_titles`, `book_copies`, `bins`, bin/tag mappings, and copy section fields.
- Intake/SKU: `intake_batches`, `intake_batch_items`, `sku_counters`, and SKU-generation RPCs.
- Fulfillment: `shipments`, `shipment_books`, `picking_batches`, `picking_queue`, selection/pick-list RPCs, and potentially parallel `bundles` / `bundle_items`.
- Returns/history: `returns`, `return_books`, `member_book_history`, `status_history`, and swap/selection logs.
- Labels: existing label-batch RPCs plus copy label state and batch linkage.

## 3. Official Structures to Keep and Reuse

| Structure | Direction | Why |
| --- | --- | --- |
| `bins` | Reuse as the location master | It already captures bin identity, placement/capacity signals, age group, theme, and active state. Do not build parallel `storage_locations`. |
| `status_history` | Evaluate and reuse first | It is the existing copy-status audit trail; assess it before proposing `inventory_moves`. |
| `intake_batches`, `intake_batch_items` | Reuse | They are the existing intake aggregate and work-item model. |
| Label-batch workflows/RPCs | Reuse after source review | Existing printing behavior and copy label linkage should be extended, not recreated. |
| `sku_counters` and SKU generators | Reuse and consolidate | The database already has SKU sequencing; select one authoritative path rather than introduce another. |
| `picking_queue`, `picking_batches` | Reuse where safe | They are existing durable picking structures and must be reconciled with allocation behavior. |
| `get_shipment_pick_list`, `select_books_for_shipment` | Preserve and review | They are existing selection/pick interfaces that should be improved only after source and lock behavior are known. |
| `age_tiers`, `themes`, `subscription_tiers` | Reuse as canonical catalog candidates | Existing catalog tables are a better base than parallel taxonomy/plan tables. |
| `shipment_books` active assignment constraint | Preserve | `idx_unique_active_copy_assignment` already protects a portion of active copy allocation. |

## 4. Structures to Extend

### Location and inventory

- Extend `bins` only if it cannot represent the required canonical `age_tier`, theme, bin, section, and display-code model.
- Decide whether a section belongs to a bin, a child location, or the copy itself before changing the current copy-level section representation.
- Extend `status_history` only after verifying whether it can record actor, reason, operation correlation, and location movement; add a companion movement record only if those needs cannot be met cleanly.

### Fulfillment and circulation

- Extend or clarify `shipment_books` / `picking_queue` before adding a new allocation table. The existing active-allocation index is significant, but its `scanned_at IS NULL` definition must be aligned with the real lifecycle.
- Consider `member_cycles` only after determining whether `bundles` / `bundle_items`, shipments, and returns already represent a reliable single open circulation cycle per member.
- Extend `member_book_history` or use it within a transaction to enforce the operator rule against duplicate titles for the same member.

### Taxonomy and plans

- Use `age_tiers` and its related fields as the primary canonical age source after reviewing all legacy string fields and the custom `public.age_group` type.
- Use `subscription_tiers` as the plan catalog; establish `cozy_nest` with `book_count = 6` through a later approved compatibility plan, not an application-only parallel definition.

## 5. Suspected Legacy or Stale Structures

These remain review candidates only. Do not delete, quarantine, or bypass them until source usage, data dependencies, and owner intent are established.

| Candidate | Concern / review question |
| --- | --- |
| `bundles`, `bundle_items` | May be a legacy or parallel fulfillment/circulation model beside shipments. Determine whether any live process depends on them. |
| `book_status` enum | Its values do not align with the richer `book_copies.status` lifecycle; determine its active relations and callers. |
| Archive-prefixed bin/tag structures | May preserve historical migration decisions or still support reporting. |
| `bin_code_migration` and duplicate taxonomy mappings | Could be active compatibility infrastructure or stale data normalization artifacts. |
| `compute_base_disposition` | Appears valuation/resale-oriented; do not conflate it with the proposed circulation disposition without source review. |
| String age/theme/tier fields beside catalogs | May be compatibility fields or drift sources; map them before any normalization work. |

## 6. Dangerous or Broken Paths

### Shipment creation status conflict

`create_shipment_with_books` appears stale or broken because it writes:

```text
book_copies.status = reserved
```

The current `book_copies.status` check constraint does not allow `reserved`, and no trigger was found that converts it to another legal status. Treat this RPC as unsafe until its deployed source, callers, and production behavior are verified in a non-production environment.

### Bulk ship-date creation risk

`create_shipments_for_ship_date` may also be unsafe because it calls `create_shipment_with_books`. Do not broaden usage, refactor callers, or use it for new workflows until the underlying status conflict is resolved.

### Allocation and duplicate picking risk

`idx_unique_active_copy_assignment` already protects against one class of duplicate active assignment:

```text
shipment_books(book_copy_id) WHERE scanned_at IS NULL
```

This must be respected by every selection, pick, release, cancellation, return, and direct-update path. Future code should centralize these transitions in a transaction/RPC or domain service rather than update copy status independently.

### Duplicate-title rule gap

`member_book_history` is unique on `(member_id, book_title_id, shipment_id)`. This is not strict enough for “never repeat a title,” since the same member/title can appear in a later shipment. The exact business policy and exception process must be approved before enforcing a new constraint or allocation guard.

### Donations uncertainty

The `donations` relation was not found through the captured metadata surfaces. Treat the donation route/data model as unresolved; do not create a replacement table or alter integration code until PostgreSQL metadata identifies its actual storage or confirms its absence.

## 7. Security Cleanup Needs

1. **Database authorization:** RLS is disabled on nearly all operational tables. Plan a dedicated RLS/grants review after first confirming service-role/server boundaries and required internal roles.
2. **Application boundary:** Retain and test Phase 1B `operatorProcedure` protection on every retained ops read and mutation. Public procedures should be restricted to health and explicitly necessary legacy acquisition paths.
3. **Hardcoded secret:** `notify_shipment_shipped` contains a hardcoded token. Treat it as a security issue: review function security mode and grants, move secret management to an approved secure configuration mechanism, rotate the token if appropriate, and add an audit trail for outbound notifications.
4. **RPC execution permissions:** Export and review function grants, owners, `SECURITY DEFINER` / invoker mode, and `search_path` for shipment, label, intake, SKU, and pick RPCs.
5. **Webhook resilience:** Confirm whether an event-idempotency ledger exists. If none exists, a future `webhook_events` design remains a genuine need before expanding webhook processing.

## 8. Database Cleanup Needs

- Capture complete PostgreSQL metadata: constraints, indexes, RLS, grants, triggers, view definitions, function definitions, dependencies, and all schemas.
- Create a source-verified mapping of every existing copy status and `public.age_group` value to the Phase 2B canonical model.
- Design `thirteen_plus` support. It does not exist in the current age-group enum or observed bin constraints and must be introduced only through an approved compatibility migration.
- Confirm the authoritative plan record and legacy plan mappings before enforcing `cozy_nest` / six-book behavior.
- Validate `status_history` and existing selection/picking tables before introducing any audit, movement, allocation, or member-cycle tables.
- Resolve the missing donation model before planning donation intake, donation-out disposition, or reporting changes.
- Profile and remediate existing data exceptions before adding stricter constraints, particularly active shipment overlap, title history duplicates, null/duplicate ISBNs, and legacy statuses.

## 9. Backend Code Cleanup Needs

- Keep the Phase 1 domain router structure and clarify ownership: inventory, members, fulfillment, returns, and donations should remain separate domains with shared, tested cross-domain services only where transitions require them.
- Extract operational orchestration from routers into domain services incrementally, starting with the highest-risk paths: shipment creation/selection, pick/pack/ship transitions, intake commit, and return processing.
- Route all sensitive inventory writes through source-reviewed RPCs or explicit server-side transactions. Remove or retire direct status updates only after behavior parity is proven.
- Establish one authoritative copy lifecycle translation layer for legacy statuses, but do not activate it until migration and API compatibility work is approved.
- Add regression coverage for operator authorization, allocation race conditions, duplicate-title prevention, in-flight pick exclusion, return gate enforcement, and label batch transitions.
- Preserve EasyPost integration, ISBN classification, barcode scanning, printing, intake, picking, shipping, returns, member management, and donation logging boundaries while the underlying implementation is stabilized.

## 10. What Should Not Be Built

Do not build parallel replacements for functionality that already exists, unless source review proves the current structure cannot meet the requirement:

- A new `storage_locations` table — reuse `bins`.
- A new `inventory_moves` table — evaluate `status_history` first.
- New intake tables — reuse `intake_batches` and `intake_batch_items`.
- New print-job tables — start from label-batch workflows and backing structures.
- A new SKU counter/generator — reuse `sku_counters` and existing generators.
- A new plan catalog — reuse `subscription_tiers`.
- A customer portal, WordPress integration, public signup, welcome pages, or marketing features — all remain out of scope.

## 11. What Genuinely Still Needs to Be Built

These are gaps to design and implement only after the stale-RPC/security review and metadata validation:

- A verified canonical age-tier extension plan including `thirteen_plus`.
- An authoritative, transaction-safe allocation/reservation model if `shipment_books` and `picking_queue` cannot be proven sufficient.
- A guaranteed member/title duplicate-prevention mechanism with a documented exception path.
- A reliable one-open-cycle-per-member model, potentially `member_cycles`, if existing bundles/shipments/returns cannot enforce it.
- Webhook event idempotency, if no current ledger exists.
- A donation data-model decision and implementation after its current absence/visibility issue is resolved.
- Cross-domain audit correlation only if `status_history`, selection logs, and swap history cannot be extended to provide it.
- Admin UX improvements after backend transitions, source-of-truth status, and authorization are stable.

## 12. Proposed Implementation Phases After 2H

### Phase 3A: Stale RPC and Security Cleanup Plan

Read and test the source/dependencies of shipment, selection, label, intake, SKU, and notification RPCs. Resolve the invalid `reserved` path design, map callers of `create_shipments_for_ship_date`, inventory function permissions, RLS/grants strategy, and the `notify_shipment_shipped` hardcoded token. Produce a behavior-preserving implementation plan before code changes.

### Phase 3B: Domain Service Extraction

Extract orchestration from domain routers into tested server-side services while retaining route names, input/output shapes, Supabase, and existing business behavior. Prioritize boundaries around inventory, fulfillment, returns, and members.

### Phase 3C: Inventory Workflow Cleanup

Implement approved lifecycle/status normalization, safe intake/QC/label/stock/move transitions, bin/section handling, and scanner-friendly inventory writes. Reuse bins, intake, status history, label batches, and SKU facilities.

### Phase 3D: Fulfillment and Picking Cleanup

Make allocation, selection, pick, pack, ship, release, and in-flight exclusion transactional and mistake-resistant. Preserve the active-assignment index and reuse `picking_queue` and source-reviewed selection RPCs where safe.

### Phase 3E: Returns and Member-Cycle Design

Define one active circulation cycle per member, return resolution gates, duplicate-title enforcement, and exception handling. Implement only after determining whether existing bundles/shipments/returns can support it.

### Phase 3F: Donations Model Decision

Resolve the missing/hidden donations relation, choose the authoritative donation intake and donated-out flow, and then design any required additive data model and operator workflow.

### Phase 3G: 13+ Support Design

Approve the taxonomy, data mapping, plan, bin, member, title, and reporting implications of `thirteen_plus`; then produce an additive migration and compatibility plan.

### Phase 3H: Dashboard/Admin UX Cleanup

Only after backend lifecycle and authorization rules are reliable, streamline the owner/operator dashboard for intake, inventory placement, picking, packing, shipping, returns, labels, members, and donations. Do not build customer-facing or WordPress features.

## 13. Risks and Rollback Notes

| Risk | Mitigation / rollback stance |
| --- | --- |
| Replacing mature database structures with parallel tables | Reuse first; require source/metadata evidence before adding a replacement. |
| Stale shipment RPC corrupts or rejects copy lifecycle state | Do not expand its usage; verify in non-production; preserve a reversible code path until behavior is proven. |
| RLS enablement breaks internal operations | Inventory every server/client role and RPC grant first; stage policies in a non-production environment with operator regression tests. |
| Stricter title-history constraint blocks existing data | Profile exceptions, define business-approved handling, backfill/resolve data, then add enforcement. |
| Age-tier enum change impacts current rows and integrations | Use an approved additive compatibility plan; map legacy display/string forms before enforcing canonical values. |
| Status/history consolidation loses audit data | Keep existing history intact; use additive fields/tables and backfill only after validation. |
| Donations relation is hidden rather than absent | Do not create a duplicate replacement until full schema metadata and route dependencies are verified. |
| External shipping/webhook secret exposure | Rotate/reconfigure secrets and validate outbound integrations in a controlled environment before production rollout. |

## 14. Recommended Next Step

Begin **Phase 3A: Stale RPC and Security Cleanup Plan** as a read-only source and dependency review. It should produce a precise, owner-approved repair plan for `create_shipment_with_books`, `create_shipments_for_ship_date`, `notify_shipment_shipped`, label/intake/SKU/picking RPC security, RLS/grants, and any hidden dependencies before any runtime or database change is attempted.