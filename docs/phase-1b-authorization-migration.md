# Phase 1B: Ops Authorization Boundary Migration Diff

**Date:** 2026-06-23  
**Scope:** server-side tRPC authorization only. No UI, database schema, route name, procedure input, or success-output changes.

## Audit result before this change

All retained operations procedures were declared with `publicProcedure`. The browser PIN gate did not provide server-side authorization. The pre-existing `adminProcedure` was only used by `system.notifyOwner`.

## Authorization model after this change

`server/_core/trpc.ts` now exposes `operatorProcedure`. It requires:

1. an authenticated request context; otherwise it throws `UNAUTHORIZED` with the existing unauthenticated message; and
2. an authenticated user with `role === "admin"`; otherwise it throws `FORBIDDEN` with the existing not-admin message.

`adminProcedure` remains as a compatibility alias for `operatorProcedure`. The existing identity model calls owner/operators `admin`; no database or role-model change was made.

## Exact procedure protection diff

### Converted from `publicProcedure` to `operatorProcedure`

| Domain | Procedures |
| --- | --- |
| Dashboard | `dashboard.stats` |
| Members | `members.list`, `members.byId`, `members.requestBundle`, `members.create` |
| Inventory | `inventory.summary`, `inventory.bookTitles`, `inventory.bookCopies`, `inventory.bins`, `inventory.sectionBackfillPreview`, `inventory.backfillSections`, `inventory.getBookDetail`, `inventory.updateCopy`, `inventory.updateBookTitle`, `inventory.inTransit` |
| Labels / intake | `labels.pending`, `labels.markPrinted`, `receive.addBook` |
| QC / stock | `qc.queue`, `qc.count`, `qc.pass`, `qc.fail`, `qc.passAll`, `stock.queue`, `stock.count`, `stock.bins`, `stock.confirmPlaced`, `stock.confirmAll` |
| ISBN | `isbn.classify` |
| Fulfillment | `picking.dailyOrders`, `picking.suggestBooks`, `picking.getShipmentPickList`, `picking.swapShipmentBook`, `picking.confirmPicks`, `picking.batchPickList`, `packing.list`, `packing.markPacked`, `shipping.list`, `shipping.markShipped`, `shipping.saveReturnTracking`, `shipments.list`, `shipments.byId`, `shipments.updateTracking`, `shipments.updateStatus`, `shipments.listAll` |
| Returns | `returns.bundles`, `returns.openRequests`, `returns.lookupBySku`, `returns.processReturn`, `returns.processBundleBook`, `returns.processBundle`, `returns.history` |
| Donations | `donations.list`, `donations.add` |
| Internal support | `support.list`, `support.resolve`, `support.dismiss`, `support.listMissing`, `support.resolveMissing`, `support.dismissMissing` |
| Legacy acquisition administration | `signups.list`, `signups.convertToMember` |

### Explicitly public after this change

| Procedure | Reason |
| --- | --- |
| `system.health` | Non-sensitive service health check. |
| `auth.me`, `auth.logout` | Session inspection/cleanup; neither exposes operational data. |
| `welcome.load`, `welcome.submit` | Token-gated customer welcome flow retained unchanged until future quarantine. |
| `signups.add` | Public event-signup intake retained unchanged until future quarantine. |

`system.notifyOwner` remains protected through the compatible `adminProcedure` alias.

## File-level diff

| File | Change |
| --- | --- |
| `server/_core/trpc.ts` | Added the operator middleware/procedure and made unauthenticated versus roleless failures explicit. Kept `adminProcedure` as an alias. |
| `server/domains/_legacy/legacy-app-router.ts` | Converted all retained ops namespaces and acquisition administration to `operatorProcedure`; retained only required public legacy procedures. |
| `server/domains/fulfillment/{picking,packing,shipping}.router.ts` | Converted all procedures to `operatorProcedure`. |
| `server/domains/inventory/isbn.router.ts` | Converted `isbn.classify` to `operatorProcedure`. |
| `server/ops.authorization.test.ts` | Added authorization boundary coverage. |

## Explicit non-changes

- No tRPC procedure name, input schema, success output, URL, client call, or business logic changed.
- No Supabase schema, RLS policy, migration, data, or database client changed.
- No UI or browser PIN code changed.
- No customer-acquisition code was quarantined or deleted.

## Verification

- `npm run check` passes.
- `server/ops.authorization.test.ts` proves unauthenticated callers cannot invoke an ops read or mutation, and authenticated non-admin callers cannot invoke an ops read or mutation.
- The same test proves `system.health` remains publicly callable.
- The pre-existing logout test continues to pass.