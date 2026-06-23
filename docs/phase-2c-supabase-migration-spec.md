# Phase 2C: Supabase Inventory Migration Specification

**Date:** 2026-06-23  
**Status:** design specification only — no SQL migration files, schema changes, runtime changes, API changes, or database actions were performed.  
**Inputs:** Phase 2A inventory audit, Phase 2B canonical model, current source, `scripts/supabase/001_label_status_not_required.sql`, `scripts/supabase/003_book_copy_sections.sql`, and current repository RPC references.

## 1. Executive summary

The current system is operationally useful but stores inventory lifecycle, physical location, allocation, and return state in independently patched rows. The target design should retain its copy-level model while moving integrity rules to PostgreSQL/Supabase transaction boundaries.

The migration must be **additive, observable, and reversible until cutover**. First capture the live Supabase baseline; then add canonical fields/tables and backfill without changing the active API. Only after reconciliation and approval should API/RPC cutover be designed. No final SQL is authorized by this document.

Primary target outcomes:

- one canonical age-tier and plan vocabulary;
- an explicit copy lifecycle plus circulation disposition;
- first-class locations and immutable inventory-move history;
- one active allocation per copy and one active circulation cycle per member;
- database-enforced duplicate-title prevention;
- idempotent receiving, printing, shipping, return, and webhook transactions.

## 2. Live schema information still needed

The checked-in Drizzle/MySQL starter schema is not relevant to the Supabase/Postgres inventory model. The repository does not include Supabase table definitions, RLS policies, trigger definitions, enum/check definitions, or the SQL for these runtime RPCs:

- `get_shipment_pick_list`
- `select_books_for_shipment`

Before drafting any migration SQL, export and version-control the following from the **live Supabase project**.

### Schema inventory

For every inventory-adjacent table, capture columns, types, defaults, nullability, primary/foreign keys, indexes, unique constraints, check constraints, generated columns, comments, and row counts:

- `book_titles`, `book_copies`, `book_sorting_tags`, `bin_floor_config`
- `shipments`, `shipment_books`, `shipment_book_swaps`
- `returns`, `return_books`, `member_book_history`
- `members`, `member_interests`, `member_credits`, `member_addresses`
- `donations`, `damaged_book_reports`, `missing_bundle_reports`
- any existing allocation, location, print, audit, webhook, or cycle tables not visible to this repository

### Database behavior and security

Capture:

- all row-level security policies and grants for each table and view;
- all triggers, trigger functions, scheduled jobs, and extensions;
- all PostgreSQL functions/RPCs, their signatures, source definitions, security mode (`security invoker`/`definer`), ownership, and grants;
- any enum types, domains, or check constraints that restrict age tiers, statuses, labels, plans, sections, or SKU formats;
- all views/materialized views used by PostgREST or dashboards;
- storage bucket policies if damaged-report photos or label artifacts are in Supabase Storage.

### Data profiling required before backfill

Record row counts and distinct-value counts for:

- `book_copies.status`, `label_status`, `condition`, `age_group`, `bin_id`, `section`, SKU nulls/duplicates, and title/copy ISBN values;
- `book_titles.age_group`, `suggested_age_tier`, `bin_theme`, ISBN values/normalization collisions, tag IDs, and reclassification flags;
- `members.tier`, `members.age_group`, `books_per_box`, subscription status, and active shipped/picking/packing/packed memberships;
- `shipments.status`, `shipment_type`, and shipments with no books/address/member;
- `shipment_books.status`, duplicate active copy assignments, missing copies, and title/copy mismatches;
- `returns.status`, unprocessed return books, and return/shipment/member mismatches;
- `member_book_history` duplicate `(member_id, book_title_id)` pairs;
- distinct donation statuses and condition values;
- distinct bin/section combinations, malformed values, collisions after normalization, and section occupancy by tier/theme/bin.

This inventory must include a timestamp and a transaction-consistent snapshot or maintenance-window note, so counts can be reconciled after a future backfill.

## 3. Proposed target schema changes

### Canonical vocabularies

Use the Phase 2B model as the future contract, not an immediate validation change:

- age tiers: `hatchlings`, `fledglings`, `soarers`, `sky_readers`, `thirteen_plus`;
- plans: `little_nest` (4), `cozy_nest` (6), `story_nest` (8); legacy `Sky Nest` remains unresolved;
- copy lifecycle: `pending_qc`, `pending_label`, `pending_stock`, `in_house`, `reserved`, `in_transit`, `return_processing`, `donated_out`, `removed`, `lost`;
- circulation disposition: `circulatable`, `donated_out`, `removed`;
- labels: `pending`, `printed`, `not_required`;
- shipment, shipment-book, and return statuses as defined in `shared/inventory-model.ts`.

For the initial migration stage, add canonical columns alongside legacy text values where needed. Do not replace current fields or install restrictive checks until data profiling, backfill, and compatibility reads are approved.

### Allocation and lifecycle design

A copy becomes `reserved` when allocated to an open outbound shipment. It remains unavailable until released, shipped, or explicitly disposed. `return_processing` begins when a copy is physically received; it is not automatically circulatable. A later transaction decides whether it returns to QC, inventory, donation-out, or removal.

The future database, rather than the client or separate REST patches, must own valid transitions and allocation lifecycle changes.

## 4. Proposed new tables

| Table | Proposed purpose | Essential fields |
| --- | --- | --- |
| `storage_locations` | Canonical physical locations, rather than free-form copy strings. | `id`, `age_tier`, `theme`, `bin_code`, `section_code` nullable, `display_code`, `active`, optional capacity, timestamps. |
| `inventory_moves` | Immutable inventory/location/status audit trail. | `id`, `book_copy_id`, `from_location_id`, `to_location_id`, `from_status`, `to_status`, `reason_code`, free-text note, `actor_id`, `operation_id`, timestamp. |
| `copy_allocations` | Source of truth for an active shipment reservation. | `id`, `book_copy_id`, `shipment_id`, `shipment_book_id`, `member_id`, `allocated_at`, `released_at`, `release_reason`, `operation_id`. |
| `member_cycles` | One outbound lending cycle per member until returns are handled. | `id`, `member_id`, `status`, `outbound_shipment_id`, `return_id`, `opened_at`, `closed_at`, `operation_id`, timestamps. |
| `operation_audit_log` | Cross-domain, append-only operator/audit history. | `id`, `operation_id`, `actor_id`, `entity_type`, `entity_id`, `action`, before/after JSON snapshots or hashes, timestamp. |
| `webhook_events` | Carrier webhook de-duplication and replay visibility. | `id`, `provider`, `external_event_id`, payload hash, received/processed timestamps, outcome, error, linked entity IDs. |
| `print_jobs` | Explicit label-print batch lifecycle. | `id`, template/version, printer metadata, `status`, requested/printed/failed timestamps, actor, idempotency key. |
| `print_job_items` | The copies included in a print job. | `id`, `print_job_id`, `book_copy_id`, label content/version, status, printed timestamp, failure detail. |
| `member_title_exceptions` (optional, approval required) | Explicitly records an approved duplicate-title exception instead of weakening history integrity. | `id`, `member_id`, `book_title_id`, reason, approver, expiry/created timestamp. |

All new IDs, timestamp conventions, actor identity linkage, and JSON type choices must match the live Supabase conventions discovered in the baseline.

## 5. Proposed changed tables

| Existing table | Proposed additive changes | Notes |
| --- | --- | --- |
| `book_titles` | `canonical_age_tier`, `isbn13_normalized`, optional canonical theme key; retain legacy `age_group`/ISBN during rollout. | Normalize ISBN before applying uniqueness; decide treatment of non-ISBN books and multiple editions. |
| `book_copies` | `canonical_status`, `circulation_disposition`, `disposition_reason`, `location_id`, `status_changed_at`, optional `active_allocation_id`; retain legacy `status`, `condition`, `bin_id`, `section` initially. | `condition` becomes historical/read-only before eventual removal. |
| `shipments` | `member_cycle_id`, immutable shipping-address snapshot reference/data, carrier external shipment/label IDs, status timestamps, idempotency key. | Keep current fields until API cutover. |
| `shipment_books` | reference to `copy_allocations`, explicit allocation/pick lifecycle timestamps. | Do not rely on nullable copy ID as the only reservation record. |
| `returns` | `member_cycle_id`, return lifecycle timestamps and idempotency keys. | Reconcile webhook-created shipments before linking. |
| `return_books` | explicit resulting `circulation_disposition`, `disposition_reason`, inspection/operator fields; retain historical condition fields during transition. | `condition_on_return` is legacy evidence, not future decision state. |
| `member_book_history` | normalized title key if required, created/updated provenance, optional exception reference. | Deduplicate before unique constraint. |
| `members` | `canonical_age_tier`, `canonical_plan_code`, optional current `member_cycle_id`. | Retain `age_group`, `tier`, and `books_per_box` while compatibility paths exist. |
| `donations` | intake disposition, linked `book_copy_id`/`intake_item_id`, canonical age tier/location references. | Allow donation-out without creating a copy. |

## 6. Proposed constraints and indexes

These are design requirements, not executable DDL.

### Integrity constraints

1. **SKU uniqueness:** unique non-null `book_copies.sku` after resolving existing collisions.
2. **Normalized ISBN uniqueness:** unique non-null `book_titles.isbn13_normalized`, subject to owner approval for edition/format policy and collision cleanup.
3. **Location identity:** unique active `(age_tier, theme, bin_code, section_code)` in `storage_locations`; define a null-section uniqueness policy explicitly.
4. **One active allocation per copy:** partial unique rule on `copy_allocations.book_copy_id` where `released_at` is null.
5. **One active circulation cycle per member:** partial unique rule on `member_cycles.member_id` for open statuses.
6. **Unique member/title history:** unique `(member_id, book_title_id)` after deduplication and with an explicit exception path if needed.
7. **Shipment-book allocation consistency:** an allocation must reference matching copy, shipment, shipment-book, and member values; enforce by foreign keys plus transaction validation where cross-table checks are needed.
8. **Status/disposition validity:** check/enumerated constraints for canonical status, disposition, label, shipment, shipment-book, and return values only after the dual-read/backfill period.
9. **Section format:** retain/extend the existing uppercase one-to-three-letter validation only after all legacy section values are profiled.

### Operational indexes

- available/pick queue: copy canonical status + canonical age tier + location, with a partial index for `in_house`;
- reservation lookup: active allocation by copy, shipment, and member;
- location lookup: `storage_locations.display_code`, plus active bin/section keys;
- return queue: active return status plus original shipment/member;
- member-cycle lookup: active cycle by member and outbound shipment;
- title selection: normalized ISBN and canonical title metadata;
- print queue: pending print job/item status by creation time;
- webhook de-duplication: `(provider, external_event_id)` unique;
- inventory history: `inventory_moves.book_copy_id` and `(operation_id, created_at)`;
- duplicate-title checks: `member_book_history(member_id, book_title_id)` unique/indexed.

Index choice must be validated with live row counts and explain plans; do not add broad indexes blindly to production.

## 7. Proposed RPC / transaction boundaries

Each future RPC should execute a single database transaction, record an `operation_id`, lock the involved copy/cycle/allocation rows, enforce expected old state, and accept an idempotency key. It should return the existing API-compatible data only when the later API-cutover phase is approved.

| RPC | Required transaction boundary |
| --- | --- |
| `receive_copy` | Resolve/create title, normalize age/tags/location, allocate SKU, create copy in `pending_qc`, record intake/move/audit. |
| `qc_pass_copy` | Lock copy in `pending_qc`; set next queue/status/disposition, label state, QC event, and audit. |
| `qc_fail_copy` | Lock copy in `pending_qc`; set `donated_out` or `removed` with reason, suppress labels, record audit. |
| `mark_label_printed` | Lock eligible copies and print-job items; change label state and required next copy state idempotently. |
| `stock_copy` | Lock eligible copy; validate target location/capacity/section; set `in_house`; append an inventory move. |
| `move_copy` | Lock copy; move between active locations without bypassing allocation/lifecycle constraints; append inventory move. |
| `allocate_copy_to_shipment` | Lock member cycle, shipment, title history, copy, and active allocation; require `in_house`, no active allocation, no prohibited prior title; create allocation and shipment-book assignment; set `reserved`. |
| `release_copy_from_shipment` | Lock allocation/shipment-book/copy; release only an open allocation; return copy to a permitted state and record reason/move/audit. |
| `confirm_pick` | Lock shipment and all allocations/copies; require shipment `picking`, matching reservations, and complete scan set; mark shipment books picked and advance shipment atomically. |
| `mark_packed` | Lock shipment and shipment books; require complete picked allocation set; advance only shipment state. |
| `mark_shipped` | Lock packed shipment, its allocations, and cycle; set tracking/carrier values, copy `in_transit`, shipment shipped, title history, and audit atomically; enqueue carrier tracking after commit. |
| `process_return_book` | Lock return, shipment-book/allocation/copy/cycle; assert association; record receipt/disposition; move copy to `return_processing` then selected destination; do not auto-release without an explicit disposition. |
| `create_member_cycle` | Lock member; require no active cycle and required subscription/address state; create cycle and outbound shipment idempotently. |
| `close_member_cycle` | Lock cycle and all expected return books; require every expected copy resolved; close cycle only when no unresolved allocation/return remains. |

### Existing RPC review

Before adding/replacing any function, inspect `get_shipment_pick_list` and `select_books_for_shipment` definitions, grants, locking, and filtering. Their existing behavior may already encode business rules not visible to this repository. The target allocation RPC must either subsume them or deliberately preserve their ranking behavior.

## 8. Data mapping plan

### Copy statuses

| Existing value | Target guidance |
| --- | --- |
| `pending_qc`, `pending_label`, `pending_stock`, `in_house`, `reserved`, `in_transit` | Retain as canonical values after profile/consistency validation. |
| `donated_lfl`, `donated` | Map to `donated_out`; retain original reason/source. |
| `withdrawn`, `damaged`, `retired` | Map to `removed`; retain original status as a reason/audit datum. |
| `lost` | Retain as terminal `lost`. |
| `returned` | Manual/derived review: map to `return_processing` when unresolved, otherwise `in_house` only after documented resolution. |
| `restricted` | Owner-approved policy required before mapping; do not automatically convert. |
| unknown/null | Quarantine in a migration exception report; no automatic lifecycle assignment. |

### Age tiers

| Existing value family | Target |
| --- | --- |
| `hatchlings`, display Hatchlings values | `hatchlings` |
| `fledglings`, display Fledglings values | `fledglings` |
| `soarers`, display Soarers values | `soarers` |
| `skyreaders`, `sky_readers`, Sky Readers display values | `sky_readers` |
| `13+` classification candidates | `thirteen_plus`, only after owner decides its bin/SKU/fulfillment policy |
| unrecognized values | exception report and owner review |

### Plan codes

| Existing value family | Target |
| --- | --- |
| `little_nest`, `little-nest`, Little Nest | `little_nest` |
| `cozy_nest`, `cozy-nest`, Cozy Nest | `cozy_nest` with 6 books |
| `story_nest`, `story-nest`, Story Nest | `story_nest` |
| Sky Nest | unresolved legacy/mock value; no automatic mapping |
| null/custom plans | retain as exception until owner decision |

## 9. Condition-to-disposition plan

Condition is not a future lifecycle field. Preserve it as historical evidence during the additive phase, then replace operational use with one explicit disposition and a reason.

1. Profile all `book_copies.condition`, `donations.condition`, `return_books.condition_on_return`, and condition-note values.
2. Add future disposition/reason fields without deleting condition values.
3. Backfill only high-confidence outcomes:
   - legacy `donated_lfl` → `donated_out`;
   - legacy `lost`, `withdrawn`, `damaged`, `retired` → `removed`/`lost` as specified above.
4. Do **not** map `good`, `like_new`, or `acceptable` directly to `circulatable` unless the record also has a valid lifecycle/status outcome; condition alone must not make a copy available.
5. Do **not** map `poor` or a damage report automatically to donation versus removal without owner policy.
6. In the later API/UI phase, replace condition prompts with an explicit `circulate`, `donate_out`, or `remove` decision and reason. Keep legacy condition read-only until retention requirements are satisfied.

## 10. Location migration plan

1. Profile distinct `book_copies.bin_id`/`section` combinations, including nulls, malformed values, display aliases (`HAT`/`HATCH`, `SOR`/`SOAR`), and potential collisions after normalization.
2. Build a reviewed mapping sheet from each raw combination to a future `storage_locations` row. Preserve raw source values and source IDs for rollback/reconciliation.
3. Create locations first, but do not switch runtime reads/writes yet.
4. Backfill `book_copies.location_id` only for unambiguous locations. Leave ambiguous/null records in an exception queue; never invent a bin from title theme alone.
5. Create initial `inventory_moves` records with a `migration_backfill` reason and null/legacy source location where a true before-location is unavailable.
6. Reconcile counts by copy status, age tier, bin, and section before any old fields are removed.
7. Later, direct all stock/move/return actions through transaction RPCs that write both current location and immutable move history.

## 11. Member-cycle preparation plan

1. Profile members with multiple open outbound shipments, shipped copies without returns, returns without source shipments, and shipment/copy mismatches.
2. Define the active-cycle statuses and exact closure criteria with owner approval.
3. Backfill one `member_cycles` row per unambiguous open/closed lending relationship. Flag all duplicates/overlaps instead of choosing arbitrarily.
4. Link the current outbound shipment and its return record where safe.
5. Add the active-cycle uniqueness constraint only after all conflicting members are resolved.
6. Make `create_member_cycle` the future gateway for a new bundle. It must block any member with an open/returning cycle and use member-title history before allocation.

## 12. Risks and rollback concerns

| Risk | Mitigation / rollback requirement |
| --- | --- |
| Unknown live constraints/RPC behavior | No SQL until baseline export and review. Preserve existing RPCs through the additive phase. |
| Status mapping changes availability | Backfill canonical fields alongside legacy fields; compare counts before cutover; retain old status until sign-off. |
| Duplicate historical member/title records | Produce an exception report before adding uniqueness; do not delete history automatically. |
| Location normalization collisions | Use reviewed mapping table and exception queue; preserve raw values and old columns. |
| New unique SKU/ISBN constraints fail | Profile duplicates/nulls first; resolve via owner-approved merge/exception policy. |
| Partial index/table build locks | Schedule maintenance window, use production-safe index strategy, and capture timings/row counts. |
| RPC cutover regression | Keep old endpoints/queries unchanged during schema backfill; validate shadow results and use idempotency keys. |
| Condition-data loss | Retain condition fields and audit values until retention/export policy is approved. |
| Carrier webhook replay | Add `webhook_events` and test replay before relying on webhook-triggered cycle creation. |
| Rollback after data backfill | Tag every backfill batch with `operation_id`, preserve legacy columns, take verified backup/export, and write reversal criteria before execution. |

## 13. Owner decisions needed before SQL

1. What physical bin/theme/SKU policy applies to `thirteen_plus`?
2. Is `Sky Nest` a real future plan, and if so what is its canonical code, book count, and credit rule?
3. Should all historical duplicate member/title pairs be prohibited going forward, or are approved repeat exceptions needed?
4. For a returned book, is the default next state `pending_qc` or can certain returns go directly to `in_house`?
5. What distinguishes `donated_out` from `removed`, and which disposition/reason applies to poor/damaged donations and return issues?
6. What is the intended meaning and future mapping of `restricted`?
7. Must normalized ISBN be unique across all catalog entries, or may multiple title records represent editions/formats sharing a normalized ISBN?
8. What are the authoritative physical bin aliases when current codes conflict (`HAT` vs `HATCH`, `SOR` vs `SOAR`)?
9. Which actor identity should populate movement/audit tables: existing app user IDs, Supabase Auth IDs, or a new operator identity bridge?
10. What status and evidence must be present before a member cycle closes and a new one may open?
11. How long must historical condition and location data be retained after cutover?

## 14. Recommended Phase 2D next step

Perform a **live Supabase baseline capture and data-profile review** only:

- export schema, RLS, triggers, grants, functions/RPC definitions, and relevant storage policies;
- run the profiling checklist in Section 2 against a consistent snapshot;
- create a reviewed exception workbook for unknown statuses, age tiers, plan codes, bins/sections, duplicate titles, SKU/ISBN collisions, and overlapping cycles;
- obtain written owner decisions from Section 13;
- update this specification with resolved decisions and an ordered, reversible, additive migration sequence.

Only then should Phase 2E draft versioned SQL migrations for review. No migration should be applied until after a backup, staging rehearsal, reconciliation plan, and explicit approval.