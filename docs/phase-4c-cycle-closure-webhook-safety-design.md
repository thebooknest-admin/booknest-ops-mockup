# Phase 4C: Cycle Closure and Webhook Safety Design

**Status:** Design only. No runtime code, API, route, UI, database, migration, RPC, webhook, status, or business behavior was changed.

## 1. Executive Summary

Phase 4B correctly blocks members with `shipped` outbound shipments, but the current data model leaves such shipments in `shipped` permanently. Without a closure decision that understands returns, the guard safely prevents duplicate outbound boxes but also prevents legitimate follow-on boxes forever.

The authoritative closure event should be: **the original shipment has a linked return in `received`, and every expected shipment copy has an individually processed `return_books` resolution.** The shipment row may remain `shipped` as immutable shipment history; it should not be treated as an open cycle after this verified closure condition is true.

A lightweight existing-structure implementation is feasible for the immediate guard: derive cycle openness from `shipments`, `returns`, `shipment_books`, and `return_books`. It does not require a new status or table. It is not sufficient for durable audit correlation, concurrent enforcement, or webhook idempotency at scale; those remain strong reasons to consider future `member_cycles` and `webhook_events` structures.

## 2. Current Blocking Problem After Phase 4B

The Phase 4B guard defines an open cycle whenever a member has a shipment in:

```text
picking, packing, packed, shipped
```

or a return in:

```text
requested, in_transit, receiving
```

This blocks new bundle creation correctly while a shipment is in flight or a return is incomplete. However, current return processing does not update the original shipment out of `shipped`. Consequently, a fully resolved return still has a `shipped` original shipment and remains blocked by the current guard.

The application must therefore distinguish:

- a shipped shipment whose books are still unresolved — open cycle; from
- a shipped shipment whose linked return is fully resolved — closed cycle.

No shipment status rename or new status is required for this distinction.

## 3. Desired Closure Rule

A member cycle is closed only when all of the following are true for an outbound shipment:

1. The shipment is `shipped`.
2. A linked return exists through `returns.original_shipment_id`.
3. That return has status `received`.
4. Every `shipment_books` row with a physical `book_copy_id` for the original shipment has exactly one corresponding `return_books` record for that return.
5. Every corresponding `return_books` record has `processed_at` populated.
6. Every book resolution maps to an approved terminal outcome: received/restocked, missing/lost, issue/damaged, kept/paid, withdrawn, or future donated-out/removed.

A cycle remains open when any required return record is absent, any expected book is unprocessed, the return remains `requested` / `in_transit` / `receiving`, or the original shipment is still in `picking` / `packing` / `packed` / unresolved `shipped`.

## 4. Existing-Structure Option

### Recommended immediate approach

Keep `shipments.status = shipped` as shipment history. Do not add a closure status or mutate shipment history merely to satisfy the guard.

Instead, revise the future cycle-state query conceptually as follows:

1. Immediately treat `picking`, `packing`, and `packed` shipments as open.
2. For each `shipped` outbound shipment, load its linked return and expected shipment books.
3. Treat the shipped shipment as open unless its return is `received` and every expected physical copy has a processed `return_books` resolution.
4. Independently treat member returns in `requested`, `in_transit`, and `receiving` as open.
5. Allow the next shipment only if no open shipment/return cycle remains.

### Why this is sufficient for a first implementation

Existing relationships already express most needed evidence:

- `shipments` identifies the outbound shipment;
- `returns.original_shipment_id` links return aggregate to shipment;
- `shipment_books` identifies expected copies;
- `return_books` records per-copy processing;
- `member_book_history` records receipt/return history, but should not be the sole closure source.

### Limitations

This approach is a computed state, not a durable lock. It does not by itself provide:

- an atomic cycle-close / next-cycle-create transaction;
- an operator/override audit record;
- a stable correlation ID across shipment, return, webhook, and follow-on shipment;
- strong retry/idempotency evidence;
- a clear way to represent closure of shipments with no physical copies or exceptional/manual resolution.

## 5. `member_cycles` Option

A future additive `member_cycles` model remains appropriate when one or more of the following becomes necessary:

- database-level one-open-cycle enforcement;
- atomic closure and next-shipment authorization;
- explicit actor, override, reason, and correlation auditing;
- managing multiple return attempts or exceptions for a single outbound shipment;
- reconciling `bundles` / `bundle_items` with shipment-based circulation;
- reliable webhook and asynchronous operation orchestration.

Conceptually, it would link member, originating shipment, return, open/closed state, closure reason/time, and approved exception records. Do not add it until existing metadata, historical overlaps, and operator exception policy are approved.

**Decision:** use the existing-structure option for Phase 4D if the required joins and constraints can be tested safely. Escalate to `member_cycles` design if the resulting service query cannot reliably identify closure or cannot be made safe under concurrency.

## 6. Return Outcome Policy

Every expected copy needs one final resolution before closure. The copy’s future circulation disposition and the cycle’s completion are related but distinct.

| Outcome | Required return-book evidence | Copy availability after resolution | Cycle closure effect |
| --- | --- | --- | --- |
| Received/restocked | `received = true`, processed time, return notes as needed | Eligible only after the normal QC/stock policy | Resolves that expected copy. |
| Missing/lost | `received = false`, processed time, explicit missing/lost note | Never available; preserve `lost` | Resolves that expected copy. |
| Issue/damaged | Processed record with explicit issue/damage outcome | Must not silently become available; requires approved disposition | Resolves only once disposition is recorded. |
| Kept/paid | Processed record with kept/paid evidence | Never available; preserve `withdrawn` or approved terminal disposition | Resolves that expected copy. |
| Withdrawn | Processed record linked to reason | Never available | Resolves that expected copy. |
| Future donated-out/removed | Processed record and canonical disposition | Never available | Resolves that expected copy. |

The current code uses `condition_notes` and `received` as partial evidence and currently sends `issue` copies to `in_house`. Phase 4D should not change that behavior. A later disposition cleanup must make issue/damaged outcomes explicit before circulation eligibility is trusted.

## 7. Partial and Full Return Rules

### Partial return

A partial return remains open when at least one expected shipment copy has no processed return-book record. This remains true even if other copies are returned, missing, or kept. No follow-on shipment may be created.

### Full resolved return

A full return becomes eligible for closure only when every expected copy has a final processed resolution and the return aggregate is `received`. Once the closure-aware guard reports no open cycle, the existing next-shipment attempt may proceed.

The closure decision must occur after the final return-book write and return status update, not merely when a tracking event says `in_transit`.

## 8. Webhook Safety Policy

### Required policy

1. A return tracking update to `in_transit` must update tracking state only.
2. It must not create a next shipment.
3. It must not bypass the same `createPickingOrderForMember` cycle guard used by manual and return-processing paths.
4. Retried webhook events must be idempotent.
5. A webhook may record that a return is moving, but only verified return closure may authorize follow-on creation.

### Immediate safe change for Phase 4D

Remove the webhook’s direct shipment-creation branch. Preserve its return tracking update and success/skip response behavior as closely as possible, but return `shipment_created: false` for an in-transit event.

This is safer than trying to invoke follow-on creation from the webhook because the physical books have not been resolved.

### Idempotency direction

For a minimum existing-structure implementation, ensure repeated events do not create shipments because the webhook no longer creates them. Repeated state patches should be conditional/no-op where possible.

For durable idempotency, a future `webhook_events` ledger should store provider event identity, processing state, payload fingerprint, linked return/shipment, timestamps, and failure evidence. This requires a future approved schema design.

## 9. Required Tests Before Implementation

### Cycle closure guard

1. `picking`, `packing`, and `packed` shipments are open.
2. A shipped shipment with no linked return is open.
3. A shipped shipment with a `requested`, `in_transit`, or `receiving` return is open.
4. A shipped shipment with a `received` return but one unprocessed expected copy is open.
5. A shipped shipment with a `received` return and all expected copies processed is closed.
6. A member with multiple shipments remains open if any cycle is unresolved.
7. A member with only fully resolved historical shipped cycles is allowed a new bundle.
8. A final return-book resolution causes the next-shipment helper to be eligible exactly once.

### Outcome safety

1. Missing/lost and kept/withdrawn resolutions never make a copy `in_house`.
2. Issue/damaged outcome is captured as a known current behavior and cannot be silently treated as closure-safe until approved disposition policy exists.
3. Partial return processing does not close the return or permit a new shipment.

### Webhook safety

1. An `in_transit` tracking event updates the return but creates no shipment.
2. Repeating the same event creates no shipment and does not regress return state.
3. A webhook cannot bypass the closure-aware guard.
4. Future event-ledger tests cover duplicate event IDs, concurrent delivery, failed processing retry, and payload mismatch.

## 10. Risks

- **Computed-state drift:** existing records may be incomplete or historically inconsistent, causing false blocks or unsafe closures.
- **Concurrent operations:** without a transaction/lock, a final return processing and manual request can race.
- **Current issue behavior:** `issue` currently makes a copy in-house; closure policy must not mistake inventory availability for resolution quality.
- **Historical overlaps:** Phase 2D found overlapping outbound shipments; those require exception handling before strict database enforcement.
- **Webhook bypass:** until Phase 4D changes it, the webhook still creates a follow-on shipment at in-transit.
- **Parallel models:** unresolved `bundles`, `bundle_items`, and `picking_queue` may contain cycle evidence not represented by current application paths.

## 11. Recommended Phase 4D

Implement a small, behavior-focused **Cycle Closure Guard and Webhook Follow-On Removal** slice:

1. Extend the guard to classify shipped cycles as closed only after a linked received return with processed resolutions for every expected copy.
2. Keep existing shipment statuses unchanged.
3. Permit the existing return-service next-shipment attempt only after that closure-aware guard allows it.
4. Remove direct next-shipment creation from the return-tracking webhook; retain tracking transition behavior only.
5. Add the closure and webhook regression tests above.
6. Do not add `member_cycles`, change return outcomes, or introduce a migration in this slice.

If closure logic becomes too complex or fails concurrency/staging verification, stop Phase 4D and produce an approved `member_cycles` / `webhook_events` migration design instead.