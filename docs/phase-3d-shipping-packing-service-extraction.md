# Phase 3D: Shipping, Packing, and Shipment Service Extraction

**Status:** Implemented as a behavior-preserving extraction. No API contract, route name, input schema, output, UI behavior, database schema, migration, RPC, status value, business rule, webhook, or EasyPost behavior was changed.

## 1. What Moved

New fulfillment services now own the existing packing, shipping, and shipment orchestration.

### Packing service

`server/domains/fulfillment/services/packing.service.ts` owns:

- `packing.list` shipment/member/address query and result assembly;
- `packing.markPacked` validation of shipment and scanned books;
- the existing direct shipment PATCH to `packed`.

### Shipping service

`server/domains/fulfillment/services/shipping.service.ts` owns:

- `shipping.list` shipment/member/address queue assembly;
- `shipping.markShipped`, including copy, shipment-book, shipment, member-history, and EasyPost calls;
- `shipping.saveReturnTracking`, including return lookup, return tracking PATCH, and EasyPost registration;
- the existing EasyPost tracker-registration behavior, including swallowed registration errors and existing log output.

### Shipments service

`server/domains/fulfillment/services/shipments.service.ts` owns:

- `shipments.list` and `shipments.listAll` member enrichment;
- `shipments.byId` shipment/member/address/book/title assembly;
- `shipments.updateTracking` direct shipment PATCH and error text;
- `shipments.updateStatus`, including its existing prohibition on `shipped` status updates outside `shipping.markShipped`.

The packing and shipping routers, and the legacy-composed shipments router, now retain only input validation, operator authorization, service invocation, and result passthrough.

## 2. What Did Not Move

This phase deliberately did not change or move:

- `create_shipment_with_books` or `create_shipments_for_ship_date`;
- the unresolved `reserved` status conflict;
- selection, allocation, active-assignment, member-cycle, or return-cycle behavior;
- the EasyPost tracking webhook;
- EasyPost error swallowing, notification behavior, or `notify_shipment_shipped` security concerns;
- order/shipment number generation;
- member-book-history uniqueness policy;
- picking, labels, intake, QC, stock, returns, donations, customer-facing, or WordPress work.

No transaction was introduced. The existing direct write order remains intact.

## 3. Behavior Verification

Focused tests were added in `server/domains/fulfillment/services/shipping-packing.service.test.ts`.

They verify:

- `packing.markPacked` validates its existing prerequisites and patches `packed`;
- `shipping.markShipped` preserves the copy → shipment books → shipment write order, `in_transit` copy state, member-history creation, and EasyPost tracker registration;
- `shipping.saveReturnTracking` preserves return tracking update followed by EasyPost registration;
- `shipments.byId` preserves member, address, book, and title assembly;
- `shipments.updateTracking` defaults carrier to USPS, and `shipments.updateStatus` still rejects a direct `shipped` update.

Validation completed:

```text
npm run check
PASS

npm test -- --run server/domains/fulfillment/services/shipping-packing.service.test.ts
PASS — 1 file, 5 tests
```

The tests mock Supabase and EasyPost; no live database or carrier calls were made.

## 4. Known Risks Intentionally Not Fixed

- Shipping, packing, and history updates are still independent direct writes rather than a transaction.
- A member-history POST failure is still logged without rolling back the shipment, exactly as before.
- EasyPost registration failures are still swallowed and reported as `false`, exactly as before.
- Existing packing/shipping status rules, `in_transit` behavior, and active assignment semantics remain unchanged.
- The app still uses legacy-generated shipment/order numbers elsewhere.
- `create_shipment_with_books` and `create_shipments_for_ship_date` remain blocked from use pending Phase 3A repair decisions.
- The webhook continues to have its existing direct-write and idempotency risks; it was not modified.

## 5. Rollback Plan

This is reversible with no database work:

1. Restore the previous procedure bodies in `packing.router.ts`, `shipping.router.ts`, and the legacy shipments router.
2. Remove the three new fulfillment service modules and their focused test.
3. Re-run the focused test and `npm run check`.

There are no migrations, SQL changes, RPC edits, schema changes, or data changes to reverse.

## 6. Recommended Next Phase

Proceed to **Phase 3E: Returns and Member-Cycle Design** as a design/verification phase. It should define the one-open-cycle rule, return handling gate, title-repeat policy, and the relationship between existing shipments, returns, bundles, `shipment_books`, and `member_book_history` before any lifecycle or schema implementation work.