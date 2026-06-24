# Phase 3B: Fulfillment Service Extraction

**Status:** Implemented as a behavior-preserving refactor. No route names, input schemas, outputs, UI behavior, Supabase schema, RPC definitions, migrations, status values, or business rules were changed.

## What Moved

A new fulfillment service module now owns the two currently executed Supabase RPC workflows identified in Phase 3A.5:

- `getShipmentPickList`
- `swapShipmentBook`

The service is located at:

- `server/domains/fulfillment/services/picking.service.ts`

The picking router remains the public tRPC boundary. Its `operatorProcedure` authorization and Zod validation schemas are unchanged; each procedure now delegates to its corresponding service function and returns that result unchanged.

### Shipment pick-list retrieval

`getShipmentPickList` moved intact into the service, including:

1. POST to `/rpc/get_shipment_pick_list` with the unchanged payload `{ p_shipment_id }`.
2. The existing RPC error text: `Failed to get shipment pick list: …`.
3. Copy-location lookup through `book_copies`.
4. Existing bin/section/location response enrichment and fallback behavior.
5. The exact returned row shape, including preservation of original fields.

### Swap candidate selection

`swapShipmentBook` moved intact into the service, including:

1. Loading existing shipment-book assignments.
2. The unchanged POST payload to `/rpc/select_books_for_shipment`.
3. Existing candidate filtering, including assigned-copy exclusion and seasonal-title filtering.
4. The current direct update sequence for `shipment_books`, old/new `book_copies`, and `shipment_book_swaps`.
5. Existing status values (`ready_for_picking`, `in_house`) and timestamps.
6. Existing error messages and returned updated shipment-book object.

This extraction intentionally did **not** add a transaction, reservation status, new RPC, locking rule, or state-machine change. Those remain Phase 3D concerns after the stale-RPC safety work is resolved.

## What Did Not Move

The following remains unchanged in `picking.router.ts`:

- procedure authorization (`operatorProcedure`);
- all public tRPC names and namespaces;
- Zod input schemas and defaults;
- daily-order retrieval;
- app-layer book suggestion/scoring;
- pick confirmation;
- batch pick-list assembly;
- existing Supabase helper usage outside the two extracted workflows.

No existing label, intake, packing, shipping, returns, member, EasyPost, or donations code moved in this phase.

## Files Changed

| File | Change |
| --- | --- |
| `server/domains/fulfillment/picking.router.ts` | Replaced the two procedure bodies with thin service calls; retained validation and authorization. |
| `server/domains/fulfillment/services/picking.service.ts` | New home for pick-list retrieval, swap candidate selection, RPC invocation, enrichment, error translation, and existing direct swap writes. |
| `server/domains/fulfillment/services/picking.service.test.ts` | New focused behavior tests. |
| `docs/phase-3b-fulfillment-service-extraction.md` | This implementation record. |

## Behavior Verification

Focused tests cover both extracted workflows:

- Pick-list retrieval preserves its RPC request payload, location enrichment, and RPC error text.
- Swap candidate selection preserves its RPC request payload, shipment-book patch payload, direct-write order, return shape, and missing-assignment error.

Validation results:

```text
npm run check
PASS

npm test -- --run server/domains/fulfillment/services/picking.service.test.ts
PASS — 1 file, 5 tests
```

The complete `npm test -- --run` suite executed all offline tests successfully, including the new tests and authorization tests. Three existing tests in `server/supabase.test.ts` failed only because this environment does not provide `SUPABASE_URL` or `SUPABASE_ANON_KEY`; they attempt a live Supabase connection and could not construct a URL. This extraction did not change those tests or the connection configuration.

## Rollback Plan

The refactor is reversible without database work:

1. Move the two service function bodies back into `picking.router.ts`.
2. Remove the service import and the new service/test files.
3. Re-run the focused test file and type check.

There are no data migrations, RPC edits, API contract changes, UI changes, or schema changes to roll back.

## Follow-Up Boundaries

Phase 3B deliberately does not resolve the known stale/shipping risks documented in Phase 3A and Phase 3A.5:

- `create_shipment_with_books` remains blocked because of the invalid `reserved` status write.
- `create_shipments_for_ship_date` remains restricted pending dependency verification.
- Label, intake, SKU, queue, and return RPCs remain unwrapped until their source/security behavior is verified.
- Direct swap writes remain behavior-identical and non-transactional; no allocation behavior was changed.

The next safe implementation slice is further service extraction only after the Phase 3A verification gates for the relevant workflow have been satisfied.