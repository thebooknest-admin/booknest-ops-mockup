# Local Supabase OpenAPI Schema/RPC Snapshot

**Captured at:** 2026-06-23T20:16:46.350Z

**Scope:** read-only PostgREST OpenAPI metadata. This is not a complete PostgreSQL schema dump and contains no credentials.

## Coverage

- OpenAPI paths: 87
- Visible relation paths: 63
- Visible RPC paths: 23
- Donations path visible: no

## Target relations

| Relation | HTTP methods | Fields visible |
| --- | --- | ---: |
| book_titles | get, post, delete, patch | 49 |
| book_copies | get, post, delete, patch | 21 |
| book_sorting_tags | get, post, delete, patch | 4 |
| bin_floor_config | get, post, delete, patch | 7 |
| shipments | get, post, delete, patch | 18 |
| shipment_books | get, post, delete, patch | 11 |
| shipment_book_swaps | get, post, delete, patch | 8 |
| returns | get, post, delete, patch | 17 |
| return_books | get, post, delete, patch | 11 |
| member_book_history | get, post, delete, patch | 9 |
| members | get, post, delete, patch | 26 |
| donations | not visible | 0 |

## Target RPC signatures

| RPC | Required arguments | Arguments |
| --- | --- | --- |
| get_shipment_pick_list | ["p_shipment_id"] | {"p_shipment_id":{"type":"string","format":"uuid"}} |
| select_books_for_shipment | ["p_member_id","p_shipment_id"] | {"p_books_needed":{"type":"integer","format":"integer"},"p_member_id":{"type":"string","format":"uuid"},"p_shipment_id":{"type":"string","format":"uuid"}} |

## Not available from this source

- PostgreSQL constraints and indexes
- RLS policies and grants
- triggers and trigger functions
- function source definitions and security mode
- enum, domain, and check-constraint definitions
- materialized-view metadata
- relation ownership and database roles
