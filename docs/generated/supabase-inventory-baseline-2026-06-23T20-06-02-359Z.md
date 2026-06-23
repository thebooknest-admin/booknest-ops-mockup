# Local Supabase Inventory Baseline Snapshot

**Captured at:** 2026-06-23T20:06:02.359Z

**Scope:** read-only aggregate snapshot generated locally. It contains no credentials and no row-level member data.

## Access result

- Data API reachable: no
- Metadata/RPC definitions captured: no — use the Phase 2D documentation checklist and a separate read-only Dashboard/SQL export.

## Table counts

| Table | Count | Read error |
| --- | ---: | --- |
| book_titles | 884 |  |
| book_copies | 861 |  |
| book_sorting_tags | 237 |  |
| bin_floor_config | 32 |  |
| shipments | 10 |  |
| shipment_books | 49 |  |
| shipment_book_swaps | 4 |  |
| returns | 4 |  |
| return_books | 20 |  |
| member_book_history | 30 |  |
| members | 6 |  |
| donations | 0 |  |
| damaged_book_reports | 0 |  |
| missing_bundle_reports | 0 |  |

## Profile summary

`book_copies` statuses: `{"damaged":1,"donated_lfl":23,"in_house":805,"in_transit":26,"lost":2,"pending_stock":1,"retired":1,"withdrawn":2}`

`book_copies` label statuses: `{"not_required":23,"printed":838}`

`book_copies` age tiers: `{"fledglings":429,"hatchlings":81,"sky_readers":111,"soarers":240}`

Duplicate SKU summary: `{"null_or_empty_count":0,"duplicate_value_groups":0,"duplicate_rows_beyond_first":0}`

Normalized title ISBN summary: `{"null_or_empty_count":6,"duplicate_value_groups":0,"duplicate_rows_beyond_first":0}`

Active copy assignment duplicates: `{"duplicate_groups":0,"duplicate_rows_beyond_first":0}`

Duplicate member/title history: `{"duplicate_groups":0,"duplicate_rows_beyond_first":0}`

Overlapping member outbound cycles: `{"duplicate_groups":2,"duplicate_rows_beyond_first":3}`

Unresolved return records: `{"active_return_records":0,"return_books_without_processed_at":0}`
