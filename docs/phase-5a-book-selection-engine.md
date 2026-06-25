# Phase 5A: Book Selection Engine Extraction

## 1. Executive summary

Phase 5A extracts the current book-selection and scoring behavior into a dedicated fulfillment service module without changing API contracts, route names, schema, RPCs, statuses, or UI behavior.

The new engine centralizes the existing selection rules that were previously split between:

- `picking.suggestBooks`
- `createPickingOrderForMember`
- `swapShipmentBook` seasonal candidate filtering

This phase is architectural only. It prepares the codebase for smarter future selection rules while preserving current behavior.

## 2. What moved

Created `server/domains/fulfillment/services/book-selection/` with:

- `selection.engine.ts` — owns current suggestion and picking-order selection orchestration.
- `selection.types.ts` — shared internal selection types.
- `index.ts` — public exports for the selection module.
- `scoring/age-score.ts` — current age-group normalization helper.
- `scoring/duplicate-score.ts` — current duplicate-title/active-copy set helpers.
- `scoring/interest-score.ts` — current interest and avoid-theme mapping helpers.
- `scoring/randomness-score.ts` — current deterministic theme-variety selection helper.
- `scoring/seasonal-score.ts` — current holiday/seasonal window filtering.

Moved behavior into the engine for:

- member book-count calculation (`little-nest`, `cozy-nest`, `story-nest`, with existing defaults)
- `picking.suggestBooks` member lookup, interest lookup, sent-title lookup, copy lookup, tag enrichment, scoring, and response assembly
- `createPickingOrderForMember` copy selection, prior-title exclusion, active-copy exclusion, avoid-topic exclusion, note exclusion/boosting, seasonal exclusion, score calculation, and theme-variety selection
- swap-candidate seasonal filtering helper reuse

## 3. What did not change

No intentional runtime behavior changed.

Preserved:

- tRPC route names
- route inputs and outputs
- `picking.suggestBooks` response shape
- `members.requestBundle` response shape
- `createPickingOrderForMember` shipment creation flow
- shipment number and order number generation
- status values and status transitions
- Supabase REST query payloads where behavior depends on them
- RPC payloads for existing pick-list and swap workflows
- EasyPost behavior
- webhook behavior
- UI behavior
- database schema

The router is thinner, but still exposes the same API.

## 4. Behavior parity verification

Added focused tests for the new engine:

- suggestion output shape remains stable
- suggested books still use normalized member age group when querying inventory
- previously sent titles remain present in suggestions with `already_sent: true` and the existing score penalty
- interest/theme scoring remains stable
- picking-order selection still excludes titles from member history
- picking-order selection still excludes titles from prior shipments
- picking-order selection still excludes copies assigned to active picking/packing/packed shipments
- picking-order selection still excludes out-of-window seasonal books
- selected book count still matches `books_per_box` when inventory allows

Existing picking-service tests continue to cover:

- `getShipmentPickList` RPC payload and enrichment
- `swapShipmentBook` RPC payload and update sequence
- seasonal swap candidate filtering

## 5. UI/operator clarity change

No UI change was made in this phase.

The current picking page already displays the pick-list instruction/match reason where available. Phase 5A keeps the operator experience unchanged and makes future explanation work easier by centralizing reasons in the selection engine.

## 6. Known limitations intentionally not fixed

This phase deliberately did not fix or redesign selection behavior.

Known limitations remain:

- `picking.suggestBooks` still marks previously sent titles with `already_sent` and a score penalty rather than excluding them entirely.
- The actual picking-order path excludes prior titles more strictly than the suggestion path.
- Selection is still mostly score-based with a simple deterministic theme-variety pass.
- Active-copy exclusion still follows the existing app-layer query against picking/packing/packed outbound shipments.
- Seasonal logic still uses fixed approximate holiday dates/windows.
- No transaction boundary was added around selection plus shipment creation.
- No database-level duplicate-title enforcement was added.
- No `thirteen_plus` support was introduced.
- No customer-facing selection work was added.

## 7. Rollback plan

If a regression is found, rollback is straightforward:

1. Restore the previous inline `picking.suggestBooks` implementation in `picking.router.ts`.
2. Restore the previous inline selection block in `createPickingOrderForMember`.
3. Restore the local seasonal helper in `picking.service.ts`.
4. Remove the new `book-selection` module and its tests.

Because no schema, API, RPC, or UI contract changed, rollback does not require database work.

## 8. Recommended Phase 5B smarter-selection improvements

Recommended next phase: **Phase 5B: Selection Rule Hardening and Explainability Plan**.

Suggested scope:

1. Decide whether `picking.suggestBooks` should exclude previously sent titles or continue showing them with a penalty.
2. Add explicit selection reason categories for operator visibility, such as:
   - age match
   - interest match
   - note match
   - variety pick
   - duplicate avoided
   - active copy avoided
   - seasonal blocked
3. Add a single selection policy object so rules can be adjusted without route edits.
4. Add tests for minimum inventory fallback behavior.
5. Design a safe override path for owner-approved duplicate-title exceptions.
6. Consider whether selection should eventually run inside an RPC/transaction when shipment rows are created.