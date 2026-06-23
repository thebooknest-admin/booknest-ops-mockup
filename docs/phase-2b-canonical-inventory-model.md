# Phase 2B: Canonical Inventory Model Design

**Date:** 2026-06-23  
**Scope:** design constants and types only. No migration, database, query, API, UI, or runtime-flow change was made.

## Executive summary

A future-facing canonical inventory vocabulary now lives in `shared/inventory-model.ts`. The module is deliberately unreferenced by current runtime code. It provides one proposed type/constant contract for age tiers, plans, copy lifecycle, circulation dispositions, labels, shipment states, return states, and locations, plus pure normalization/migration-identification helpers.

This is a design baseline, not an activation. Existing `shared/booknest.ts`, API DTOs, Supabase writes, existing queries, UI flows, legacy values, and route behavior remain unchanged.

## Added shared contract

### Age tiers

`CANONICAL_AGE_TIERS` defines exactly:

- `hatchlings` — Hatchlings
- `fledglings` — Fledglings
- `soarers` — Soarers
- `sky_readers` — Sky Readers
- `thirteen_plus` — 13+

`AGE_TIER_DISPLAY_LABELS` preserves the existing age-range labels for the first four tiers and uses `13+` as the display label for `thirteen_plus`.

`normalizeLegacyAgeTier()` is a pure helper for future migration code. It recognizes legacy display labels, `skyreaders`, `sky_readers`, and `13+`; it is not used by any current query or route.

### Plans

`PLAN_DEFINITIONS` defines these proposed canonical plan codes:

| Plan code | Label | Book count |
| --- | --- | --- |
| `little_nest` | Little Nest | 4 |
| `cozy_nest` | Cozy Nest | **6** |
| `story_nest` | Story Nest | 8 |

`normalizeLegacyPlanCode()` recognizes the current display, hyphenated, and underscored variants. It intentionally returns `null` for the mock-only `Sky Nest`, because its business definition is not established.

### Circulation dispositions

`CIRCULATION_DISPOSITIONS` defines the future decision vocabulary:

- `circulatable`
- `donated_out`
- `removed`

These are intentionally distinct from a copy lifecycle status. A future migration can record why an item leaves circulation without keeping a condition grade as the primary model.

### Proposed copy lifecycle

`COPY_STATUSES` proposes these valid future statuses:

```text
pending_qc → pending_label → pending_stock → in_house → reserved → in_transit
                                              ↑               ↓
                                     return_processing ←──────┘

terminal: donated_out, removed, lost
```

The complete transition map is encoded in `COPY_STATUS_TRANSITIONS` and checked by `isValidCopyStatusTransition()`:

- `pending_qc` → `pending_label`, `pending_stock`, `donated_out`, `removed`
- `pending_label` → `pending_stock`, `donated_out`, `removed`
- `pending_stock` → `in_house`, `donated_out`, `removed`
- `in_house` → `reserved`, `pending_qc`, `donated_out`, `removed`
- `reserved` → `in_house`, `in_transit`, `donated_out`, `removed`
- `in_transit` → `return_processing`, `lost`, `removed`
- `return_processing` → `pending_qc`, `in_house`, `donated_out`, `removed`
- `donated_out`, `removed`, and `lost` are terminal.

`return_processing` is the key proposed separation missing today: a returned book is physically received before an operator makes the circulation/disposition decision.

### Other state contracts

The module also defines canonical values/types for:

- labels: `pending`, `printed`, `not_required`
- shipments: `picking`, `packing`, `packed`, `shipped`, `cancelled`
- shipment books: `ready_for_picking`, `picked`
- returns: `requested`, `in_transit`, `receiving`, `received`

### Location contract

`InventoryLocation` defines a future first-class location shape:

```ts
{
  age_tier: CanonicalAgeTier;
  theme: InventoryTheme;
  bin_code: string;
  section_code: string | null;
  display_code: string;
}
```

`INVENTORY_THEMES` retains the eight existing theme names. `formatCanonicalLocationDisplayCode()` is a pure, unused formatter for the existing `BIN-...-01` plus section display convention.

## Legacy values requiring future migration or review

| Existing value | Future guidance |
| --- | --- |
| `skyreaders` | Normalize to `sky_readers`. |
| Existing age display strings | Normalize to canonical keys while retaining display labels at the UI edge. |
| `13+` | Normalize to `thirteen_plus`; add data/bin/SKU rules only in a later approved migration. |
| `donated_lfl`, `donated` | Map to `donated_out`. |
| `withdrawn`, `damaged`, `retired` | Map to `removed`; preserve a reason/audit record in the future schema. |
| `returned` | Review per copy: map to `return_processing` or `in_house`; do not blindly convert. |
| `restricted` | Review; its operational meaning is currently ambiguous. |
| `Sky Nest` | Mock-only legacy plan; require an explicit business decision before defining a canonical code/count. |
| Hyphenated/display plan codes | Normalize to underscored canonical plan codes only in a future migration/API rollout. |

`LEGACY_COPY_STATUS_MIGRATIONS` and `identifyLegacyCopyStatusMigration()` encode this as non-mutating future migration guidance.

## Runtime impact

None.

- The new module is not imported by existing source code.
- Existing `shared/booknest.ts` remains unchanged and remains the active behavior source.
- No APIs, router inputs/outputs, Supabase calls, SQL, status writes, or client flows changed.
- No legacy values were removed, mapped in data, or validated at runtime.

## Files touched

| File | Change |
| --- | --- |
| `shared/inventory-model.ts` | New, unreferenced canonical constants/types/helpers design module. |
| `docs/phase-2b-canonical-inventory-model.md` | This design and migration-readiness report. |

## Risks and guardrails

1. The proposed model is intentionally not yet compatible with all existing runtime values; importing it into current code prematurely could change behavior.
2. `thirteen_plus` has no live bin, SKU, location-capacity, classification, or plan integration yet.
3. The transition map is a design artifact until a future database transaction/RPC layer enforces it.
4. The live Supabase schema and existing database RPCs still need an export/review before migration SQL is designed.
5. Existing condition data must be preserved or explicitly archived before any condition-to-disposition migration.

## Recommended Phase 2C next step

Create a **Supabase inventory migration specification**, still without applying it:

1. export and document the live Supabase schema, constraints, indexes, RLS policies, and the two pick RPC definitions;
2. map every live status, age tier, plan code, bin, and section value to the new contract and identify unresolved records;
3. design additive tables/columns/constraints for disposition, locations, movement history, active allocation, and member-title uniqueness;
4. design transactional RPCs that enforce `COPY_STATUS_TRANSITIONS` and the one-active-circulation-cycle rule;
5. review the specification and backfill plan before any SQL migration is written or run.