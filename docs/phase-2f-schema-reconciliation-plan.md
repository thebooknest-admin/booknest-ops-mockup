# Phase 2F: Supabase Schema Reconciliation Plan

**Date:** 2026-06-23  
**Status:** reconciliation specification only. No migrations, database/data changes, SQL migration files, runtime/API/UI changes, deletions, or commits were made.

## 1. Executive summary

Phase 2C correctly identified the integrity gaps to solve, but it assumed a mostly blank database surface. Phase 2D/2E show that the live public schema already contains structures that overlap substantially with that proposal: age-tier and theme catalogs, a physical bin catalog, intake batches, status history, SKU counters, subscription tiers, picking structures, label-batch RPCs, and selection/shipment RPCs.

The revised direction is therefore **reuse and extend first**. Do not create parallel tables named `storage_locations`, `inventory_moves`, `print_jobs`, `print_job_items`, or SKU sequencing tables until PostgreSQL metadata and function source prove existing live structures cannot support the target model.

Structures that appear to remain necessary after reconciliation are `member_cycles`, `copy_allocations` (or an equivalent durable active-allocation model), `webhook_events`, and potentially a cross-domain `operation_audit_log`. Even these remain contingent on reviewing live functions, constraints, triggers, and hidden/non-PostgREST relations.

## 2. Existing live structures discovered

### Catalog, taxonomy, and location candidates

| Live structure | Visible fields/signals | Initial interpretation |
| --- | --- | --- |
| `age_tiers` | `id`, `code`, `name`, `age_range`, `description` | Existing canonical-age catalog candidate. |
| `themes` | `id`, `name`, `description`, `active` | Existing canonical-theme catalog candidate. |
| `bins` | `id`, `bin_code`, `zone`, `row`, `position`, `age_group`, `theme`, `capacity`, `current_count`, `is_active`, `display_name` | Existing physical location master candidate. |
| `bin_floor_config` | bin code, floor, active/note | Existing replenishment threshold configuration. |
| `bin_code_migration` | old/new bin code | Existing bin-normalization migration aid; usage unknown. |
| `tag_bin_map`, `bin_theme_categories`, tag/title join tables | tag, age, bin/theme associations | Existing taxonomy/bin mapping structures requiring consolidation review. |
| `archive_book_copy_bin_suggestions`, archive tag map | archive-prefixed relations | Historical/legacy candidates; preserve and review before removal. |

### Intake, status, and SKU candidates

| Live structure | Visible fields/signals | Initial interpretation |
| --- | --- | --- |
| `intake_batches` | status, creator, committed timestamp | Existing intake aggregate. |
| `intake_batch_items` | ISBN/metadata, suggested/final age/bin, qty, action, existing book, error | Existing intake work-item model. |
| `status_history` | copy ID/SKU, old/new status, note, created timestamp | Existing copy-status audit trail. |
| `sku_counters` | age group, next number | Existing SKU sequence state. |
| `next_book_copy_sku`, `next_book_sku`, `generate_sku` RPCs | exposed RPCs | Existing SKU-generation mechanisms; source/locking unknown. |

### Fulfillment and label candidates

| Live structure | Visible fields/signals | Initial interpretation |
| --- | --- | --- |
| `picking_batches` | ship date, zone, status, picker, counts | Existing pick-batch aggregate. |
| `picking_queue` | shipment/copy/bin, priority/status, picker, problems, batch | Existing durable picking queue candidate. |
| `bundles`, `bundle_items` | member/status, copy/item and pick/ship timestamps | Possible legacy or parallel fulfillment model; current app uses shipments. |
| `shipment_book_swaps` | old/new copy/title, reason, timestamp | Existing narrow pick-swap audit. |
| `book_selection_log` | member/shipment, algorithm/criteria/results | Existing selection audit. |
| copy `label_batch_id` plus label RPCs | create/get/mark/release label batch | Existing label-job model, though backing relation was not visible in OpenAPI. |

### Plans, disposition, and operational views

| Live structure | Visible fields/signals | Initial interpretation |
| --- | --- | --- |
| `subscription_tiers` | code/name, books per shipment, frequency, pricing, active | Existing plan catalog candidate. |
| `compute_base_disposition` RPC | numeric value input | Appears valuation/resale-oriented; do not equate with circulation disposition without source review. |
| valuation tables/RPCs/views | value comps, bands, resale queue, premium views | Separate valuation subsystem; preserve boundary from lending circulation. |
| `v_at_risk_bins`, `v_books_out_with_members`, `v_shipments_need_picking`, other `v_*` relations | derived public relations | Existing reporting/queue views; definitions and dependencies unknown. |

## 3. Reconciliation matrix

| Proposed Phase 2C item | Existing live counterpart | Classification | Recommendation | Risk | Required verification before migration |
| --- | --- | --- | --- | --- | --- |
| `storage_locations` | `bins` | Keep and extend | Reuse `bins` as the physical location master. Add section/location hierarchy only if current `zone`/`row`/`position` cannot model it. Do not create parallel locations first. | Current `book_copies.bin_id` is text; foreign-key/alias mapping unknown. | Bin constraints, keys, current use of zone/row/position, bin aliases, section policy, callers. |
| section code | `bins` plus `book_copies.section` | Keep but extend | Decide whether section is a bin attribute, child location, or retained copy coordinate; migrate only after occupancy/alias review. | A copy-level section may conflict with a shared bin record. | Existing sections, capacity rules, all bin/section combinations, location FKs. |
| `inventory_moves` | `status_history`, `shipment_book_swaps` | Keep but extend | Extend/reconcile `status_history` for status provenance; design a location-move extension or companion only if it cannot record from/to location and actor. | Renaming/duplicating history would fragment audit. | Table constraints, triggers, existing writers, retention, actor identity, whether location changes are already logged elsewhere. |
| `operation_audit_log` | `status_history`, selection log, swap history | Unresolved / may remain new | Add only if existing logs cannot provide cross-entity operation correlation and actor traceability. | A new generic log can duplicate specialised audit data. | Existing audit tables/views, actor IDs, triggers, logging requirements. |
| `print_jobs` / `print_job_items` | copy `label_batch_id`; label-batch RPCs | Keep and reuse | Treat existing label batches as the starting model. Locate backing table/view and extend it rather than introducing parallel jobs. | Backing relation is not PostgREST-visible; ownership/locking unknown. | `create_label_batch`, `get_active_label_batch`, `mark_label_batch_printed`, `release_label_batch` source and tables. |
| intake model | `intake_batches`, `intake_batch_items` | Keep and reuse | Extend existing batches/items with copy/disposition/location references rather than create new intake tables. | Current receive route bypasses batch model; lifecycle semantics unknown. | `commit_intake_batch` source, batch status values, live callers, foreign keys. |
| SKU sequencing | `sku_counters`; SKU RPCs | Keep and reuse | Use/reconcile existing counter/RPC approach; future receive transaction should call one authoritative allocator. | Current code reads all SKUs and selects first unused number; concurrent behavior unknown. | Counter locking, RPC source, SKU uniqueness/indexes, existing counters by age code. |
| canonical age tiers | `age_tiers`; `members.age_group` type `public.age_group` | Keep and extend | Make `age_tiers.code` the canonical source after reviewing enum/domain and foreign keys. Add `thirteen_plus` only via approved migration. | Existing custom type may constrain values and current IDs/codes may differ. | Type definition, row values, FKs from titles/copies/members/bins/tags. |
| canonical themes | `themes`; `bin_theme`; `primary_theme_id` | Keep and extend | Reuse `themes`; reconcile string and ID forms before canonical taxonomy changes. | Dual string/ID columns may drift. | Theme rows, uniqueness/active policy, FKs, existing tag mappings. |
| canonical plan codes | `subscription_tiers`; member `tier`; `books_per_box` | Keep and extend | Reuse subscription tiers as the plan catalog; normalize to codes and retain per-member override only where intentional. | Live tiers include product strings/gift variants; runtime uses display strings. | Tier rows/codes, references, gift rules, plan history, desired Cozy Nest code/count. |
| allocation/reservation safety | `picking_queue`, `shipment_books`, `bundles`/items, selection RPCs | Unresolved / likely extend or add | Do not create `copy_allocations` until source review determines whether durable active allocation already exists. If absent, it remains a required new table. | Current app leaves copies in-house while assigned. Parallel queue/bundle models may already reserve copies. | Queue/bundle status semantics, constraints, triggers, selection/shipment RPC sources, active copy assignment queries. |
| member circulation cycle | `bundles`, shipments, returns, `can_member_request_swap` | Unresolved / likely new | `member_cycles` remains the preferred explicit model unless bundles already represent it reliably. | Current overlapping shipments and webhook behavior violate desired gate. | Bundle source/usage, swap RPC source, shipment/return constraints, historical data profile. |
| circulation disposition | `compute_base_disposition`, valuation fields | Keep separate / unresolved | Keep Phase 2B circulation disposition proposal separate from value/resale disposition until semantics are confirmed. | Conflating resale value with circulate/donate/remove would corrupt operations. | Function source, output values, callers, valuation policy. |
| webhook de-duplication | no visible counterpart | Remain new unless hidden | `webhook_events` remains proposed. | Existing EasyPost handler has no visible event ledger. | Hidden tables/functions, webhook provider event IDs, retry behavior. |
| member/title uniqueness | `member_book_history`; member exclusions | Keep but extend | Retain history as enforcement source; add/verify uniqueness plus explicit exception path after cleanup. | Historical duplicates may block constraint creation. | Constraints, duplicate report, title identity policy, exception policy. |
| donations intake/disposition | no visible `/donations` relation | Unresolved | Do not design replacement table until visibility/schema issue is resolved. | Current route may target absent/stale relation. | PostgreSQL relation list, PostgREST config/cache, permissions, actual donation workflow. |

## 4. Revised target schema direction

### Do not create parallel structures yet

Remove these from the *initial new-table* direction in Phase 2C; treat them as existing-structure extensions pending metadata review:

- `storage_locations` → reconcile into `bins` and a possible child/section model;
- `inventory_moves` → reconcile into/alongside `status_history` only after reviewing its constraints and writers;
- separate intake tables → reuse `intake_batches` and `intake_batch_items`;
- separate SKU counter/sequencing → reuse `sku_counters` and one reviewed SKU RPC;
- `print_jobs` / `print_job_items` → reconcile with existing label-batch records and RPCs;
- a new plan catalog → reuse `subscription_tiers`.

### Structures that likely remain necessary

Subject to metadata/source review, retain these as future additions:

- **`member_cycles`**, unless `bundles` can be proven to safely represent exactly one open lending/return cycle per member;
- **durable copy allocation** (`copy_allocations` or an extension of `picking_queue`/`shipment_books`), unless existing constraints/RPCs already enforce one active allocation per copy;
- **`webhook_events`**, unless a hidden event/idempotency ledger exists;
- **cross-domain operation audit**, only if `status_history` and specialised logs cannot be extended to include actor, operation/correlation ID, location changes, and entity coverage.

### Existing tables/RPCs to extend rather than duplicate

- `bins`: canonical bin/section/location capacity and active state;
- `age_tiers`, `themes`, `subscription_tiers`: canonical taxonomy/plan rows and code normalization;
- `intake_batches`, `intake_batch_items`: copy creation/disposition outcome and audit linkage;
- `status_history`: canonical lifecycle transition provenance, perhaps location move references;
- `member_book_history`: uniqueness/exceptions and circulation linkage;
- `book_copies`, `book_titles`, `shipments`, `shipment_books`, `returns`, `return_books`: additive canonical fields and foreign keys only after compatibility strategy is approved;
- label, SKU, shipment/picking, selection, intake, and swap RPCs: source review before modification or replacement.

## 5. Tables/RPCs to reuse

### Reuse candidates

- `age_tiers`, `themes`, `bins`, `subscription_tiers`
- `intake_batches`, `intake_batch_items`
- `status_history`, `member_book_history`, `shipment_book_swaps`, `book_selection_log`
- `sku_counters`
- `picking_batches`, `picking_queue` (at minimum as a source of truth to reconcile)
- label batch fields/RPCs
- `get_shipment_pick_list`, `select_books_for_shipment`, `create_shipment_with_books`, `get_picking_queue`, `can_member_request_swap`

### Extend candidates

- `bins`: section-aware location identity, canonical tier/theme references, and capacity semantics;
- `status_history`: actor, correlation/operation ID, reason code, from/to location support;
- intake batches/items: created copy, outcome disposition, final location, operator/audit fields;
- subscription tiers: canonical code and exact Cozy Nest six-book definition;
- book copies: canonical lifecycle/disposition and location reference while legacy fields remain;
- shipment/return/history relations: cycle and allocation linkage;
- label-batch infrastructure: printer/template/item lifecycle if missing.

## 6. Legacy/unused candidates

These are candidates for classification only; they must not be deleted or quarantined in this phase.

| Candidate | Why it needs review |
| --- | --- |
| `bundles`, `bundle_items` | Parallel-looking fulfilment model; current source uses shipments/shipments_books. |
| `archive_book_copy_bin_suggestions`, `archive_tag_bin_map` | Archive-prefixed relations may preserve useful migration history. |
| `bin_code_migration` | Could be active normalization support or completed historical migration. |
| string fields `bin_theme`, `age_group`, `tier` alongside live catalog IDs/tables | May be compatibility fields or drift sources. |
| `book_title_tags`, `book_title_sorting_tags`, `tag_bin_map`, `bin_theme_categories` | Multiple taxonomy mappings may overlap; inspect source/use and constraints before consolidation. |
| valuation/disposition RPCs and `v_*` valuation views | Likely a distinct resale subsystem, not automatically inventory/circulation legacy. |

## 7. Unresolved items requiring PostgreSQL metadata

A real read-only PostgreSQL metadata export is still required for:

1. primary/foreign/unique/check constraints and index definitions for all reconciled tables;
2. enum/domain definition and permitted values for `public.age_group`;
3. function source, return types, volatility, owner, grants, and security mode for all 23 RPCs;
4. triggers and trigger functions that may synchronise copy/queue/batch/status data;
5. table/view/materialized-view definitions and dependencies, particularly `picking_queue`, `v_*` relations, and label batch backing structures;
6. RLS policies/grants and the public schema exposure configuration;
7. actual relations backing label batch RPCs, if not exposed through PostgREST;
8. whether `bundles`/`bundle_items` or `picking_queue` already satisfy allocation/cycle requirements;
9. all schemas, not only `public`, to resolve `donations` and potentially hidden operational tables;
10. a dependency graph showing external callers/scheduled jobs for existing RPCs.

## 8. Donations visibility issue

`donations` is absent from both the Phase 2D data API baseline and the Phase 2E OpenAPI export. It must remain an unresolved database/integration issue.

Required next verification:

- list relations named `donations` across all schemas with a read-only catalog export;
- confirm exposed PostgREST schemas and schema-cache state;
- inspect whether a view or renamed table replaced `public.donations`;
- verify the current route's target relation against production configuration;
- identify RLS/grant differences between the service-role snapshot and application paths.

Do not recreate the relation, refresh the cache, alter grants, or change route code until that evidence exists.

## 9. Recommended Phase 2G next step

Perform **read-only PostgreSQL metadata export and RPC dependency reconciliation** with a database-owner-approved connection.

The resulting export must answer the unresolved items in Section 7 and produce a verified mapping of:

- existing tables/views/functions to the revised target model;
- constraints/indexes already satisfying or blocking Phase 2B invariants;
- active versus archival structures;
- RPC behavior that must be preserved, extended, or superseded;
- a decision on whether `member_cycles`, allocation, webhook, and audit tables are actually new requirements.

Only after Phase 2G should Phase 2C be revised into an ordered additive migration design. SQL should still not be drafted until the owner approves the revised design and exception policy.