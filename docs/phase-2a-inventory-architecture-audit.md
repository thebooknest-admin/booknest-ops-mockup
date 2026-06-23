# Phase 2A: Inventory Architecture Audit

**Audit date:** 2026-06-23  
**Scope:** read-only code audit. No database, API, UI, migration, or behavior changes were made.  
**Method:** current repository source, checked-in scripts, and checked-in SQL. The live Supabase schema, constraints, RLS policies, RPC definitions, and data were not inspected; table/field findings below are inferred from application access.

## 1. Executive summary

The app has a workable copy-level inventory model: a `book_titles` catalog entry can have many `book_copies`, each copy has a SKU, age group, bin, optional shelving section, label state, and lifecycle status. Intake, QC, label printing, stock placement, picking, shipping, and returns all operate on those copies.

The model is currently implemented as direct PostgREST reads and writes in route handlers. It has no visible inventory-movement ledger, no first-class location table, and no database-enforced lifecycle transition boundary in this repository. The most important Phase 2 risks are direct arbitrary status updates, copies that remain `in_house` while assigned to a shipment, duplicate title protection enforced only in application queries, and multiple competing vocabulary sets for age tiers, plans, statuses, and bins.

The checked-in Drizzle schema remains a MySQL starter-user schema and is not the inventory model. `server/supabase.ts`, current routers, Supabase scripts, and the maintenance scripts are the relevant audit sources.

## 2. Current inventory model

```text
book_titles ──< book_copies ──< shipment_books >── shipments ──> members
                    │                                      │
                    ├── return_books >── returns            └── member_book_history
                    ├── book_sorting_tags (via title.tag_ids)
                    └── bin_id + section (inline location)

donations (separate intake log; no visible enforced copy link)
bin_floor_config (low-stock configuration, not a location catalog)
shipment_book_swaps (the only explicit copy-change audit table found)
```

### Lifecycle implemented in code

1. **Receive:** `receive.addBook` upserts/creates a title, creates a copy with a generated SKU, `pending_qc`, pending label state, bin, and optional section.
2. **QC:** `qc.pass` sends a copy to `pending_stock` by default or `pending_label` when reprint is requested. `qc.fail` sends it to `donated_lfl`.
3. **Labels:** `labels.markPrinted` records the print and moves only `pending_label` copies to `pending_stock`.
4. **Stock:** `stock.confirmPlaced` / `confirmAll` set copies to `in_house`; placement can overwrite bin and section.
5. **Pick/pack/ship:** shipment rows and shipment-book rows track the order process. Copy status is generally left `in_house` through picking/packing, then shipping sets it to `in_transit`.
6. **Return:** return processing creates/updates return records, then sets a received copy to `in_house`, or a missing copy to `lost`/`withdrawn`.

## 3. Current tables and fields found

| Resource | Fields observed in source | Use |
| --- | --- | --- |
| `book_titles` | `id`, `isbn`, `title`, `author`, `cover_url`, `age_group`, `suggested_age_tier`, `primary_topic`, `bin_theme`, `tag_ids`, `description`, `subjects`, `publisher`, `published_date`, `page_count`, `metadata_source`, `metadata_fetched_at`, `classification_version`, `needs_reclassification`, timestamps | Catalog/metadata and title-level classification. Read/written by inventory detail/update, receive, ISBN/maintenance scripts. |
| `book_copies` | `id`, `sku`, `book_title_id`, `isbn`, `age_group`, `bin` (legacy interface), `bin_id`, `section`, `status`, `condition`, `label_status`, `received_at`, `label_printed_at`, `stocked_at`, `qc_notes`, `qc_passed_at`, `qc_failed_at`, `notes`, timestamps | Physical inventory source of truth in application code. |
| `book_sorting_tags` | `id`, `bin_theme`, `tag` | Title taxonomy, classification, receive-time tag creation. |
| `bin_floor_config` | `id`, `bin_code`, `min_bin_floor`, `active`, `note` | Low-stock configuration used by inventory summary. It is not a bin/location master. |
| `shipments` | `id`, `member_id`, `order_number`, `shipment_number`, `status`, `shipment_type`, `scheduled_ship_date`, `actual_ship_date`, `tracking_number`, `carrier`, `label_url`, `address_id`, timestamps | Outbound workflow and return linkage. |
| `shipment_books` | `id`, `shipment_id`, `book_title_id`, `book_copy_id`, `status`, `picked_at`, `scanned_at`, `selection_reason`, `match_score`, `created_at` | Title/copy assignment and scan state per shipment. |
| `shipment_book_swaps` | `shipment_id`, old/new copy and title IDs, `reason` | Explicit swap audit trail; no equivalent generic location/status ledger was found. |
| `returns` | `id`, `member_id`, `return_number`, `original_shipment_id`, `status`, `return_type`, `return_tracking_number`, `actual_return_date`, `processed_at`, `notes`, timestamps | Return bundle/cycle record. |
| `return_books` | `return_id`, `shipment_book_id`, `book_copy_id`, `received`, `condition_on_return`, `condition_notes`, `action`, `processed_at`, `created_at` | Per-copy return disposition/history. |
| `member_book_history` | `member_id`, `book_title_id`, `shipment_id`, `received_date`, `returned_date`, `kept`, `notes`, `created_at` | Application-level duplicate-title avoidance and member history. No unique constraint is visible in this repository. |
| `members` | Inventory-relevant fields: `id`, `tier`, `age_group`, `books_per_box`, `topics_to_avoid`, `notes`, `subscription_status`, `welcome_form_completed`, `next_ship_date` | Pick eligibility and bundle size. |
| `member_interests`, `member_credits`, `member_addresses` | interest category, credits, shipping address fields | Supporting selection, plan, and fulfillment data. |
| `donations` | `donor_name`, `donor_email`, `isbn`, `title`, `author`, `condition`, `age_group`, `bin_id`, `tags`, `notes`, `status`, `created_at` | Donation log/intake. No visible enforced foreign key from a donation row to the received copy. |
| `damaged_book_reports`, `missing_bundle_reports` | report IDs, copy/member/shipment references, damage flags, notes, resolution fields | Support evidence. These do not directly define a copy disposition in the audited code. |

### Where Supabase is accessed

- `server/supabase.ts` is the generic REST client plus catalog, copy, inventory-summary, member, shipment, address, bin-floor, and title-with-copy aggregation helpers.
- `server/domains/_legacy/legacy-app-router.ts` is the largest inventory access surface: inventory detail/update, labels, receive, QC, stock, donations, returns, member bundle creation, and shipment administration.
- `server/domains/fulfillment/{picking,packing,shipping}.router.ts` read and mutate copies, shipment books, shipments, member history, and addresses.
- `server/webhooks/easypost-tracking.ts` mutates return/shipment status and can create a shipment.
- `scripts/backfill-metadata.js` mutates title metadata; `scripts/reclassify-books.js` mutates title classification/tag fields.
- `scripts/supabase/001_label_status_not_required.sql` and `003_book_copy_sections.sql` are the only relevant checked-in Supabase schema changes.

The code also calls database RPCs `get_shipment_pick_list` and `select_books_for_shipment`; their SQL/constraints are not present in the repository, so their safety guarantees are unknown.

## 4. Current statuses found

### Book-copy status values

| Status | Current use | Notes |
| --- | --- | --- |
| `pending_qc` | Receive creates copies here; QC queue reads it. | Clear intake state. |
| `pending_label` | QC reprint/pass-all path; labels queue and print transition. | Overlaps with a pending `label_status`; receive starts with `pending_qc` *and* label pending. |
| `pending_stock` | QC pass default and label-print path; stock queue reads it. | Clear shelving queue state. |
| `in_house` | Available pool, stock completion, returned copies, picking candidate source. | Also remains on shipment-assigned copies until shipping. |
| `reserved` | Accepted by pick confirmation. | Defined but no direct write was found in the audited TypeScript; reservation is incomplete. |
| `in_transit` | Set by shipping; return queue and in-flight views read it. | Clear member-held state, but only reached late in fulfilment. |
| `returned` | Inventory summary, display, and backfill filters recognize it. | No dedicated writer was found; returns currently set received copies directly to `in_house`. |
| `restricted` | Inventory UI/detail and backfill filters recognize it. | No dedicated workflow writer was found; generic `updateCopy` can set it. |
| `donated_lfl` | QC failure and terminal label exclusion. | The only explicit donation-out copy disposition. |
| `lost` | Return outcome `missing`; terminal label exclusion. | Clear terminal state. |
| `withdrawn` | Missing/kept return outcome; terminal label exclusion. | Clear terminal state. |
| `damaged`, `retired` | Terminal set and label-status SQL recognize them. | Not in the canonical `BOOK_COPY_STATUSES` object and no dedicated workflow writer was found. |
| `donated` | Excluded by inventory summary. | Not in the canonical status object and no dedicated writer was found; overlaps `donated_lfl`. |

### Related but separate state vocabularies

- **Label status:** `pending`, `printed`, `not_required`.
- **Shipment status:** `picking`, `packing`, `packed`, `shipped`, `cancelled`; UI additionally recognizes `swap_requested`.
- **Shipment-book status:** `ready_for_picking`, `picked`.
- **Return status:** `requested`, `in_transit`, `receiving`, `received`.
- **Donation log status:** free-form input defaulting to `received`; the donation page also uses a `rejected` outcome.

### Status-model issues

- `returned`, `reserved`, `restricted`, `damaged`, `retired`, and `donated` are either only partially implemented or have no dedicated writer.
- `donated` and `donated_lfl` overlap.
- Copy status and label status can describe competing queue positions. Example: a received copy is `pending_qc` while its label status is already `pending`; `labels.pending` only lists `in_house`/`pending_label` copies.
- Shipment-book state is independent from copy state and can say `picked` while the copy remains `in_house`.

## 5. Current age-tier values

### Canonical shared values

`shared/booknest.ts` defines exactly four keys:

- `hatchlings` — Hatchlings (0–2)
- `fledglings` — Fledglings (3–5)
- `soarers` — Soarers (6–8)
- `sky_readers` — Sky Readers (9–12)

Only Soarers and Sky Readers require sections. Their configured section capacities are 25 and 20 respectively.

### Other values and inconsistencies

| Source | Value / issue |
| --- | --- |
| `client/src/lib/ageInference.ts` | Uses `skyreaders` (no underscore), a duplicate type/model independent of shared constants. |
| UI and mock data | Use display strings such as `Hatchlings (0-2)` and `Sky Readers (9-12)`. |
| `normalizeAgeGroup` | Converts several Sky variants to `sky_readers`, but has no `13+` normalization. |
| `server/domains/inventory/isbn.router.ts` | Classification candidate union includes display value `13+`. |
| `scripts/reclassify-books.js` | AI prompt includes `13+`. |
| `client/src/lib/tags.ts` | Its bin-prefix map contains only the four display tiers. |

`thirteen_plus` does not occur in the repository. `13+` exists only as an ISBN-classification/maintenance-script candidate; it has no canonical key, display mapping, SKU prefix, bin mapping, section rule, or pick/receive support.

## 6. Current bin, section, and location model

- The physical location is stored inline on `book_copies` as free-form `bin_id` plus optional `section`; `BookCopy.bin` appears only as a legacy interface field.
- `bin_theme` is title-level classification, not a physical-location relation.
- `formatInventoryLocation` renders a section by replacing a `-01` suffix and appending the section. For example, `HATCH-ADV-01` plus `A` displays as `HATCH-ADV-A`.
- `getBinCodeForAgeGroupAndTheme` produces canonical-looking codes such as `HATCH-ADV-01`; `client/src/lib/tags.ts` independently builds the same type of code from display strings. Mock data uses additional short variants such as `HAT-*`, `FLD-*`, and `SOR-*`.
- The receive flow can auto-select the first section with capacity or accept a manual section. Inventory backfill assigns sections for Soarers/Sky Readers. The checked-in migration only constrains a section to one to three uppercase letters and indexes `(age_group, bin_id, section)` for in-house copies.
- `bin_floor_config` supplies active bin-floor thresholds, but there is no `bins`, `sections`, `storage_locations`, or location-capacity table in the audited source.
- Location changes overwrite `book_copies.bin_id`/`section` through `inventory.updateCopy`, `stock.confirmPlaced`, stock bulk completion, and section backfill. No generic `inventory_moves`/`location_history` table or audit trail exists. `shipment_book_swaps` is the lone explicit movement-like audit record and applies only to pick substitutions.

## 7. Current condition-tracking usage

Condition tracking is pervasive and conflicts with the stated business rule.

| Area | Current behavior |
| --- | --- |
| Receive | `receive.addBook` validates `condition` with default `good` and stores it on `book_copies`. `ReceivePage` always submits `good`. |
| Inventory detail | `BookDetailDrawer` reads, displays, edits, and submits copy condition through `inventory.updateCopy`. |
| Generic inventory update | `inventory.updateCopy` accepts and writes arbitrary condition text. |
| QC | `QCQueuePage` displays condition; `qc.pass` accepts/writes it; `qc.passAll` writes `good`. |
| Stock | `StockQueuePage` reads and displays condition; stock queries select it. |
| Donations | `DonationIntakePage` has a condition-assessment step and routes `poor` items to a rejected donation record; `DonationLogPage` displays/color-codes condition; `donations.add` validates/stores it. |
| Returns | `processReturnedBook` always writes `return_books.condition_on_return = "good"`, stores `condition_notes`, and returns pages read/display those notes. |
| Types/mock data | `server/supabase.ts` exposes copy condition; `client/src/lib/data.ts` defines `DonationCondition` and mock values. |
| SQL/scripts | No checked-in migration adds a condition column. `001_label_status_not_required.sql` treats `damaged` as a terminal copy status. Metadata/classification scripts do not read or write condition. |

Damage/missing support reports are separate structured evidence (`torn_pages`, `cover`, `writing_marks`, etc.), not the `condition` field; however, they currently do not feed a unified inventory disposition workflow.

## 8. Current plan and book-count assumptions

- Backend selection is driven by `member.books_per_box` when set; otherwise both the legacy bundle creator and picking router fall back to hardcoded maps: Little Nest = 4, Cozy Nest = 6, Story Nest = 8, default = 4.
- Cozy Nest = 6 is hardcoded in `server/domains/_legacy/legacy-app-router.ts`, `server/domains/fulfillment/picking.router.ts`, and `client/src/pages/PackingPage.tsx`.
- Packing UI duplicates both hyphenated and underscored plan codes; member/order/shipping UIs duplicate display-name mappings.
- `SignupPage` uses underscored plan codes; legacy backend normalizes spaces to hyphens; `MembersPage` recognizes underscored names. Mock data additionally defines `Sky Nest`, which is absent from the live selection maps.
- `WelcomePage` falls back to four books when `books_per_box` is absent.
- Member creation separately hardcodes credit allocation (Story Nest = 2, Cozy Nest = 1); that is not bundle-count logic but is another plan rule outside a centralized plan model.

## 9. Risk areas

### High risk: lifecycle bypass and double allocation

1. **Arbitrary copy mutation:** `inventory.updateCopy` accepts any `status`, bin, section, condition, age group, SKU, and notes. It does not validate the old state, shipment/return relationship, or allowed transition. It can make an in-flight copy available, move it, or put it into a terminal state directly.
2. **Assigned copies remain available:** pick-order creation stores copy IDs in `shipment_books` but normally leaves their `book_copies.status` as `in_house`. `picking.suggestBooks` selects every matching `in_house` copy and does not exclude copies assigned to other active shipments.
3. **Non-atomic pick confirmation:** `picking.confirmPicks` validates then separately patches shipment-book rows and shipment status. It never reserves/locks the copy. Two concurrent requests can pass the availability check before either finishes.
4. **Swap does not reserve replacement:** `picking.swapShipmentBook` releases the old copy to `in_house`; the “Reserve new copy” PATCH only updates `updated_at`, leaving the replacement available. The database RPC used to select a candidate is not present, so it cannot be relied on from this repository.
5. **Non-atomic shipping:** `shipping.markShipped` checks copies, then separately patches copies, shipment books, shipment, and history. There is no visible transaction or conditional write tied to the observed status.

### High risk: member-cycle and duplicate-title rules

6. **New bundle can be created while a book is in flight:** `createPickingOrderForMember` blocks only outbound `picking`, `packing`, and `packed` shipments. It does not block a `shipped` outbound shipment or require its return to be handled. `members.requestBundle` invokes it directly.
7. **Webhook creates next shipment early:** `server/webhooks/easypost-tracking.ts` can create a new `picking` shipment when a return becomes `in_transit`, rather than after return processing is complete.
8. **Duplicate-title protection is query-only:** legacy bundle creation builds a prior-title set from history and shipment books, but there is no visible unique `(member_id, book_title_id)` constraint. `picking.suggestBooks` marks already-sent titles in reasons rather than excluding them. The unknown select-books RPC and manual swap lack inspectable title-uniqueness guarantees.

### Medium risk: return, status, and location ambiguity

9. **Return processing can release a copy directly:** `processReturn` accepts a copy ID and the return service ultimately sets a received copy to `in_house`, with fallback lookup of the most recent shipment-book row. It does not visibly assert that the copy is currently in transit for that specific member/cycle. `issue` also returns the copy to `in_house`.
10. **Status vocabulary drift:** `returned`, `reserved`, `restricted`, `donated`, `damaged`, and `retired` are not consistently written or represented in canonical constants. Label and copy queue status can disagree.
11. **No location history:** retroactive edits, stock confirmation, and section backfill overwrite location with no who/when/from/to record.
12. **Receive/SKU race:** receive finds the first unused SKU from a read, then inserts a copy. No visible uniqueness constraint or transaction protects concurrent intake from selecting the same SKU.
13. **Title matching is heuristic:** receive first matches raw ISBN, then case-insensitive title + author; no normalized ISBN or database uniqueness guarantee is visible.

## 10. Recommended Phase 2B next steps

Do these as a design-and-migration plan before touching production data:

1. **Capture the live Supabase baseline:** export tables, constraints, indexes, RLS, triggers, and the two existing pick RPC definitions. Reconcile it with this report.
2. **Define canonical vocabularies:** one copy-state machine, one label state model, one return state model, canonical age keys including the required `thirteen_plus`, canonical plan codes, and one source for plan book counts.
3. **Design transition RPCs:** make receive, QC pass/fail, print label, stock, allocate/release pick, confirm pick, ship, return, and manual disposition transaction-owned functions with old-state guards and idempotency keys.
4. **Enforce circulation integrity:** plan a unique active allocation per copy, a unique member/title history rule with an explicit override path, and one active member circulation cycle that blocks the next bundle until return handling finishes.
5. **Design a location model:** introduce a location master (bin/section), a location/move audit record, and scoped capacity rules. Preserve existing `bin_id`/`section` values through a mapping/backfill plan.
6. **Replace condition with disposition:** remove condition capture from the future workflow, preserve historical data for reporting, and define explicit `circulate`, `donate_out`, and `remove_from_circulation` outcomes with reason/audit fields.
7. **Unify intake and donations:** determine whether a donation intake item becomes a book copy, a rejected/donated-out disposition, or both through linked records.
8. **Add invariant tests before implementation:** concurrent allocation, duplicate member/title, in-flight return gating, stale scan retry, return association, SKU collision, and location move audit tests.

No Phase 2B migration should be applied until the live-schema baseline and existing RPC behavior are reviewed.