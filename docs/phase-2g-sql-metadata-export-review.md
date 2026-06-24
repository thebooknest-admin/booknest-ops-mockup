# Phase 2G: SQL Metadata Export Review

**Status:** Manual read-only SQL metadata review complete.  
**Source:** [Phase 2G manual SQL results](generated/phase-2g-manual-sql-results.md)  
**Scope:** Documentation and reconciliation only; no database query was run by this repository task, and no schema, data, runtime, UI, or API behavior was changed.

## 1. Executive Summary

The manually collected PostgreSQL metadata confirms that the live Supabase schema is more mature than originally assumed. It already provides core operations structures for bins, age tiers, themes, intake batching, picking, status history, subscription tiers, label batches, and SKU generation.

The future inventory migration should therefore extend and reconcile the existing system rather than recreate it. In particular, `bins`, `status_history`, `intake_batches`, `intake_batch_items`, label-batch workflows, and SKU RPCs are existing assets that should be preserved unless deeper source review identifies a specific defect.

Several risks must be resolved before writing migrations: no `thirteen_plus` support exists, RLS is disabled on almost all operational tables, the `donations` relation was not found, and `create_shipment_with_books` appears inconsistent with the current copy-status constraint.

## 2. Relation and Model Findings

### Existing structures to reuse

- **Bins:** Reuse `bins` instead of creating a parallel `storage_locations` table. Extend it only if the canonical location model requires fields or constraints it cannot support.
- **Status history:** Evaluate `status_history` before creating `inventory_moves` or a separate inventory audit trail. It may already satisfy part of the required movement/history model.
- **Intake:** Reuse `intake_batches` and `intake_batch_items` as the base for receiving and intake workflows.
- **Labels:** Reuse existing label-batch tables and RPCs after reviewing their source and dependencies.
- **SKU generation:** Reuse the existing SKU counters and SKU-generation RPCs. Avoid introducing competing SKU sequencing.

### Existing maturity indicators

The reviewed metadata includes primary keys, foreign keys, status checks, location constraints, picking structures, shipment and return relationships, and operational indexes. This materially reduces the amount of new schema that should be proposed in a future migration.

## 3. Types, Enums, and Canonical Taxonomy Gap

### `public.age_group`

The current age-group enum values are:

- `Hatchlings`
- `Fledglings`
- `Soarers`
- `Sky Readers`

No `thirteen_plus` / `13+` support exists yet. Adding canonical support will require an owner-approved migration strategy that considers enum evolution, existing lower-case bin constraints, and any stored age-group fields.

### Other observed enums

- `book_status`: `in_house`, `on_swap`, `damaged`, `retired`
- `bundle_status`: `generated`, `picking`, `picked`, `shipped`
- `missing_problems`: `marked_delivered_not_received`, `tracking_not_updated`, `return_to_sender`, `lost_in_transit`, `other_not_sure`

These must be reconciled with the Phase 2B canonical copy lifecycle before any status migration is designed.

## 4. Keys, Constraints, and Allocation Safety

### Important relationships

The existing schema links book titles to age tiers and themes, copies to titles, shipment books to shipments/titles/copies, returns to members and shipments, return books to returns and copies, and status history to book copies.

### Existing active-allocation safeguard

The following partial unique index exists and must be respected by any future allocation or reservation RPC:

```text
idx_unique_active_copy_assignment:
shipment_books(book_copy_id)
WHERE scanned_at IS NULL
```

This is an important existing safeguard against multiple active shipment assignments for a copy. Future pick, release, pack, and shipment transitions must preserve its intended semantics rather than bypass it with direct updates.

### Duplicate-title safeguard gap

`member_book_history` is unique on:

```text
member_id, book_title_id, shipment_id
```

Because `shipment_id` is included, this is not strict enough to guarantee the rule “a member never receives the same title twice.” A future design needs an explicit decision on whether the rule is permanent, time-bound, or exception-based, then a corresponding database constraint or transactional allocation check.

## 5. Copy Status and Function Review

### Current copy-status constraint

The `book_copies.status` check permits:

```text
in_house, damaged, retired, shipped, returned, pending_qc,
pending_stock, pending_label, donated_lfl, lost, withdrawn, in_transit
```

### `create_shipment_with_books` inconsistency

`create_shipment_with_books` appears stale or broken: it attempts to write

```text
book_copies.status = reserved
```

but `reserved` is not allowed by the current `book_copies.status` check constraint. No trigger was found that converts `reserved` into another allowed status. The function source, deployment version, and production call path must be verified before reuse, repair, or replacement.

This is also a warning against using direct status updates outside explicit transaction boundaries; they can bypass allocation safety or leave copies in a state that the schema rejects.

## 6. Indexes and Location Support

Important existing indexes include bin-code uniqueness, copy SKU uniqueness, copy status/label/ISBN/bin indexes, label-batch lookup, and section-aware picking support.

The bin age-group check accepts canonical lower-case values for four tiers:

- `hatchlings`
- `fledglings`
- `soarers`
- `sky_readers`

Section codes are constrained to `^[A-Z]{1,3}$`. This provides a useful base for the canonical bin and section location model, but does not yet include the fifth age tier.

## 7. Security Review

### RLS

RLS is disabled on almost all operational tables. The only policy found was `event_signups` — `Allow all for anon`.

The Phase 1B application-level operator procedure boundary remains necessary, but database-level authorization requires a future dedicated security cleanup. No future client exposure should be assumed safe merely because an application route is protected.

### Function security concern

`notify_shipment_shipped` has a security concern because it contains a hardcoded token. This should be addressed in a future security cleanup: move secret handling out of function source or into an approved secure configuration path, rotate the exposed token as appropriate, and review function execution privileges.

## 8. Donations Visibility Review

The metadata relation search for `donations` returned no rows. This matches the earlier PostgREST/OpenAPI visibility issue but does not conclusively prove there is no donation data model under another name or schema.

Before any donations migration or routing change, obtain a complete PostgreSQL metadata export and determine whether the relation is absent, inaccessible, unexposed, renamed, or defined outside the inspected schema.

## 9. Revised Migration Direction

| Area | Direction | Reason |
| --- | --- | --- |
| Storage locations | Reuse and extend `bins` | Existing bin, age-group, theme, capacity, and placement structure already exists. |
| Inventory movement | Evaluate `status_history` first | Avoid duplicate audit/movement systems without understanding current history semantics. |
| Intake | Reuse `intake_batches` and `intake_batch_items` | Existing batch model should anchor receiving/intake work. |
| Label printing | Reuse label-batch RPCs | Existing operational workflow should be retained where sound. |
| SKU sequencing | Reuse SKU RPCs and counters | Prevent divergent SKU generators. |
| Allocation/reservation | Extend only after source review | Existing partial unique active-assignment index is a critical safeguard. |
| Age tiers | Plan a controlled extension | `thirteen_plus` does not exist in current schema support. |
| Donations | Investigate before design | No `donations` relation was found. |
| Database authorization | Future security cleanup | Operational-table RLS is largely absent. |

## 10. Migration Blockers and Required Verification

Before writing migration SQL:

1. Obtain a complete PostgreSQL metadata export, including function definitions, function security modes, grants, triggers, ownership, and all schemas.
2. Review and test `create_shipment_with_books` in a non-production environment to resolve its invalid `reserved` write.
3. Verify the semantics of `status_history`, especially whether it records location changes, allocations, and return/withdrawal reasons.
4. Locate the donation model or confirm its absence and decide the desired data ownership.
5. Obtain owner approval for the `thirteen_plus` rollout and legacy value mapping.
6. Decide the intended lifetime and exception handling for the “never repeat a title” member rule.
7. Complete the dedicated database-security review, including the hardcoded token in `notify_shipment_shipped`.

## 11. Recommended Next Phase

**Phase 2H: Backend Architecture Cleanup Plan.**

Phase 2H should use this reconciliation to plan domain ownership, router/service boundaries, direct-write removal, RPC source review, authorization enforcement, and a staged path to preserve the mature existing Supabase operations model while eliminating unsafe or stale paths.