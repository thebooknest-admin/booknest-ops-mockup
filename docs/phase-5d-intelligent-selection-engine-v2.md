# Phase 5D: Intelligent Selection Engine v2

## 1. Executive summary

Phase 5D upgrades the fulfillment book-selection engine from mostly score sorting into a more curated selector.

The engine now considers:

- author diversity
- theme diversity
- obvious series continuation/order
- inventory health
- gentle reading progression
- premium balancing
- centralized configurable scoring weights
- expanded operator-facing explanation reason codes

This phase changes runtime selection behavior for new bundle creation. It does not change database schema, migrations, route names, RPC contracts, or customer-facing/WordPress surfaces.

No UI changes were made. The active picking UI still displays existing assigned pick-list instruction text from `getShipmentPickList`.

## 2. Files changed

Backend selection engine:

- `server/domains/fulfillment/services/book-selection/selection.engine.ts`
- `server/domains/fulfillment/services/book-selection/selection.types.ts`
- `server/domains/fulfillment/services/book-selection/selection.explanations.ts`
- `server/domains/fulfillment/services/book-selection/index.ts`

New config:

- `server/domains/fulfillment/services/book-selection/selection.config.ts`

Tests:

- `server/domains/fulfillment/services/book-selection/selection.engine.test.ts`

Documentation:

- `docs/phase-5d-intelligent-selection-engine-v2.md`

## 3. Behavior changes

### Author diversity

The final bundle selector now applies a soft penalty to additional books by an author already selected for the shipment when other authors are available.

This is not an absolute ban. If inventory is limited or a repeated-author book remains much stronger after penalties, it can still be selected.

### Theme diversity

The final bundle selector now applies a soft penalty to additional books from a theme already selected for the shipment when other themes are available.

This prevents same-theme clustering when good alternatives exist, while still allowing a stronger interest match to win.

### Series awareness

The engine now detects obvious numbered series patterns such as:

- `Series Name #2`
- `Series Name Book 2`
- `Series Name (Book 2)`

Behavior:

- It prefers the next obvious book in a series when member history indicates the prior book was already sent.
- It blocks obvious later books when earlier books are not in member history, e.g. avoiding Book 2 before Book 1.

This is deliberately conservative and only applies to obvious title patterns.

### Inventory health

The engine now gives a small bonus to titles with healthier in-house copy counts.

This is intentionally a small nudge. A much better recommendation, such as a direct interest match, should still beat a healthier but weaker inventory candidate.

### Reading progression

When prior title metadata includes page counts, the engine slightly favors books with page counts modestly above the member’s prior average.

The engine does not skip age tiers. It still queries in-house copies for the member’s current age group only.

### Premium balancing

The engine now avoids clustering multiple premium books into the same shipment when standard alternatives exist.

Premium detection uses existing metadata only:

- `book_titles.premium_flag`
- or `book_titles.estimated_market_value` above the configured threshold

### Configurable rule weights

Selection constants now live in `DEFAULT_SELECTION_ENGINE_CONFIG`, including:

- base score
- interest-match bonus
- located-copy bonus
- inventory-health bonuses
- series-continuation bonus
- reading-progression bonus
- repeated-author penalty
- repeated-theme penalty
- premium-cluster penalty
- healthy inventory thresholds
- premium value threshold
- reading progression page delta

## 4. Explanation improvements

Added reason codes:

- `author_diversity`
- `theme_diversity`
- `series_continue`
- `series_order_blocked`
- `inventory_health`
- `reading_progression`
- `premium_balance`

Existing reason codes remain available.

Selected bundle candidates now carry richer internal explanations through `explanationsByCopyId`; excluded candidates carry `exclusions` with codes such as `series_order_blocked`, `duplicate_title_excluded`, and `active_copy_excluded`.

These explanations are not persisted yet because Phase 5D does not change schema.

## 5. UI changes

No UI changes were made.

Reason: the active picking page displays assigned shipment rows from `getShipmentPickList`, not the full selection-engine candidate data. Without persisting selection metadata on `shipment_books`, showing structured v2 reasons on already-created assigned pick lists would be unreliable.

## 6. New tests

Added focused regression coverage for:

- selection policy defaults and v2 config defaults
- additive suggestion explanations
- prior-title suggestion behavior remaining unchanged by default
- core bundle exclusions still working
- author diversity
- theme diversity
- series continuation
- blocking obvious later series books before earlier books
- inventory-health nudging
- inventory-health not overpowering a much stronger recommendation
- reading progression
- premium balancing

Existing focused picking and cycle-guard tests still pass.

## 7. Known limitations

- Series detection is intentionally conservative and title-pattern based.
- Series continuation relies on available prior title metadata; incomplete history limits effectiveness.
- Reading progression currently uses page count as a rough proxy, not formal reading level.
- Premium balancing depends on existing `premium_flag` or `estimated_market_value`; missing metadata means a book is treated as standard.
- Selection remains application-level and non-transactional.
- Structured v2 explanations are not persisted to `shipment_books` yet.
- Swap flow still uses `select_books_for_shipment` RPC candidate output and has not been migrated to the v2 app-layer selector.
- Suggestions remain less strict than actual bundle creation; previously sent titles can still appear in suggestions by default with a penalty.

## 8. Rollback plan

To rollback Phase 5D behavior:

1. Restore the previous Phase 5B `selection.engine.ts` behavior.
2. Remove or stop using `selection.config.ts`.
3. Remove new v2 reason codes from `selection.types.ts` and `selection.explanations.ts` if desired.
4. Revert the new v2-focused test cases.
5. Keep API route names and schema untouched; no database rollback is required.

Because no migrations or schema changes were made, rollback is code-only.

## 9. Recommended next phase

Recommended next phase: **Phase 5E: Persist Selection Metadata for New Assignments**.

Suggested scope:

- decide whether schema changes are approved
- if approved, add a JSON metadata column to `shipment_books`
- persist v2 reason codes, config version, selected score, and reason labels for new assignments
- update `getShipmentPickList` to expose persisted metadata
- add small operator badges in the picking UI only when persisted metadata exists