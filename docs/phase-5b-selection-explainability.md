# Phase 5B: Selection Rule Hardening and Explainability

## 1. Executive summary

Phase 5B makes the book selection engine easier to understand and safer to evolve by adding:

- structured selection reason codes
- operator-friendly reason labels/details
- an explicit default selection policy
- internal exclusion metadata for bundle creation
- regression tests proving current behavior remains intact

This phase does not redesign selection behavior. It makes the current behavior explicit so future smarter-selection work can be done deliberately.

## 2. What changed

Added structured explanations to the book selection engine.

Suggested books returned from `picking.suggestBooks` now include additive fields:

- `selection_reasons`
- `selection_reason_codes`

These fields are additive and do not replace existing fields such as:

- `match_reason`
- `already_sent`
- `score`
- `recommended`
- `all_suggestions`

Bundle creation selection now returns internal engine metadata:

- `explanationsByCopyId`
- `exclusions`

The existing `createPickingOrderForMember` caller does not expose these externally yet, so shipment creation behavior and write payloads remain unchanged.

## 3. Behavior changes

No intentional core selection behavior changed.

Preserved behavior:

- `picking.suggestBooks` still allows previously sent titles to appear.
- previously sent suggestions still receive the existing score penalty.
- bundle creation still excludes titles from member history and prior shipments.
- bundle creation still excludes active assigned copies.
- bundle creation still excludes out-of-window seasonal books.
- bundle creation still applies deterministic theme variety.
- route names, inputs, and outputs remain backward-compatible.
- no schema, migration, RPC, webhook, or customer-facing changes were made.

One additive API behavior exists:

- `picking.suggestBooks` responses now include structured explanation fields in each suggested book object.

## 4. Policy defaults

Added `DEFAULT_BOOK_SELECTION_POLICY`:

```ts
{
  allowPreviouslySentInSuggestions: true,
  excludePreviouslySentFromBundleCreation: true,
  excludeActiveAssignedCopies: true,
  seasonalFiltering: true,
  seasonalFilteringInSuggestions: false,
  themeVariety: true,
}
```

These defaults intentionally match current behavior.

Important nuance:

- `seasonalFiltering` applies to bundle creation and swap filtering.
- `seasonalFilteringInSuggestions` defaults to `false` because suggestions historically did not exclude seasonal titles. Suggestions can still show `seasonal_blocked` as an explanation/warning without changing what appears.

## 5. Reason codes

Current structured reason codes:

| Code | Meaning | Tone |
| --- | --- | --- |
| `age_match` | Book/copy matched the member age-group query. | positive |
| `interest_match` | Book theme matched member interests. | positive |
| `note_match` | Member notes boosted the book. | positive |
| `theme_variety` | Book is a variety pick rather than a direct interest match. | neutral |
| `seasonal_allowed` | Seasonal filtering checked the book and allowed it. | neutral |
| `seasonal_blocked` | Book is seasonal and outside the allowed window. | warning/blocked depending context |
| `prior_title_penalty` | Suggestion was previously sent and received the existing penalty. | warning |
| `active_copy_excluded` | Copy was excluded because it is already assigned to an active shipment. | blocked |
| `duplicate_title_excluded` | Copy/title was excluded because the member already received or was assigned the title. | blocked |
| `avoided_topic_excluded` | Copy/title was excluded because it matched an avoid topic or note exclusion. | blocked |
| `fallback_pick` | Reserved for future fallback-pool explainability. | neutral |

## 6. UI changes

No UI change was made in Phase 5B.

Reason: the active picking screen currently displays the assigned shipment pick list returned by `getShipmentPickList`, not the full `picking.suggestBooks` output. Changing shipment-book write/display behavior to surface the new structured reasons would risk changing operator-facing picking behavior in this phase.

The backend now provides the structured explanation foundation. A later UI slice can safely expose it once we decide where selection reasons should be stored or read for already-created shipments.

## 7. Tests

Added and updated focused tests for:

- policy defaults matching current behavior
- reason codes emitted for suggested books
- prior-title suggestion behavior remaining unchanged by default
- optional future prior-title filtering isolated behind policy
- bundle creation excluding prior titles
- bundle creation excluding prior shipment titles
- bundle creation excluding active assigned copies
- bundle creation excluding seasonal blocked books
- bundle creation excluding avoided-topic books
- selected bundle copies exposing internal explanation codes
- existing picking service behavior continuing to pass
- existing cycle guard behavior continuing to pass

## 8. Remaining smarter-selection ideas

Recommended future improvements:

1. Decide whether operators should see previously sent titles in suggestions or only in a separate warning/diagnostic panel.
2. Store structured selection reasons on `shipment_books` once schema changes are allowed.
3. Add a dedicated operator “Why this book?” UI for assigned pick lists.
4. Add an override path for approved duplicate-title exceptions.
5. Add stricter database-level member/title duplicate protection when migrations resume.
6. Replace fixed seasonal dates with owner-configurable seasonal windows.
7. Add fallback-pool behavior for low inventory, with explicit `fallback_pick` reasons.
8. Consider transactional selection/allocation so selected copies cannot be claimed between scoring and shipment creation.

## 9. Recommended Phase 5C

Recommended next phase: **Phase 5C: Selection Explainability UI and Shipment Reason Persistence Design**.

Suggested scope:

- decide whether selection reasons should be persisted on `shipment_books`
- design UI badges for assigned pick lists
- avoid schema changes until the persistence decision is approved
- keep customer-facing surfaces out of scope