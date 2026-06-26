# Phase 5E: Selection Metadata Persistence & Operator Explainability

## Executive summary

Phase 5E makes Pippa's book-selection reasoning durable. The selection engine now emits a metadata snapshot for each assigned shipment book, and shipment creation stores that snapshot on `shipment_books.selection_metadata`. Picking and shipment-detail views read the persisted metadata only; they do not regenerate explanations for older shipments.

This phase also removes Phase 5D premium balancing from the active engine because premium inventory is not currently part of Book Nest's approved fulfillment rules.

## Migration

Additive migration created:

```sql
ALTER TABLE public.shipment_books
  ADD COLUMN IF NOT EXISTS selection_metadata jsonb NULL;
```

Existing rows are not modified. Legacy shipment books therefore keep `selection_metadata = null` until a future backfill is explicitly designed.

## Schema

`shipment_books.selection_metadata` is nullable JSONB. It stores the selection decision as it existed at assignment time.

The app intentionally treats missing metadata as legacy history, not as a prompt to recompute explanations.

## Persisted JSON structure

The engine persists:

- `engine_version`
- `policy_version`
- `selected_at`
- `final_score`
- `score_breakdown`
- `explanation_codes`
- `explanation_labels`
- `explanations`
- `author_diversity_adjustment`
- `theme_diversity_adjustment`
- `series_continuation`
- `series_order_validation`
- `reading_progression_adjustment`
- `inventory_health_adjustment`
- `pippas_surprise`

Swap replacements store a new metadata snapshot with `source: "swap"` and keep the previous row metadata under `previous_selection_metadata`.

## Operator UI

Picking and Shipment Detail now show a small collapsible **Why this book?** card when persisted metadata exists.

Supported badges include:

- Age Match
- Interest Match
- Series Continuation
- Theme Variety
- Reading Progression
- Inventory Health
- Author Diversity
- Pippa's Surprise

Legacy shipment books hide the card gracefully.

## Behavior changes

- New shipment-book assignments now persist selection metadata.
- `picking.getShipmentPickList` returns persisted `selection_metadata` or `null`.
- `shipments.byId` returns persisted `selection_metadata` on each book or `null`.
- Swapping a shipment book writes replacement metadata and preserves the original metadata inside that replacement snapshot.
- Premium balancing logic and premium-related selection configuration were removed from active runtime behavior.
- Pippa's Surprise is now an explicit selection reason when the engine can include one discovery pick without sacrificing a much better recommendation.

## Rollback plan

1. Revert the app changes that write/read `selection_metadata`.
2. Leave the nullable column in place; it is additive and harmless if unused.
3. If a database rollback is required in a non-production environment, drop the column only after confirming no dependent app version is running.
4. Restore the prior selection engine version from source control if the new Pippa's Surprise behavior needs to be disabled.

## Future uses

Persisted metadata can later support:

- operator audit trails;
- selection quality review;
- shipment-history explainability on member profiles;
- policy-version comparisons;
- safe future backfills for legacy shipments;
- smarter swap analytics;
- reporting on discovery picks versus interest matches.