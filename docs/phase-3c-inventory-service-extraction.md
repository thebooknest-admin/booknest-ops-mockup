# Phase 3C: Inventory Service Extraction

**Status:** Implemented as a behavior-preserving extraction. No API names, input schemas, outputs, UI behavior, database schema, migrations, RPCs, business rules, statuses, direct-write ordering, or Supabase structures were changed.

## 1. What Moved

The existing legacy-composed inventory procedures now delegate to service modules under `server/domains/inventory/services/`. The public tRPC namespace and `operatorProcedure` boundary remain in the legacy router, so existing client calls are unchanged.

### Inventory service

`inventory.service.ts` now owns:

- inventory summary retrieval;
- title, copy, and bin list retrieval;
- book-detail assembly, including title/tag/copy reads and location formatting;
- `inventory.updateCopy`, including its existing section validation, condition storage, status patch, and label-status side effects.

### Labels service

`labels.service.ts` now owns:

- pending-label retrieval, title enrichment, ISBN fallback, and location formatting;
- `labels.markPrinted`’s existing two direct copy PATCH requests, in the original order.

### Intake service

`receive.service.ts` now owns the full existing `receive.addBook` orchestration:

- theme/tag derivation;
- tag lookup/creation;
- title lookup, update, or creation;
- bin/section selection;
- application-side SKU gap scanning and generation;
- pending-QC copy creation;
- new-title cleanup if copy creation fails.

It intentionally does **not** call `commit_intake_batch`, `next_book_copy_sku`, `generate_sku`, or any other Supabase RPC.

### QC and stock service

`workflow.service.ts` now owns:

- QC queue/count, pass/fail/pass-all operations;
- stock queue/count/bin list, confirm-placed, and confirm-all operations;
- existing direct copy status, label status, condition, QC, section, and stock timestamp behavior.

## 2. Router Boundary

The current router still owns:

- `operatorProcedure` authorization;
- the exact existing Zod input schemas and defaults;
- the same procedure names and namespaces;
- returning each service result without reshaping it.

The service layer owns Supabase queries, direct REST calls, result assembly, existing error text, enrichment, and the same status transitions previously present in router bodies.

## 3. What Did Not Move

This phase deliberately leaves the following legacy inventory paths untouched:

- `sectionBackfillPreview` and `backfillSections`;
- `updateBookTitle`, including its age-change-driven SKU and bin synchronization;
- `inTransit` reporting;
- ISBN lookup/classification;
- the live Supabase intake, label-batch, SKU, picking, and allocation RPCs;
- all customer-facing, WordPress, acquisition, donations, shipping, returns, and fulfillment workflows.

Those paths either have broader status/location consequences or are governed by the unresolved RPC/source-verification work. Moving them now would expand the extraction into a lifecycle or schema cleanup, which is outside Phase 3C.

## 4. Behavior Verification

Focused tests were added in `inventory-workflows.service.test.ts`.

They verify that the extracted services preserve:

- `labels.markPrinted` two-PATCH ordering and its `printed` then `pending_stock` behavior;
- `receive.addBook`’s title-then-copy creation sequence, app-side SKU format, `pending_qc` status, condition, and pending label state;
- QC pass and fail status/label transitions;
- stock placement’s `in_house` update and section normalization;
- `inventory.updateCopy` terminal-status label behavior.

Validation completed:

```text
npm run check
PASS

npm test -- --run server/domains/inventory/services/inventory-workflows.service.test.ts
PASS — 1 file, 5 tests
```

No live database calls were made by the focused tests; Supabase helpers are mocked.

## 5. Known Risks Intentionally Not Fixed

This is an organizational change only. The following known risks remain unchanged:

- direct writes remain non-transactional and preserve their existing order;
- condition tracking remains stored and exposed;
- application-side SKU generation still scans existing copy rows and has the same concurrency risk;
- current age-group normalization behavior remains exactly as it was; no `thirteen_plus` support is added;
- bin/section behavior and current canonical-bin derivation remain unchanged;
- labels still bypass the unverified database label-batch RPCs;
- intake still bypasses `commit_intake_batch` and SKU RPCs;
- current QC failure status remains `donated_lfl`;
- no status values were added, normalized, repaired, or retired.

## 6. Rollback Plan

This extraction is reversible without any database work:

1. Restore the extracted procedure bodies into `server/domains/_legacy/legacy-app-router.ts`.
2. Remove the service imports and `server/domains/inventory/services/` files.
3. Re-run the focused service test and `npm run check`.

No data was changed, no migrations exist, and no RPC/database definition changed.

## 7. Recommended Next Phase

Proceed to **Phase 3D: Fulfillment and Picking Cleanup** only after preserving the Phase 3A/3A.5 safety boundaries:

- do not use `create_shipment_with_books` or `create_shipments_for_ship_date` until the `reserved` conflict is resolved;
- retain the existing active-assignment index as an integrity requirement;
- begin with a behavior-preserving service boundary and tests, not a status or schema redesign.