# Phase 2E: Supabase Schema and RPC Export Review

**Date:** 2026-06-23  
**Scope:** read-only metadata capture and review. No migration SQL, schema/data change, runtime/API/UI change, or commit was made.

## 1. Executive summary

Schema/RPC metadata was **partially captured** through Supabase PostgREST's read-only OpenAPI endpoint. This is stronger than the Phase 2D data profile: it identifies public-schema relation paths, visible column metadata, API-exposed methods, and RPC argument signatures.

It is not a full PostgreSQL schema export. Constraints, indexes, RLS policies, grants, triggers, enum/domain/check definitions, function bodies/security mode, materialized-view definitions, ownership, and database roles remain uncaptured because this environment lacks the Supabase CLI, `psql`, `pg_dump`, a Postgres connection URL, and a Supabase Management API token.

The key migration implication is that several tables proposed abstractly in Phase 2C may already have live counterparts. In particular, the live OpenAPI schema exposes `bins`, `age_tiers`, `themes`, `intake_batches`, `intake_batch_items`, `status_history`, `sku_counters`, and operational views. Future migration design must reconcile these structures before creating replacements.

## 2. Metadata access availability

| Access path | Result | Notes |
| --- | --- | --- |
| Supabase CLI | Unavailable | No `supabase` executable in this environment. |
| `psql` / `pg_dump` | Unavailable | Neither executable is installed. |
| Postgres connection variables | Unavailable | No `DATABASE_URL`, `POSTGRES_URL`, or Supabase DB URL was configured. |
| Supabase Management API | Unavailable | No access token/project reference was configured. |
| PostgREST OpenAPI endpoint | Available | Read-only `GET /rest/v1/` with `Accept: application/openapi+json` returned metadata. |
| Data API | Partially available | Phase 2D read most target tables but not `donations`. |

The OpenAPI export endpoint returned the public-schema document titled `standard public schema`, version `14.1`, with 87 paths: 63 relation paths and 23 RPC paths.

## 3. What was captured

### Added read-only export utility

[export-supabase-schema-baseline.js](C:\Users\thube\Projects\booknest-ops-mockup\scripts\maintenance\export-supabase-schema-baseline.js) makes one authenticated **GET** request to the PostgREST OpenAPI endpoint. It has no mutation requests and writes only local snapshot files.

Run locally:

```powershell
node scripts/maintenance/export-supabase-schema-baseline.js
```

It requires the same locally configured URL/key pairs as the Phase 2D baseline script and never prints the values.

### Generated local artifacts

- [Raw OpenAPI snapshot](C:\Users\thube\Projects\booknest-ops-mockup\docs\generated\supabase-openapi-2026-06-23T20-16-46-350Z.json)
- [Schema/RPC summary JSON](C:\Users\thube\Projects\booknest-ops-mockup\docs\generated\supabase-schema-rpc-baseline-2026-06-23T20-16-46-350Z.json)
- [Schema/RPC summary Markdown](C:\Users\thube\Projects\booknest-ops-mockup\docs\generated\supabase-schema-rpc-baseline-2026-06-23T20-16-46-350Z.md)

### Visible target relations and API metadata

The OpenAPI document exposes GET/POST/PATCH/DELETE endpoints for all target inventory tables except `donations`.

| Relation | Visible fields | Notable observed API metadata |
| --- | ---: | --- |
| `book_titles` | 49 | Includes `age_group`, `suggested_age_tier`, `age_tier_id`, `primary_theme_id`, `bin_theme`, `tag_ids`, valuation/disposition-related fields, and classification fields. |
| `book_copies` | 21 | Includes `sku`, title/ISBN/age/bin fields, `status`, `label_status`, `label_batch_id`, condition/QC fields, `stocked_at`, and `section`. |
| `book_sorting_tags` | 4 | Includes ID, theme, tag, timestamp. |
| `bin_floor_config` | 7 | Includes bin code, floor, active flag, note, timestamps. |
| `shipments` | 18 | Includes `status` default `preparing`, schedule/actual dates, tracking/carrier/address/label fields, type, and `returned_at`. |
| `shipment_books` | 11 | Includes copy/title assignment, status default `selected`, pick/scan fields, selection/match data, and purchase price. |
| `shipment_book_swaps` | 8 | Explicit old/new copy/title swap audit fields. |
| `returns` | 17 | Includes status default `initiated`, shipment link, tracking/label/cost, processing, and notes. |
| `return_books` | 11 | Includes expected/received flags, condition fields, action, and processing timestamp. |
| `member_book_history` | 9 | Includes member/title/shipment relation, received/returned date, kept, notes. |
| `members` | 26 | Includes `tier`, `age_group` with type format `public.age_group`, `books_per_box`, preferences, household, and subscription fields. |
| `donations` | 0 | No OpenAPI relation path; see Section 7. |

OpenAPI provides field types/defaults and required-field hints, but it does not prove all actual database nullability, foreign keys, uniqueness, or checks. Treat it as API metadata, not DDL.

## 4. What could not be captured

The OpenAPI document does **not** expose:

- PostgreSQL primary/foreign/unique/check constraints or indexes;
- partial-index predicates, index definitions, or query plans;
- RLS enabled state, RLS policies, grants, roles, or ownership;
- triggers, trigger function definitions, scheduled jobs, extensions;
- function/RPC source, return type/shape detail, volatility, ownership, grants, or `security definer`/`security invoker` status;
- enum/domain definitions, including the underlying `public.age_group` type observed on `members.age_group`;
- view/materialized-view SQL definitions;
- data from relations not exposed in PostgREST, including `donations`.

A read-only database metadata export remains mandatory before migration SQL.

## 5. Existing constraints, indexes, and RLS found

No constraints, indexes, RLS policies, grants, or trigger definitions were captured in this phase. The OpenAPI metadata confirms that API methods are exposed for many public-schema relations, but it cannot determine whether access is protected by RLS, service-role bypass, grants, or an external policy layer.

The only checked-in schema facts remain:

- `scripts/supabase/001_label_status_not_required.sql`: label-status check values and a legacy terminal-status update;
- `scripts/supabase/003_book_copy_sections.sql`: uppercase section check and a partial in-house section index.

These scripts must be compared to the live export; they are not proof that every change was applied or remains current.

## 6. Existing RPC/function definitions found

The OpenAPI export lists 23 public RPC paths:

```text
can_member_request_swap
commit_intake_batch
compute_base_disposition
compute_value_band
create_label_batch
create_shipment_with_books
create_shipments_for_ship_date
decrement_credit
generate_order_number
generate_sku
get_active_label_batch
get_picking_queue
get_shipment_pick_list
get_suggested_bin
mark_book_kept
mark_label_batch_printed
next_book_copy_sku
next_book_sku
recompute_all_valuations
recompute_book_valuation
release_label_batch
select_books_for_shipment
suggest_bin_from_tags
```

### Specifically inspected RPC signatures

| RPC | Required arguments | Optional arguments visible | Definition/body captured? |
| --- | --- | --- | --- |
| `get_shipment_pick_list` | `p_shipment_id` UUID | none | No |
| `select_books_for_shipment` | `p_member_id` UUID, `p_shipment_id` UUID | `p_books_needed` integer | No |

The two RPCs are referenced by the picking router. The currently visible signatures confirm the application calls have the expected argument names, but no business-rule, locking, duplicate-title, or reservation guarantee can be inferred without source definitions and database metadata.

Other discovered functions are potentially relevant to Phase 2 design:

- `commit_intake_batch`, `next_book_copy_sku`, `next_book_sku`, `generate_sku` may already implement intake/SKU sequencing;
- `create_shipment_with_books`, `create_shipments_for_ship_date`, `get_picking_queue`, `can_member_request_swap` may overlap proposed allocation/cycle work;
- `create_label_batch`, `get_active_label_batch`, `mark_label_batch_printed`, `release_label_batch` may overlap proposed print-job work;
- `compute_base_disposition` may overlap the proposed circulation-disposition model.

None should be replaced or duplicated until their definitions and live callers are reviewed.

## 7. Donations table visibility issue

`/donations` is absent from the OpenAPI document. Phase 2D also received `Could not find the table 'public.donations' in the schema cache` when reading rows. This establishes that the issue is PostgREST exposure/cache visibility, not merely a profiling-script error.

Possible explanations that require database-owner verification:

1. the table is missing or was renamed;
2. it exists outside `public` or is not included in PostgREST's exposed schema;
3. the schema cache is stale after a table change;
4. permissions/RLS or a view-based replacement changes visibility;
5. the app's current donation route targets a relation unavailable in this project.

Do not refresh schema cache, alter exposure, recreate a table, or change the donation route in this phase. First capture the PostgreSQL relation list and PostgREST configuration with read-only administrative access.

## 8. Migration implications

1. **Reuse before replacement.** The live schema already has `age_tiers`, `bins`, `themes`, `intake_batches`, `intake_batch_items`, `status_history`, `sku_counters`, `subscription_tiers`, and several selection/picking/label structures. Phase 2C's proposed `storage_locations`, `inventory_moves`, `print_jobs`, and SKU logic must be reconciled with these existing tables/functions before design is finalized.
2. **Defaults differ from source assumptions.** OpenAPI reports shipment default `preparing`, shipment-book default `selected`, and return default `initiated`; current code uses `picking`, `ready_for_picking`, and `requested`. Determine whether checks/triggers translate these values or whether the source and live schema have drifted.
3. **Age type already exists.** `members.age_group` reports the custom format `public.age_group`; its enum/domain/check definition is required before introducing canonical tier changes.
4. **Existing label-batch model exists.** Copy field `label_batch_id` plus label RPCs suggest an existing workflow more developed than the current route layer uses. The future print-job model may be an extension or a rename, not a new parallel system.
5. **Existing intake/status structures exist.** Intake batch tables and `status_history` may satisfy parts of the proposed movement/audit design after source/fields are reviewed.
6. **API exposure is not schema authority.** OpenAPI method exposure must not drive deletion, uniqueness, or RLS decisions.

## 9. Remaining owner/database decisions

Before SQL design:

1. Provide a read-only Postgres metadata export or grant a temporary read-only connection to capture the missing DDL/security/function details.
2. Resolve whether `bins`, `age_tiers`, `themes`, `status_history`, `intake_batches`, and label-batch tables are active production structures, legacy artifacts, or partially adopted replacements.
3. Resolve PostgREST visibility of `donations` and whether the current donation API targets the correct relation.
4. Decide whether existing `compute_base_disposition` is the intended foundation for canonical circulation disposition.
5. Decide whether current live defaults (`preparing`, `selected`, `initiated`) are valid lifecycle states, legacy values, or trigger-managed aliases.
6. Decide the canonical role/actor identity source for future movement/audit tables.
7. Confirm whether any of the discovered RPCs are invoked by external integrations or scheduled jobs before refactoring them.

## 10. Recommended next step

**Phase 2F: read-only PostgreSQL metadata export and reconciliation.**

Using a database-owner-approved read-only connection, capture:

- `information_schema` table/column metadata;
- `pg_catalog` constraints, indexes, triggers, grants, enum/domain definitions, views/materialized views, and function definitions;
- PostgREST configuration/exposed schemas and schema-cache state;
- dependencies and callers for the 23 visible RPCs.

Then reconcile that export with the OpenAPI and Phase 2D data snapshots. Update Phase 2C to reuse confirmed live tables/functions and to eliminate duplicate proposed structures before any migration SQL is drafted.