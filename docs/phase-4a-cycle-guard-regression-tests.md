# Phase 4A: Cycle Guard Regression Tests

**Status:** Tests and documentation only. No route, API, UI, webhook, database, schema, migration, RPC, status, lifecycle, or business behavior was changed.

## What Tests Were Added

[returns.cycle-guard.test.ts](../server/domains/returns/services/returns.cycle-guard.test.ts) adds seven focused regression tests and three explicit future TODOs.

The suite combines:

- service-level tests for the current return-status and automatic-next-shipment behavior; and
- source-level contract tests for the non-injectable manual bundle helper and EasyPost webhook.

Source-level tests are intentional: exporting or refactoring those functions merely to test them would be a runtime boundary change, which Phase 4A forbids.

## Current Behavior Proven

### Manual bundle creation

The current `createPickingOrderForMember` helper blocks creation when a member has an outbound shipment in:

```text
picking, packing, packed
```

The regression suite also proves the known gap: `shipped` is not included in that guard. A shipped box with an unresolved return is therefore not blocked by this predicate.

### Return cycle behavior

The tests prove current return-service behavior:

- a partial return remains `receiving` while an expected in-transit copy is unresolved;
- no next-shipment attempt is made while the return remains `receiving`;
- once the current status calculation reaches `received`, return processing attempts the existing next-shipment helper.

This captures behavior; it does not assert that it is the desired future policy.

### Webhook behavior

The source contract test documents that the EasyPost webhook:

1. marks a matching requested return as `in_transit`;
2. checks only for `picking`, `packing`, and `packed` shipments;
3. can directly create a new `picking` shipment;
4. reports `shipment_created: true`.

This is the known early-follow-on-shipment risk from Phase 3E. The webhook was not executed or changed by this phase.

### Duplicate-title behavior

The source contract test documents that manual selection reads `member_book_history` and excludes prior title IDs in application code. This is a read-then-write filter, not a transactional service/database guarantee.

## Known Gaps Captured

- Shipped-but-unresolved cycles are not part of the manual open-shipment guard.
- Return tracking entering `in_transit` can lead to next-shipment creation before individual return-book resolution.
- The current `received` transition triggers a next-shipment attempt rather than a verified, explicit cycle-closure decision.
- Duplicate-title prevention depends on application reads; current database uniqueness includes `shipment_id` and permits later repeats.
- Webhook retry/idempotency behavior is not protected by a visible event ledger.

## Tests Intentionally Marked TODO

The suite contains future TODOs for:

1. blocking manual creation for shipped unresolved cycles;
2. preventing webhook retry/in-transit events from creating a next shipment before cycle closure;
3. enforcing lifetime duplicate-title prevention at a transactional service/database boundary.

They are TODOs rather than failing tests because implementing those expectations now would require behavior changes expressly excluded from Phase 4A.

## Phase 4B Implementation Direction

Phase 4B should implement the smallest safe cycle guard only after owner approval:

1. define one authoritative `isMemberCycleOpen` decision at the service boundary;
2. apply it first to manual bundle creation and automatic return follow-on attempts;
3. add direct webhook coverage and idempotency tests before touching webhook behavior;
4. retain current schema initially if an existing shipment/return aggregate can safely enforce the decision;
5. design an additive `member_cycles` migration only if existing structures cannot express/lock the invariant.

Do not begin with a webhook rewrite, a status change, or a migration. Begin with a thoroughly tested service guard and explicit owner decisions on shipped/return/kept/lost exceptions.