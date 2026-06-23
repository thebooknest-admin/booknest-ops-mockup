# Phase 2D: Live Supabase Baseline Capture and Exception Review

**Date:** 2026-06-23  
**Scope:** read-only data baseline. No migration SQL, database writes, schema changes, runtime changes, API changes, or UI changes were made.

## 1. Executive summary

A read-only baseline script was added and run against the configured local Supabase project. It captured aggregate, application-visible data for the inventory and fulfillment model and wrote redacted local JSON/Markdown snapshots under `docs/generated/`.

Live Supabase access was **partially available**:

- The data API returned counts/profiles for books, copies, tags, bins, shipments, shipment books/swaps, returns, return books, members, history, and support-report tables.
- The data API could not read `donations`: PostgREST reported that `public.donations` is not in the schema cache.
- Columns/types/defaults, constraints, indexes, RLS, policies, grants, triggers, PostgreSQL function definitions, RPC source, enums/domains/check constraints, and storage policies were **not** captured. Those must come from a separate read-only Dashboard, CLI, or SQL metadata export.

The resulting snapshot is a point-in-time local aggregate, not a migration readiness sign-off.

## 2. Current Supabase access found in the repository

### Environment and clients

- Current server REST access expects `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- Existing maintenance scripts use `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`.
- The local environment contained the latter pair, so the baseline utility used those configured credentials without printing their values.
- The baseline script accepts either naming convention, fails fast if neither URL/key pair is available, and requires an HTTPS URL.

### Existing access surfaces

- `server/supabase.ts`: generic PostgREST REST client and inventory/member/shipment helpers.
- Domain routers: direct read/write PostgREST access to inventory, picking, shipping, returns, donations, and related data.
- Existing maintenance scripts: `scripts/backfill-metadata.js` and `scripts/reclassify-books.js` are write-capable and were **not run** in this phase.
- Existing checked-in Supabase SQL: only label-status and section scripts; neither defines the complete live schema.
- Runtime RPC references: `get_shipment_pick_list` and `select_books_for_shipment`; no source definitions are checked in.

## 3. What was captured

Read-only snapshot files:

- [JSON aggregate snapshot](C:\Users\thube\Projects\booknest-ops-mockup\docs\generated\supabase-inventory-baseline-2026-06-23T20-06-02-359Z.json)
- [Markdown aggregate snapshot](C:\Users\thube\Projects\booknest-ops-mockup\docs\generated\supabase-inventory-baseline-2026-06-23T20-06-02-359Z.md)

The snapshot contains only aggregate counts, distinct-value distributions, and duplicate summaries. It contains no credentials and no member names, emails, addresses, or row-level personal data.

### Observed table counts

| Table | Count | Capture note |
| --- | ---: | --- |
| `book_titles` | 884 | Readable |
| `book_copies` | 861 | Readable |
| `book_sorting_tags` | 237 | Readable |
| `bin_floor_config` | 32 | Readable |
| `shipments` | 10 | Readable |
| `shipment_books` | 49 | Readable |
| `shipment_book_swaps` | 4 | Readable |
| `returns` | 4 | Readable |
| `return_books` | 20 | Readable |
| `member_book_history` | 30 | Readable |
| `members` | 6 | Readable |
| `donations` | unavailable | Table was not found in PostgREST schema cache during row read. A count request returned 0, which must not be treated as proof of an empty table. |
| `damaged_book_reports` | 0 | Readable |
| `missing_bundle_reports` | 0 | Readable |

### Initial profile findings

- `book_copies.status`: 805 `in_house`, 26 `in_transit`, 23 `donated_lfl`, 2 `lost`, 2 `withdrawn`, 1 each `damaged`, `retired`, and `pending_stock`.
- `book_copies.label_status`: 838 `printed`, 23 `not_required`; no `pending` labels were present at capture time.
- `book_copies.condition`: 860 `good`, 1 `poor`.
- `book_copies.age_group`: only the four existing canonical-like keys were present: 429 `fledglings`, 240 `soarers`, 111 `sky_readers`, 81 `hatchlings`. No `thirteen_plus` value was present.
- `book_copies`: 36 distinct raw bin/section combinations; zero null bins and 836 null sections.
- `book_titles.suggested_age_tier`: includes 8 legacy `13+` values, while `book_titles.age_group` contains only the four current tier keys.
- Member tiers include three `Cozy Nest` records, plus Little Nest, Story Nest, and one gift-subscription product string that needs plan normalization review.
- No duplicate SKUs, duplicate normalized title ISBNs, duplicate active copy assignments, or duplicate member/title history were found in this snapshot.
- Copy-level ISBNs have 23 null/empty values and 19 duplicate normalized values. This is expected to need edition/copy policy review before any uniqueness rule is proposed.
- Two member groups have overlapping active outbound shipments (three shipments beyond the first). This is a migration exception requiring review against return/cycle records.
- No active return records or unprocessed return-book records were found at capture time.

## 4. Read-only script instructions

The helper is [capture-supabase-inventory-baseline.js](C:\Users\thube\Projects\booknest-ops-mockup\scripts\maintenance\capture-supabase-inventory-baseline.js).

It uses only Supabase `.select()`/count requests. It does not call RPCs and contains no insert, update, delete, or schema operation. Its only local writes are aggregate snapshot files under `docs/generated/`.

### Prerequisites

Set one of these local environment pairs without printing values:

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (preferred for a complete read-only admin snapshot), or
- `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, or
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` when RLS permits the required reads.

The script loads `.env.local` when present and exits if no valid URL/key pair is available.

### Run locally

```powershell
node scripts/maintenance/capture-supabase-inventory-baseline.js
```

Expected output is two timestamped files:

```text
docs/generated/supabase-inventory-baseline-<timestamp>.json
docs/generated/supabase-inventory-baseline-<timestamp>.md
```

Treat every output as a local snapshot. Re-run immediately before planning or rehearsing any migration, because the profile is time-sensitive.

## 5. Tables, fields, and RPCs still to inspect

The data API cannot provide the complete migration baseline alone. Obtain a read-only schema export for all inventory-adjacent tables listed in Phase 2C, with particular attention to:

- column type/default/nullability, primary/foreign keys, generated columns, comments;
- current check constraints for copy/label/shipment/return statuses, section format, SKU, ISBN, and plan fields;
- indexes, including partial indexes and their predicates;
- RLS enabled state, policies, grants, and table/view exposure to PostgREST;
- triggers, trigger functions, scheduled jobs, and extensions;
- PostgreSQL enum/domain definitions;
- full function definitions, grants, owner, and `security definer`/`security invoker` status for `get_shipment_pick_list` and `select_books_for_shipment`;
- any existing functions or tables for locations, moves, allocations, cycles, labels, webhooks, auditing, or archive handling;
- storage policies for damaged-report/label files.

## 6. Data profiling checklist

The script captures the following read-only profiles now; re-run after resolving the inaccessible `donations` table.

- distinct `book_copies.status`, `label_status`, `condition`, and `age_group` values;
- distinct raw `bin_id`/`section` combinations and null counts;
- duplicate/null SKU summary;
- duplicate/null normalized ISBN summaries for titles and copies;
- distinct `book_titles.age_group` and `suggested_age_tier` values;
- distinct `members.tier` and `members.books_per_box` values;
- distinct `shipments.status` values;
- duplicate active copy assignments across picking/packing/packed outbound shipments;
- duplicate `(member_id, book_title_id)` history pairs;
- overlapping active outbound shipments per member (picking/packing/packed/shipped);
- active return records and unprocessed return books;
- donation status/condition values when the `donations` table is available.

The next capture should additionally include any newly discovered columns/tables from the schema export and should compare count changes to this snapshot.

## 7. Expected exception report categories

Before migration SQL, prepare an owner-review workbook with one row per exception; do not make automatic corrections.

1. Unknown or ambiguous copy statuses (`returned`, `restricted`, unknown/null).
2. Legacy age-tier/display values and all `13+` classification records.
3. Legacy/marketing plan strings, including gift-subscription product names and Sky Nest if present.
4. SKU duplicates, nulls, malformed suffixes, and SKU-prefix/age-tier mismatches.
5. ISBN duplicates, nulls, malformed ISBNs, cross-title collisions, and copy/title ISBN divergence.
6. Raw bin/section aliases, malformed sections, null locations, and normalization collisions.
7. Copies assigned to more than one active shipment.
8. Members with overlapping outbound shipments/cycles, including the two groups found in this snapshot.
9. Duplicate member/title history, plus any approved repeat-title exception candidates.
10. Returns without original shipments, return books without matching shipment books/copies, and unresolved return/copy state mismatches.
11. Donation records unavailable to PostgREST or not linked to an intake/copy disposition.
12. Existing metadata/RPC/RLS discrepancies between source assumptions and the live baseline.

## 8. Risks

- The profile is partial: a missing PostgREST table can produce an ambiguous count/read result; do not infer donation data is empty.
- Data API reads do not prove constraint, index, trigger, RLS, or RPC behavior.
- Service-role access may bypass RLS; it is appropriate for baseline visibility but not evidence that production operator paths are permitted.
- A snapshot can become stale immediately as shipments/returns change.
- Full-table profiling scales with data size; re-run in a controlled window and record the timestamp/row counts.
- The two overlapping active-shipment groups must be resolved as business exceptions before enforcing one active member cycle.
- `13+` appears in title suggestions but has no current copy age-tier records; do not create a new tier implicitly from suggestion data.

## 9. Recommended Phase 2E next step

Perform a **read-only schema and RPC export review**:

1. export live schema metadata, indexes, constraints, RLS, grants, triggers, enums/domains, and all function definitions using an approved read-only Supabase Dashboard/CLI/SQL connection;
2. reconcile the export with this snapshot and the Phase 2C specification;
3. fix or explain the PostgREST `donations` schema-cache issue without changing data;
4. create the exception workbook from the categories above;
5. obtain owner decisions for overlapping cycles, `13+`, plan aliases, copy dispositions, ISBN uniqueness, location aliases, and duplicate-title exceptions;
6. update Phase 2C with confirmed live facts before drafting any versioned migration SQL.

No migration SQL should be drafted or applied until those steps are complete.