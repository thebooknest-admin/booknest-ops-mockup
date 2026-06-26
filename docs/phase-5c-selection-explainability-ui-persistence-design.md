# Phase 5C: Selection Explainability UI and Persistence Design

## 1. Executive summary

Phase 5C decides where book-selection explanations should appear for operators and what must be persisted before explanations can be reliable for already-created shipments.

Recommendation:

- Show lightweight explanation badges in future suggestion views using the Phase 5B `selection_reasons` and `selection_reason_codes` fields.
- Continue showing existing pick-list instruction text in the active picking UI for now.
- Do not fake structured reasons for assigned shipments that were created before explanation persistence exists.
- Add persisted selection metadata to `shipment_books` in a later migration/design phase before building a full “Why this book?” experience on assigned pick lists, shipment detail, or swap history.

No runtime code or UI changes were made in this phase.

## 2. Current data flow

### Suggestion path

`picking.suggestBooks` now delegates to the Phase 5B book-selection engine and can return structured explanation data for each suggestion:

- `match_reason`
- `already_sent`
- `score`
- `selection_reasons`
- `selection_reason_codes`

This is the best current source for structured explanation UI.

### Bundle creation path

`members.requestBundle` calls `createPickingOrderForMember`, which calls the selection engine and then writes selected books to `shipment_books`.

Current persisted fields on `shipment_books` include:

- `selection_reason`
- `match_score`
- assignment/status fields such as `shipment_id`, `book_title_id`, `book_copy_id`, `status`, `picked_at`, and `scanned_at`

The engine now produces richer internal data:

- `explanationsByCopyId`
- `exclusions`

But that richer data is not persisted yet.

### Assigned pick-list path

The active picking page uses `picking.getShipmentPickList`, which calls the Supabase RPC `get_shipment_pick_list` and enriches copy location data.

The UI maps RPC output roughly as:

- `book.book_to_find` → displayed title
- `book.book_sku` → scan target
- `book.bin_id` / enriched `location` → location display
- `book.instruction` → displayed `match_reason`

The assigned pick-list currently does not receive Phase 5B structured reason codes.

### Swap path

`picking.swapShipmentBook` calls the Supabase RPC `select_books_for_shipment`, chooses a candidate, patches `shipment_books`, and stores:

- `book_copy_id`
- `book_title_id`
- `status`
- `match_score`

It does not currently persist structured reason codes or excluded candidates.

## 3. Where selection explanations belong

### Suggestions view

Best immediate fit.

Use when an operator is browsing possible picks before assignment or troubleshooting why a member got certain recommendations.

Recommended content:

- reason badges from `selection_reason_codes`
- existing `match_reason` text as a short explanation line
- warning badge for `prior_title_penalty`
- warning badge for `seasonal_blocked` if suggestions continue to show seasonal titles outside the window
- optional score display in secondary text, not as the primary decision signal

### Assigned pick list

Most important long-term operator surface, but requires persistence for reliability.

This page should eventually show:

- short reason badges per assigned book
- “Why this book?” details
- scan-critical fields first: title, SKU, bin/section/location
- warnings only when actionable

Do not infer structured reasons here from title/theme after the fact. Reasons need to reflect the policy and data state at selection time.

### Member profile

Useful as a diagnostic/audit surface.

Recommended placement:

- shipment history detail row
- per-book “selected because…” details
- warnings for exceptions such as duplicate override, fallback pick, or prior-title penalty

This should wait for persisted selection metadata.

### Shipment detail

Good audit/debug surface for owner/operator.

Recommended placement:

- shipment book table
- expandable “selection details” section
- match score and policy version shown when available

This also requires persistence for older/already-created shipment rows.

### Swap flow

Important but narrower.

Recommended behavior:

- show candidate reason badges for future app-layer swap candidates
- show why candidate was blocked only if the selection engine owns the candidate set
- persist swap reason metadata separately or include it in `shipment_book_swaps` later

Current swap candidates come from `select_books_for_shipment`, whose source/body has not been verified in repo. Do not claim structured reasons for swap candidates until the RPC is reconciled with the app-layer selection engine.

## 4. What can be shown now using existing data

### From `picking.suggestBooks`

Reliable now:

- `match_reason`
- `already_sent`
- `score`
- `selection_reasons`
- `selection_reason_codes`

Potential UI now:

- Age Match badge
- Interest Match badge
- Note Match badge
- Variety Pick badge
- Seasonal warning badge
- Already Sent warning badge

Caveat: the current active picking page does not call `suggestBooks`.

### From assigned pick list / `getShipmentPickList`

Reliable now only if returned by the RPC:

- existing instruction text, currently displayed as `match_reason`
- book title/SKU/location

Possibly available depending RPC output:

- `selection_reason` if RPC exposes it as `instruction` or another field
- `match_score` if RPC exposes it

Not reliably available:

- structured reason codes
- policy defaults/version used at assignment time
- excluded candidates
- duplicate/active/seasonal exclusions

### From `shipment_books`

Known current fields:

- `selection_reason`
- `match_score`

These are useful but not enough for complete explainability because they do not preserve structured reason codes, policy version, or excluded candidate context.

## 5. What requires persistence

The following cannot be shown reliably for already-created shipments unless selection metadata is persisted at assignment time:

- exact structured reasons for each assigned book
- policy version/defaults used when the book was selected
- whether a selected book was a fallback pick
- whether seasonal filtering was enabled and passed
- which candidates were blocked for active-copy assignment
- which candidates were blocked as duplicate titles
- which candidates were blocked by avoided topics
- which candidates were blocked as seasonal/out-of-window
- why a swap candidate was chosen over another candidate
- whether an operator overrode a duplicate/fallback/seasonal warning

Without persistence, any UI explanation would be a reconstruction from current data, not an audit record of what happened.

## 6. Recommended operator UI design

### Badge groups

Use small badges grouped by tone:

Positive:

- Age Match
- Interest Match
- Note Match

Neutral:

- Theme Variety
- Seasonal OK
- Fallback Pick

Warning:

- Already Sent
- Seasonal Blocked

Blocked/excluded candidate notes:

- Duplicate Title Excluded
- Already Assigned
- Avoided Topic Excluded

### “Why this book?” details

Use a compact expandable detail area:

- primary explanation text from `match_reason` or persisted label/details
- score if available
- policy version if persisted
- selected copy/SKU/location
- warnings separated from positive reasons

### Score visibility

Score should be secondary.

Recommended display:

- show as `Score: 72` only in detail/diagnostic view
- avoid making score the primary UI label because operators need human-readable reasons more than a raw number

### Excluded candidates

Do not show excluded candidates in normal picking mode.

Possible future diagnostic panel:

- “Why not these?”
- visible only in an operator troubleshooting view
- grouped by exclusion code
- never mixed into the scanner-first pick flow

## 7. Persistence recommendation

Recommended future migration: add a JSON metadata field to `shipment_books`.

Candidate field:

- `selection_metadata jsonb null`

Recommended JSON shape:

```json
{
  "policy_version": "2026-06-selection-v1",
  "policy": {
    "allowPreviouslySentInSuggestions": true,
    "excludePreviouslySentFromBundleCreation": true,
    "excludeActiveAssignedCopies": true,
    "seasonalFiltering": true,
    "seasonalFilteringInSuggestions": false,
    "themeVariety": true
  },
  "reason_codes": ["age_match", "interest_match", "seasonal_allowed"],
  "reasons": [
    {
      "code": "interest_match",
      "label": "Interest Match",
      "detail": "Adventure",
      "tone": "positive"
    }
  ],
  "score": 70,
  "selection_reason": "Matches: Adventure",
  "selected_at": "2026-06-26T00:00:00.000Z",
  "engine": "book-selection",
  "engine_version": "phase-5b"
}
```

Do not store all excluded candidates on every `shipment_books` row unless there is a clear audit need; that can become large and repetitive.

Better options for exclusions:

1. Store per-shipment selection batch metadata later, if a `selection_runs` or `operation_audit_log` table exists.
2. Store only summarized counts by exclusion code in `shipment_books.selection_metadata`.
3. Store full excluded candidate details only in a future audit/debug table, not in scanner-critical tables.

## 8. Recommended persistence scope by table

### `shipment_books`

Best place for per-book selected reasons.

Persist later:

- reason codes
- reason labels/details
- score
- policy version
- engine version
- selected_at

### `shipment_book_swaps`

Best place for swap-specific reason/audit metadata.

Persist later:

- old copy/title
- new copy/title
- swap reason
- candidate reason codes
- operator override if applicable
- policy version

### Future audit table

If/when audit tables are approved, store selection run summaries there.

Possible future table concepts:

- `selection_runs`
- `operation_audit_log`

This phase does not recommend adding either immediately; it only notes where full exclusion details would belong if needed.

## 9. Risks

### Reconstructing reasons after the fact

Risk: displaying current-engine reasons for an old shipment may be wrong because inventory, member interests, notes, seasonal window, and policy may have changed.

Mitigation: persist reasons at assignment time before adding full assigned-pick-list badges.

### Overloading picking UI

Risk: too many badges can slow down scanning.

Mitigation: scanner-critical fields stay primary; reason details should be compact and secondary.

### Large metadata payloads

Risk: storing full excluded candidates per book can bloat `shipment_books`.

Mitigation: store per-book selected reasons on `shipment_books`; store exclusion summaries or selection-run details separately later.

### RPC mismatch

Risk: `get_shipment_pick_list` and `select_books_for_shipment` may encode selection logic not visible in app code.

Mitigation: do not replace or reinterpret RPC output until RPC source is reviewed or migrated behind an app-layer selection adapter.

### Partial historical coverage

Risk: newly persisted explanations will exist only for future shipments.

Mitigation: UI should display “Selection details unavailable for older assignments” rather than deriving false explanations.

## 10. Recommended Phase 5D

Recommended next phase: **Phase 5D: Persist Selection Metadata on New Shipment Assignments**.

Suggested scope:

1. No schema migration yet unless explicitly approved.
2. If schema changes are still off-limits, first update `selection_reason` text to be more useful while preserving existing behavior.
3. If schema changes are approved, add `shipment_books.selection_metadata jsonb`.
4. Persist Phase 5B reason codes/reasons for new assignments only.
5. Update `getShipmentPickList` to include persisted metadata only after the field exists.
6. Add a small picking UI display:
   - reason badges if metadata exists
   - existing instruction text fallback if metadata does not exist
   - “details unavailable” only in debug/detail views, not noisy picking mode
7. Add tests for new assignment metadata and pick-list display fallback.