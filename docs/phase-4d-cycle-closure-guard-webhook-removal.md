# Phase 4D: Cycle Closure Guard and Webhook Follow-On Removal

## 1. Executive Summary

Phase 4D closes the Phase 4B permanent-blocking problem without changing shipment history: a shipped shipment is now considered open only until its linked return is `received` and every expected physical shipment copy has a processed `return_books` resolution.

The EasyPost return-tracking webhook still updates a requested return to `in_transit`, but it no longer creates a follow-on `picking` shipment. This prevents the webhook from bypassing physical return resolution and the shared member-cycle guard.

No migration, status rename, RPC change, new table, or new webhook ledger was added.

## 2. What Changed

### Closure-aware member cycle guard

[member-cycle.guard.ts](../server/domains/returns/services/member-cycle.guard.ts) now:

1. Keeps `picking`, `packing`, and `packed` outbound shipments open.
2. Keeps `requested`, `in_transit`, and `receiving` returns open.
3. For a `shipped` shipment, requires a linked `returns.original_shipment_id` record with status `received`.
4. Loads expected physical copy IDs from `shipment_books`.
5. Treats the shipped cycle as closed only when every expected copy ID has a `return_books` record with `processed_at` set.

The existing `createPickingOrderForMember` helper already calls this guard, so the new closure rule applies to manual bundle requests and the automatic follow-on attempt made by return processing.

### Webhook follow-on removal

[easypost-tracking.ts](../server/webhooks/easypost-tracking.ts) no longer creates a shipment after updating a requested return to `in_transit`.

Its safe success response is now:

```json
{ "ok": true, "return_updated": true, "shipment_created": false }
```

## 3. Exact Cycle Closure Rule

A shipped outbound cycle is closed only when:

- the shipment has a linked return in `received`; and
- every `shipment_books` row with a `book_copy_id` has a matching processed `return_books` resolution.

A cycle remains open when any expected copy lacks a processed resolution, even if some books have already been received.

Shipment status remains `shipped` as shipment history. No closure status was added and no shipped record is mutated for cycle management.

## 4. Final Resolution Policy

The existing model’s conservative final-resolution signal is `return_books.processed_at` for each expected copy.

This supports current flows where processing records are created for:

- returned/received books;
- missing/lost books;
- kept/paid books that become withdrawn;
- current issue/damaged handling.

The guard does not require physical return (`received = true`), so kept, lost, and withdrawn resolutions do not block the member forever.

### Data-model limitation

Current `return_books` fields provide a processed record, received flag, and notes, but not a structured, approved disposition enum. The guard can safely keep absent/unprocessed records open; it cannot independently verify the business approval semantics of an issue/damaged note. A future disposition/audit design remains necessary before relying on this data for richer reporting or policy enforcement.

## 5. Webhook Behavior Change

The webhook still:

- accepts the same tracker update class;
- finds a requested return by tracking number;
- patches the return to `in_transit`;
- returns a safe success response.

It no longer:

- creates a new shipment;
- generates order/shipment numbers;
- bypasses `createPickingOrderForMember` or the cycle guard.

Repeated in-transit events no longer create shipments. A full webhook event ledger/idempotency mechanism was not added in this phase.

## 6. What Did Not Change

- No migration or schema change.
- No RPC change.
- No shipment, return, or copy status name changed.
- No new `member_cycles` or `webhook_events` table.
- No modification to `create_shipment_with_books` or `create_shipments_for_ship_date`.
- No change to return-processing write order, copy dispositions, member history behavior, or the existing next-shipment result shape.
- No UI redesign.

## 7. Tests Added and Updated

Focused coverage now verifies:

- picking/packing/packed cycles remain open;
- shipped shipment without a linked return remains open;
- requested/in-transit/receiving returns remain open;
- received return with unresolved expected copy remains open;
- received return with all expected copies processed is closed;
- processed kept/paid, missing/lost, withdrawn, and issue/damaged records count as final resolutions;
- fully resolved cycles allow the shared creation helper to pass the guard;
- return-service regression behavior remains intact;
- webhook in-transit updates create no shipment;
- repeated webhook events create no shipment.

Validation:

```text
npm run check
PASS

npm test -- --run server/domains/returns/services/returns.cycle-guard.test.ts server/domains/returns/services/returns.service.test.ts server/webhooks/easypost-tracking.test.ts
PASS — 3 files, 22 tests
```

## 8. Known Remaining Gaps

1. The closure guard is computed state, not a database transaction or lock; concurrent manual/return operations can still race.
2. Historical data with incomplete `return_books` records will remain safely blocked until reviewed.
3. Issue/damaged resolution is inferred from an operator-processed record, not a structured approval/disposition field.
4. No webhook event ledger exists; duplicate events no longer create shipments, but duplicate tracking updates are not durably recorded.
5. Bundles/bundle-items and picking-queue lifecycle roles remain unresolved.
6. Lifetime duplicate-title protection remains application-level and non-transactional.

## 9. Rollback Plan

1. Restore the prior shipped-is-always-open guard implementation.
2. Restore the webhook’s follow-on shipment branch if rollback is explicitly required.
3. Remove the new focused webhook and closure tests.
4. Re-run focused tests and `npm run check`.

No data/schema rollback is required.

## 10. Recommended Phase 4E

Run a read-only data exception review for shipped shipments, received returns, and return-book completeness before enforcing this rule in production operations. Then design either:

- a transactional existing-structure cycle close/create boundary; or
- an additive `member_cycles` plus `webhook_events` migration, if concurrency/audit requirements cannot be met safely with current structures.