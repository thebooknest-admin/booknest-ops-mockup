# Phase 3E: Returns and Member-Cycle Design

**Status:** Design only. No runtime code, route/API contract, UI, database, migration, RPC, webhook, status value, or business behavior was changed.

## 1. Executive Summary

The current operations backend can process individual returns and create follow-on shipments, but it does not have one authoritative member-circulation-cycle model. The code currently uses shipments, returns, return books, and history as related records, while `bundles` / `bundle_items` and `picking_queue` remain unresolved parallel structures.

The desired rule—one open circulation cycle per member, with no new outbound box until the prior return is fully resolved—cannot be reliably enforced by the current status checks alone. `createPickingOrderForMember` blocks only member shipments in `picking`, `packing`, and `packed`; a shipped box is not treated as an open cycle. The webhook can create a new picking shipment when a return only reaches `in_transit`, before its books are individually received and resolved.

Recommendation: do not add a `member_cycles` table yet, but design and test an authoritative cycle guard first. If existing shipment/return relationships cannot enforce it transactionally and unambiguously after source/metadata review, a future additive `member_cycles` model is warranted.

## 2. Current Workflow Map

### `members.requestBundle` and `createPickingOrderForMember`

`members.requestBundle` invokes `createPickingOrderForMember({ member_id, source: "manual" })`.

The helper currently:

1. Checks for the member’s outbound shipments in `picking`, `packing`, or `packed` only.
2. Requires an active subscription, completed welcome form, and age group.
3. Reads member interests, prior `member_book_history`, and all prior shipment books to exclude previously sent title IDs.
4. Reads all active outbound shipments in `picking`, `packing`, or `packed` and excludes copies assigned to them.
5. Selects in-house copies, creates a `picking` shipment, and inserts `shipment_books` with `ready_for_picking`.

This provides application-level duplicate title avoidance and partial active-copy avoidance, but it is not transactional and does not treat a shipped/unreturned box as an open cycle.

### Shipment lifecycle currently used by app code

```text
picking → packing → packed → shipped
```

At shipping, copies become `in_transit`, shipment books remain `picked`, and member-history rows are created where absent for that shipment. No explicit cycle record is opened or closed.

### `returns.bundles`

This is an operational view built from `book_copies.status = in_transit` and related shipment/return records. It groups in-flight copies by their latest shipment-book relationship, enriches member/shipment/return information, and derives display states such as `out`, `received`, `missing`, `kept`, and `issue`.

It is a reporting/processing view, not an authoritative cycle aggregate.

### `returns.openRequests`

This lists returns in `requested`, `in_transit`, or `receiving`, enriches them with member/shipment information, and calculates expected versus received books. It hides a return associated with a shipment when no outstanding in-transit books remain.

### `returns.lookupBySku`

This resolves a copy by SKU, then looks up its title and latest shipment-book row. It supplies the operator with last shipment identifiers for return processing.

### `returns.processReturn`

This invokes `processReturnedBook` with outcome `received`, using optional last-shipment identifiers from the SKU lookup.

### `returns.processBundleBook`

This invokes `processReturnedBook` for a known shipment/book/copy with one of:

- `received`
- `missing`
- `issue`

### `returns.processBundle`

This finds in-transit copy assignments for a shipment and processes each as `received`, sequentially. The final per-book result is returned as the bundle result.

### `returns.history`

This reads completed/processed return records and enriches their return books with copy, location, and title data. It is historical reporting; it does not enforce lifecycle eligibility.

### `processReturnedBook`

For each copy, the helper currently:

1. Looks up the copy and resolves shipment-book/member context from supplied IDs or latest history.
2. Sets the copy to `in_house` for received/issue outcomes, `lost` for missing, or `withdrawn` when a missing copy was already marked kept/paid.
3. Finds or creates a return record.
4. Inserts or updates a `return_books` record.
5. Updates matching `member_book_history` for non-missing outcomes with `returned_date`, `kept: false`, and notes.
6. Computes the return status as `receiving` while an in-transit copy remains unhandled; otherwise `received`.
7. When status is `received`, attempts `createPickingOrderForMember({ source: "return" })` and returns any error without undoing the return result.

### EasyPost return-tracking webhook

The webhook accepts selected tracker-update states. It finds a requested return by tracking number, patches it to `in_transit`, then checks only for shipments in `picking`, `packing`, or `packed`.

If none exists, it directly creates a new `picking` shipment and generates shipment/order numbers by scanning existing rows. It does not wait for return-book resolution, does not create shipment books in this handler, and has no visible webhook event ledger/idempotency key.

## 3. Current Data Relationships

| Structure | Current lifecycle role | Design finding |
| --- | --- | --- |
| `members` | Member identity, eligibility, tier, age, preferences | Has no visible authoritative open-cycle field. |
| `shipments` | Outbound aggregate with picking/packing/packed/shipped states | Current primary outbound record; shipped is not included in the manual open-shipment gate. |
| `shipment_books` | Copy/title assignment to shipment with pick/scan state | Existing partial unique active-copy-assignment index is important. |
| `book_copies` | Physical copy state, including `in_transit`, `in_house`, `lost`, `withdrawn` | Return outcome changes copy status directly. |
| `returns` | Return aggregate linked to original shipment/member | Uses `requested`, `in_transit`, `receiving`, `received` in current application logic. |
| `return_books` | Individual return resolution | Records received flag, condition notes, action, and processed time. |
| `member_book_history` | Member/title/shipment history | Created on shipping; returned/kept state updated during return work. Unique key includes `shipment_id`, so it is not lifetime duplicate prevention. |
| `bundles`, `bundle_items` | Possible parallel fulfillment/circulation model | Live structures exist, but current source uses shipments/shipment books. Must be reviewed before reuse or retirement. |
| `picking_queue`, `picking_batches` | Existing queue/batch model | Not currently the authoritative source for manual bundle creation; source/constraint semantics remain unverified. |
| `status_history` | Copy status audit trail | Must be evaluated before any cross-entity cycle/audit design. |

The database also has `idx_unique_active_copy_assignment` on `shipment_books(book_copy_id)` where `scanned_at IS NULL`. Preserve it as partial allocation protection, but do not assume it enforces one open member cycle or lifetime title uniqueness.

## 4. Desired Business Rules

1. A member has at most one open circulation cycle at a time.
2. An open cycle begins before or at allocation and remains open through shipment, return request, return transit, and individual book resolution.
3. No new outbound box may be created while the prior cycle is open, including when the prior shipment is shipped but its return is unresolved.
4. A member must not receive the same title again unless an explicitly authorized override is recorded.
5. Every shipped copy must be individually resolved as returned/restocked, kept/paid, lost, damaged/unusable, or another approved disposition.
6. Lost, kept, damaged, missing, withdrawn, and donated-out copies must never silently become `in_house`.
7. A return tracking update is evidence of movement, not evidence that the cycle is complete or that a next shipment is allowed.
8. Webhook retries and operator retries must be idempotent: they cannot create a second return transition, second shipment, or duplicate history row.

## 5. Proposed Target Lifecycle

```text
cycle opened
  → copies allocated
  → picking
  → packed
  → shipped (copies in flight)
  → return requested
  → return in transit
  → each return book resolved
  → return complete
  → cycle closed
  → next shipment allowed
```

### Proposed state interpretation

| Stage | Required source of truth | Gate |
| --- | --- | --- |
| Cycle opened | Future cycle record or verified shipment/return aggregate | Blocks new outbound work for the member. |
| Allocated/picking | Shipment plus `shipment_books` / active assignment safeguard | A copy may not be allocated to a second active shipment. |
| Packed/shipped | Shipment and copy status | Shipped copies remain in flight and block cycle closure. |
| Return requested/in transit | Return record linked to original shipment | Tracking updates must not create a follow-on box. |
| Book resolution | One `return_books` resolution per expected copy | Received, missing, kept, lost, issue, or other approved outcome is required. |
| Return complete | All expected shipped copies resolved | Allows cycle closure only if no unresolved copy remains. |
| Cycle closed | Explicit verified closure | Allows next bundle creation. |

## 6. Member Cycle Recommendation

### Can existing structures enforce it today?

Not safely. Existing shipment and return records can describe a cycle, but current code uses different status predicates in different paths:

- manual bundle creation ignores `shipped` and all return states;
- return processing creates the next shipment after all in-transit copies are handled;
- webhook processing creates a next shipment at `return.in_transit`;
- no visible database constraint enforces one open cycle per member.

`bundles` / `bundle_items` cannot yet be chosen as the cycle authority because their source usage, constraints, and live semantics are unknown.

### Recommended conceptual model

Adopt an explicit `member_cycles` concept if source/metadata review cannot prove existing tables can enforce the same invariant. It should conceptually identify:

- member;
- originating outbound shipment;
- linked return record(s), if applicable;
- open/closed state and closure reason/time;
- correlation/operation identifier;
- allowed next-cycle decision;
- authorized override reference where needed.

This is a design direction only. Do not write migration SQL or add the table until the existing bundles/picking/return schema and data exceptions are fully reconciled.

## 7. Duplicate-Title Recommendation

Current application code is stricter than the current database constraint in some paths: it excludes title IDs from both member history and past shipment books while selecting a bundle. However, this is a read-then-write application check and can race.

Recommended policy:

- Treat `(member_id, book_title_id)` as the desired default lifetime exclusion key.
- Preserve all historical rows and support a deliberate override record/reason for owner-approved exceptions.
- Do not infer an exception from a missing, lost, damaged, or kept outcome; that decision requires owner approval.
- Add a transactional allocation guard only after duplicate historical rows and title-identity policy are reviewed.

The current `(member_id, book_title_id, shipment_id)` uniqueness is insufficient because a later shipment can repeat the same title.

## 8. Return-Book Resolution Rules

| Outcome | Copy availability | Required record behavior |
| --- | --- | --- |
| Received/restocked | Eligible only after approved QC/stock process | Record received return book and returned history; do not silently bypass inventory workflow. |
| Issue/damaged | Not automatically available | Record issue details and owner-approved disposition; current code’s `in_house` behavior is a risk to be redesigned later. |
| Missing/lost | Not available | Preserve `lost`; do not return to `in_house`. |
| Kept/paid | Not available | Preserve `withdrawn` or approved final disposition and history evidence. |
| Donation/removal | Not available | Record donated-out/removed disposition in the future canonical model. |

Every expected shipment copy must have exactly one final resolution before the cycle closes. A partial return remains open even if some copies are received.

## 9. Webhook and Idempotency Recommendation

The webhook must become a return-tracking update only until a verified cycle-closure guard exists. It should not create an outbound shipment solely because a return reaches `in_transit`.

Before implementation:

- identify every EasyPost event identifier and payload field available for idempotency;
- determine whether a hidden `webhook_events` table already exists;
- ensure a retry sees the same return transition and does not create another shipment;
- serialize or transactionally guard the member’s current cycle decision;
- preserve operator-triggered and webhook-triggered actions in one auditable correlation chain.

No webhook change is made in this phase.

## 10. Risks

- **Overlapping outbound shipments:** Phase 2D found two member groups with overlapping active outbound shipments, including three shipments beyond the first.
- **Shipped-box gap:** current manual creation allows a next bundle after a prior shipment moves to `shipped`, regardless of return state.
- **Webhook-created next shipment:** return tracking can create a next `picking` shipment before physical receipt/resolution.
- **Direct return processing writes:** copy, return, return-book, history, status, and next-shipment work are separate writes with partial-failure risk.
- **Duplicate title drift:** application filters may not run for every creation path and database uniqueness permits future repeats.
- **History drift:** member history is created at shipping and updated on return; failure/partial paths can create missing or inconsistent history.
- **Missing/kept/damaged ambiguity:** current `issue` can return a copy to `in_house`, and final disposition semantics are not yet canonical.
- **Parallel structures:** `bundles` / `bundle_items` and `picking_queue` may be active, legacy, or partial alternatives; treating them as unused now risks data loss or duplicate state.

## 11. Required Tests Before Implementation

1. A member with an open cycle cannot create a manual bundle.
2. A member with a shipped, unresolved cycle cannot create a new bundle.
3. A member can create a new bundle only after all expected books are resolved and the prior cycle is closed.
4. Concurrent manual and webhook attempts cannot create two next shipments.
5. A webhook retry does not duplicate a return state transition or shipment.
6. A title already sent to the member is rejected by default.
7. An approved duplicate-title exception succeeds only with recorded authorization/reason.
8. A partial return remains open after one of several books is resolved.
9. A full return closes the cycle only after every expected copy has a final resolution.
10. Missing/lost/kept copies never become `in_house`.
11. Issue/damaged disposition follows the approved policy and cannot silently re-enter circulation.
12. The active-copy assignment index remains satisfied through allocation, pick, ship, return, cancellation, and retry paths.
13. History rows are created once on shipment and reconciled correctly on return resolution.

## 12. Recommended Next Phase

Re-sequence the roadmap with **Phase 3F: Returns Service Extraction and Cycle-Guard Test Plan** before donations work.

Phase 3F should:

1. Extract current return orchestration into a dedicated returns service without changing behavior.
2. Add regression tests that capture current manual-return, bundle-return, and webhook interactions.
3. Implement no lifecycle policy changes yet.
4. Use the resulting service/test seam to decide whether an existing shipment/return aggregate can enforce one open cycle, or whether an additive `member_cycles` migration design is required.
5. Defer a `member_cycles` migration until full PostgreSQL metadata, bundles/picking review, historical-overlap remediation, and owner approval are complete.

The smallest safe future implementation slice is therefore service extraction plus tests—not a new cycle table and not a webhook rewrite.