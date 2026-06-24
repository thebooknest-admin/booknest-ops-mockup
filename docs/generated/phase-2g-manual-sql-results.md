# Phase 2G — Manual SQL Metadata Results

> **Source:** Results manually collected in Supabase SQL Editor and summarized outside this repository. This is a local documentation snapshot, not a live database export. No secrets are included.

## Executive Summary

The live Supabase schema is more mature than originally assumed: it already has bins, intake batching, status history, SKU generation, label-batch operations, picking structures, and several integrity constraints. The migration direction should favor reuse and extension of those structures.

Important exceptions require follow-up before any migration work: the schema has no `thirteen_plus` age-group enum value, operational-table RLS is largely absent, `donations` was not found by the manual search, and `create_shipment_with_books` appears to set an invalid `reserved` copy status.

## Tables and Columns

This manual result set focused on the operational relations identified in the Phase 2G query pack, including age tiers, bins, books, shipments, returns, intake, picking, labels, subscriptions, themes, tags, and related history records.

No complete table-and-column export was included in the supplied summary; primary keys, foreign keys, constraints, indexes, enums, RLS, triggers, and functions are recorded below.

## Enum and Domain Definitions

### `age_group` enum values

- `Hatchlings`
- `Fledglings`
- `Soarers`
- `Sky Readers`

There is no `thirteen_plus` / `13+` enum support in this type.

### Additional enums

#### `book_status`

- `in_house`
- `on_swap`
- `damaged`
- `retired`

#### `bundle_status`

- `generated`
- `picking`
- `picked`
- `shipped`

#### `missing_problems`

- `marked_delivered_not_received`
- `tracking_not_updated`
- `return_to_sender`
- `lost_in_transit`
- `other_not_sure`

## Primary Keys

The following relations have primary keys:

- `age_tiers`
- `bins`
- `book_titles`
- `book_copies`
- `shipments`
- `shipment_books`
- `returns`
- `return_books`
- `members`
- `status_history`
- `intake_batches`
- `intake_batch_items`
- `subscription_tiers`
- `picking_batches`
- `picking_queue`
- `themes`
- `tags`

### Composite primary keys

- `shipment_books(shipment_id, book_title_id)`
- `member_interests(member_id, interest_category)`
- `member_theme_preferences(member_id, tag_id)`
- `archive_tag_bin_map(tag_id, age_group, bin_id)`

## Foreign Keys

Important foreign-key relationships found:

- `book_titles.age_tier_id` → `age_tiers.id`
- `book_titles.primary_theme_id` → `themes.id`
- `book_copies.book_title_id` → `book_titles.id`
- `shipment_books` → `shipments`, `book_titles`, and `book_copies`
- `returns` → `members` and `shipments`
- `return_books` → `returns` and `book_copies`
- `status_history.book_copy_id` → `book_copies.id`

## Check Constraints

### Bin age groups

The bin age-group constraint permits:

- `hatchlings`
- `fledglings`
- `soarers`
- `sky_readers`

### `book_copies.status`

The current copy-status check constraint permits:

- `in_house`
- `damaged`
- `retired`
- `shipped`
- `returned`
- `pending_qc`
- `pending_stock`
- `pending_label`
- `donated_lfl`
- `lost`
- `withdrawn`
- `in_transit`

### `book_copies.label_status`

The label-status constraint permits:

- `pending`
- `printed`
- `not_required`

### Section format

Section codes must match:

```text
^[A-Z]{1,3}$
```

## Indexes and Uniqueness

Important operational indexes found:

- `bins_bin_code_key`
- `book_copies_sku_key`
- `uq_book_copies_sku`
- `idx_book_copies_status`
- `idx_book_copies_label_status`
- `idx_book_copies_isbn`
- `idx_book_copies_bin`
- `idx_book_copies_label_batch_id`
- `book_copies_section_pick_idx`

### Active copy assignment safeguard

An important partial unique index exists:

```text
idx_unique_active_copy_assignment:
shipment_books(book_copy_id)
WHERE scanned_at IS NULL
```

This is a significant existing allocation safeguard and must be reconciled carefully with any future reservation model.

### Member history uniqueness

`member_book_history` has a unique constraint across:

```text
member_id, book_title_id, shipment_id
```

This does not, by itself, establish a global “member may never receive a title twice” constraint because `shipment_id` is part of the unique key.

## RLS Status and Policies

### RLS enabled status

RLS is disabled on nearly all operational tables.

### Policies

The only policy found was:

| Relation | Policy | Role | Scope |
| --- | --- | --- | --- |
| `event_signups` | `Allow all for anon` | `anon` | Allow all |

This means the Phase 1B application-level operator boundary remains important, but database-level authorization needs future review before relying on it for protection.

## Triggers

No trigger was found that converts a copy into a `reserved` status.

## Functions and RPCs

### `create_shipment_with_books`

The function attempts to set:

```text
book_copies.status = reserved
```

However, `reserved` is not allowed by the current `book_copies.status` check constraint. This function appears stale, broken, or dependent on a schema state not represented by the current constraint. Its source and runtime behavior must be verified before it is reused or replaced.

### Existing operational capabilities

The schema already includes structures and RPCs for:

- label batches
- intake batches
- SKU generation and sequencing
- picking and selection workflows

These should be examined and reused where their behavior satisfies the canonical inventory model.

## Donations Search

The relation search for `donations` returned no rows.

This corroborates the earlier PostgREST/OpenAPI visibility issue, but does not prove that no donation-related table exists under a different relation name or schema. A full PostgreSQL metadata export remains necessary.

## Reconciliation Conclusions

- Reuse `bins` rather than immediately introducing a duplicate storage-location table.
- Evaluate `status_history` before introducing `inventory_moves` or a separate inventory audit trail.
- Reuse `intake_batches` and `intake_batch_items` for the intake workflow.
- Reuse label-batch RPCs and their supporting structures where possible.
- SKU generation and sequencing already exist and should be preserved.
- No `thirteen_plus` / `13+` age-group enum support currently exists.
- RLS is largely absent across operational tables and needs a future database authorization review.
- `donations` appears to be missing from the inspected metadata surface.
- `create_shipment_with_books` appears stale or broken because it writes an invalid `reserved` status.
- The existing schema is more mature than originally assumed; the future migration should extend and reconcile it rather than recreate its operational foundation.

## Recommended Follow-Up

Before authoring any migration SQL:

1. Capture a complete PostgreSQL metadata export, including function definitions, constraints, roles, and schema ownership.
2. Run controlled non-production verification of `create_shipment_with_books` and its interaction with the active-copy-assignment index.
3. Locate the donation data model or confirm it is absent.
4. Decide the approved path for adding `thirteen_plus` while preserving the existing `age_group` type and all existing data.
5. Reconcile status-history semantics with proposed copy movement and audit requirements.
