# Phase 4B: Member Cycle Guard

**Status:** Implemented without schema, migration, RPC, webhook, route, or status changes.

## 1. What Changed

Added [member-cycle.guard.ts](../server/domains/returns/services/member-cycle.guard.ts), using existing `shipments` and `returns` only.

`isMemberCycleOpen(memberId)` now returns true when the member has either:

- an outbound shipment in `picking`, `packing`, `packed`, or `shipped`; or
- a return in `requested`, `in_transit`, or `receiving`.

The shared `createPickingOrderForMember` helper now calls the guard before performing its existing selection and creation work. This covers both:

- `members.requestBundle` manual bundle creation; and
- the automatic next-shipment attempt injected into return processing.

The existing blocked result shape is preserved: it still returns `created: false` with `reason: "open_shipment_exists"`. For return-only blocks, `shipment_id` may be `null` and `status` reflects the open return status.

## 2. Exact Behavior Change

A member can no longer receive a new outbound shipment while any configured open shipment or return exists. In particular, a `shipped` outbound shipment now blocks creation even if it previously did not.

This follows the Phase 3E rule literally. It also exposes an existing lifecycle limitation: shipped records are not currently transitioned after a completed return, so the guard will continue to block follow-on shipments until a later approved cycle-closure implementation defines how the shipped cycle becomes closed.

No copy, shipment, return, history, allocation, or webhook status transition changed.

## 3. Small UI Message Change

The internal member profile page now:

- treats a `shipped` shipment as active for the Request New Bundle button;
- disables the button for that visible condition; and
- displays `Member already has an open cycle.` when a request is blocked.

This is an operator-facing clarity change only; no customer-facing UI was changed.

## 4. What Did Not Change

- EasyPost webhook behavior remains unchanged; it can still create a `picking` shipment when return tracking reaches `in_transit`.
- No webhook idempotency mechanism was added.
- No `member_cycles` table or migration was added.
- No new status names were added and no existing status meaning was changed.
- `create_shipment_with_books`, `create_shipments_for_ship_date`, and the `reserved` conflict remain untouched.
- No allocation, duplicate-title, or return-book disposition behavior was changed.

## 5. Tests Added and Updated

[returns.cycle-guard.test.ts](../server/domains/returns/services/returns.cycle-guard.test.ts) now proves:

- `picking`, `packing`, `packed`, and `shipped` shipments block the guard;
- `requested`, `in_transit`, and `receiving` returns block the guard;
- no configured open shipment/return allows the guard to report closed;
- the manual bundle helper is wired through the guard;
- partial returns remain `receiving` and do not attempt a next shipment;
- when a return reaches `received`, the return service preserves the guarded next-shipment result;
- the webhook’s early in-transit shipment creation remains documented;
- webhook idempotency and transactional duplicate-title enforcement remain explicit TODOs.

Validation:

```text
npm run check
PASS

npm test -- --run server/domains/returns/services/returns.cycle-guard.test.ts server/domains/returns/services/returns.service.test.ts
PASS — 2 files, 16 passed, 2 TODO
```

## 6. Known Remaining Gaps

1. A shipped shipment remains open indefinitely under this guard until a later cycle-closure design is implemented.
2. The webhook can still bypass the new application helper and create a picking shipment at return `in_transit`.
3. There is no database-level concurrency lock or webhook event ledger.
4. Lifetime duplicate-title prevention remains a read-then-write application check.
5. Bundles/bundle-items and picking-queue roles remain unresolved.

## 7. Rollback Plan

1. Remove the guard call and import from `createPickingOrderForMember`.
2. Remove `member-cycle.guard.ts` and restore the Phase 4A test expectations.
3. Revert the small Member Profile button/message change.
4. Re-run focused tests and `npm run check`.

No data/schema migration or external integration rollback is required.

## 8. Recommended Next Phase

**Phase 4C: Cycle Closure and Webhook Safety Design.**

Before expanding the guard, decide the authoritative closure event for a shipped cycle, reconcile return completion with shipment state, and design webhook idempotency. This must happen before any database migration or webhook behavior change; otherwise the new guard would safely block future cycles without a reliable way to close the current one.