# Phase 3F: Returns Service Extraction and Cycle Guard Test Plan

**Status:** Behavior-preserving service extraction complete. No schema, migration, RPC, webhook, route, API contract, UI, status, lifecycle, or business-rule change was made.

## What Moved

A dedicated [returns service](../server/domains/returns/services/returns.service.ts) now owns the requested return orchestration:

- `lookupBySku`;
- `openRequests`;
- `history`;
- `processReturn`;
- `processBundleBook`;
- `processBundle`;
- individual return-book processing;
- return-status calculation;
- the existing automatic next-shipment attempt.

The existing `createPickingOrderForMember` helper is supplied to the service as a dependency. This preserves the current next-shipment attempt exactly while avoiding a circular dependency between the legacy router and the returns domain.

The legacy returns router remains responsible only for `operatorProcedure`, the existing Zod schemas, and service invocation. All procedure names, inputs, outputs, error messages, direct-write order, and statuses are preserved.

## What Did Not Move

- `returns.bundles` remains in the legacy router because it is a large reporting/assembly path outside the requested extraction list.
- The EasyPost tracking webhook remains untouched.
- `createPickingOrderForMember` remains the existing shared member/shipment helper; it was injected, not redesigned.
- Member-cycle enforcement, duplicate-title enforcement, bundles/bundle-items reconciliation, picking-queue reconciliation, and the stale shipment RPCs remain unchanged.
- No transaction, idempotency ledger, cycle guard, or status repair was introduced.

## Behavior Verification

Focused regression tests were added in [returns.service.test.ts](../server/domains/returns/services/returns.service.test.ts).

They verify the currently implemented behavior for:

- received return flow, including copy restock, member history update, and automatic next-shipment attempt;
- missing return flow, including `lost` copy status and no returned-history update;
- issue return flow, including current `in_house` copy behavior and issue notes;
- bundle processing of every in-transit book;
- return-status calculation (`receiving` while a copy remains in transit);
- SKU lookup response assembly.

Validation completed:

```text
npm run check
PASS

npm test -- --run server/domains/returns/services/returns.service.test.ts
PASS — 1 file, 5 tests
```

The tests mock Supabase and do not invoke EasyPost, the webhook, or the live database.

## Current Known Lifecycle Flaws Intentionally Not Fixed

- The manual bundle creator treats only `picking`, `packing`, and `packed` shipments as open; a shipped-but-unresolved box may not block another bundle.
- A completed return-book flow still attempts to create the next shipment immediately using existing logic.
- The webhook can create a next picking shipment when return tracking enters `in_transit`, before individual return-book resolution.
- Return processing remains multiple direct writes, so partial failures can leave copy, return, history, and next-shipment state out of sync.
- Current issue processing returns the copy to `in_house`; Phase 3E documents why that later needs an approved disposition policy.
- `member_book_history` still lacks strict lifetime duplicate-title protection.
- No webhook idempotency/event ledger is present in this extraction.

## Current Webhook Behavior

No webhook behavior changed. The EasyPost tracking webhook still:

1. accepts selected tracker updates;
2. changes a requested return to `in_transit`;
3. checks only for `picking`, `packing`, or `packed` shipments;
4. creates a new `picking` shipment if none exists.

That remains a known cycle/idempotency risk and is deliberately outside this phase.

## Current Cycle Behavior

The injected next-shipment dependency keeps `processReturnedBook` behavior unchanged: when the computed return status is `received`, it calls the existing bundle-creation helper and captures any error in `next_shipment_error` rather than rolling back return processing.

This service boundary now gives the project a safe regression seam for a future authoritative cycle guard, without changing eligibility logic in this phase.

## Rollback Plan

1. Restore the prior helper and procedure bodies in `server/domains/_legacy/legacy-app-router.ts`.
2. Remove the returns-service import, factory setup, service module, and focused test.
3. Re-run the focused tests and `npm run check`.

No data, schema, migration, RPC, or webhook changes need rollback.

## Recommended Next Step

Before any member-cycle implementation, add cycle-guard regression tests around manual bundle creation and the webhook path. Then decide—using the Phase 3E design and full metadata evidence—whether existing shipment/return structures can safely enforce one open cycle or whether an additive `member_cycles` design is required.

The smallest safe implementation after that is a behavior-preserving guard service plus tests, not a migration and not a webhook rewrite.