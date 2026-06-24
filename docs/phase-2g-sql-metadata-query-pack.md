# Phase 2G: Read-only SQL Metadata Query Pack

**Purpose:** capture the PostgreSQL metadata that PostgREST/OpenAPI cannot expose.  
**Run manually:** Supabase SQL Editor, one query at a time.  
**Safety:** every SQL block below is a `SELECT` statement only. Nothing in this pack changes data, schema, permissions, configuration, or caches.

## Safety instructions

1. Run each query manually in Supabase SQL Editor; do not automate execution from the application or a script.
2. Run only the SQL inside the code blocks. Do **not** run any command containing `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, or `REFRESH`.
3. Queries that list function names such as `create_shipment_with_books` are still read-only because they only select catalog metadata; they do not invoke those functions.
4. Copy result grids into `docs/generated/phase-2g-results.md` manually, or paste the results into this thread for review. Do not paste connection strings, API keys, service-role keys, or user/member PII.
5. Record the run date/time, Supabase project/environment, and the role used. Use a database-owner-approved read-only role where possible.
6. The SQL Editor may restrict system-catalog visibility depending on role. Record empty/error results as findings; do not attempt to change permissions.

## Target relations

The relation-focused queries use this list where applicable:

```text
age_tiers, bins, themes, subscription_tiers, status_history,
intake_batches, intake_batch_items, sku_counters, picking_queue,
picking_batches, bundles, bundle_items, book_titles, book_copies,
shipments, shipment_books, shipment_book_swaps, returns, return_books,
member_book_history, donations
```

## Target RPCs

```text
get_shipment_pick_list
select_books_for_shipment
create_shipment_with_books
create_shipments_for_ship_date
commit_intake_batch
next_book_copy_sku
next_book_sku
generate_sku
create_label_batch
get_active_label_batch
mark_label_batch_printed
release_label_batch
get_picking_queue
can_member_request_swap
compute_base_disposition
```

## 1. Tables, views, and relation kinds across schemas

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  CASE c.relkind
    WHEN 'r' THEN 'table'
    WHEN 'p' THEN 'partitioned table'
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized view'
    WHEN 'f' THEN 'foreign table'
    ELSE c.relkind::text
  END AS relation_kind_label,
  c.relpersistence AS persistence
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
ORDER BY n.nspname, c.relname;
```

## 2. Columns, types, nullability, defaults, and generated state

```sql
SELECT
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation,
  c.is_generated,
  c.generation_expression
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name IN (
    'age_tiers', 'bins', 'themes', 'subscription_tiers', 'status_history',
    'intake_batches', 'intake_batch_items', 'sku_counters', 'picking_queue',
    'picking_batches', 'bundles', 'bundle_items', 'book_titles', 'book_copies',
    'shipments', 'shipment_books', 'shipment_book_swaps', 'returns',
    'return_books', 'member_book_history', 'donations'
  )
ORDER BY c.table_name, c.ordinal_position;
```

## 3. Primary keys

```sql
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  kcu.ordinal_position,
  kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON kcu.constraint_catalog = tc.constraint_catalog
 AND kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY tc.table_name, kcu.ordinal_position;
```

## 4. Foreign keys

```sql
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  kcu.column_name AS local_column,
  ccu.table_schema AS referenced_schema,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON kcu.constraint_catalog = tc.constraint_catalog
 AND kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_catalog = tc.constraint_catalog
 AND ccu.constraint_schema = tc.constraint_schema
 AND ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_catalog = tc.constraint_catalog
 AND rc.constraint_schema = tc.constraint_schema
 AND rc.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
```

## 5. Unique constraints

```sql
SELECT
  tc.table_schema,
  tc.table_name,
  tc.constraint_name,
  kcu.ordinal_position,
  kcu.column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON kcu.constraint_catalog = tc.constraint_catalog
 AND kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'UNIQUE'
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;
```

## 6. Check constraints, including status and section checks

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND con.contype = 'c'
ORDER BY c.relname, con.conname;
```

## 7. Indexes, including partial-index predicates

```sql
SELECT
  schemaname AS schema_name,
  tablename AS table_name,
  indexname AS index_name,
  indexdef AS index_definition
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

## 8. RLS enabled status

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm')
ORDER BY c.relname;
```

## 9. RLS policies

```sql
SELECT
  schemaname AS schema_name,
  tablename AS table_name,
  policyname AS policy_name,
  permissive,
  roles,
  cmd AS command,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## 10. Relation grants

```sql
SELECT
  grantor,
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
ORDER BY table_name, grantee, privilege_type;
```

## 11. Triggers and trigger definitions

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  p.proname AS trigger_function_name,
  pg_catalog.pg_get_triggerdef(t.oid, true) AS trigger_definition,
  pg_catalog.pg_get_functiondef(p.oid) AS trigger_function_definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_proc AS p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY c.relname, t.tgname;
```

## 12. `public.age_group` enum or domain definition

```sql
SELECT
  n.nspname AS schema_name,
  t.typname AS type_name,
  t.typtype AS type_kind,
  e.enumsortorder AS enum_sort_order,
  e.enumlabel AS enum_value,
  pg_catalog.format_type(t.oid, NULL) AS formatted_type
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND t.typname = 'age_group'
ORDER BY e.enumsortorder;
```

```sql
SELECT
  n.nspname AS schema_name,
  t.typname AS domain_name,
  pg_catalog.format_type(t.typbasetype, t.typtypmod) AS base_type,
  t.typnotnull AS not_null,
  t.typdefault AS default_expression,
  con.conname AS constraint_name,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_constraint AS con ON con.contypid = t.oid
WHERE n.nspname = 'public'
  AND t.typtype = 'd'
ORDER BY t.typname, con.conname;
```

## 13. All public enums and domains

```sql
SELECT
  n.nspname AS schema_name,
  t.typname AS type_name,
  t.typtype AS type_kind,
  pg_catalog.format_type(t.oid, NULL) AS formatted_type,
  e.enumsortorder AS enum_sort_order,
  e.enumlabel AS enum_value
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
  AND t.typtype IN ('e', 'd')
ORDER BY t.typname, e.enumsortorder;
```

## 14. Views and materialized views

```sql
SELECT
  table_schema,
  table_name,
  view_definition
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;
```

```sql
SELECT
  schemaname AS schema_name,
  matviewname AS materialized_view_name,
  definition
FROM pg_catalog.pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname;
```

## 15. Target RPC signatures, definitions, security mode, and configuration

```sql
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) AS result_type,
  l.lanname AS language,
  p.provolatile AS volatility,
  p.prosecdef AS security_definer,
  p.proleakproof AS leakproof,
  p.proconfig AS function_configuration,
  pg_catalog.pg_get_functiondef(p.oid) AS function_definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_shipment_pick_list', 'select_books_for_shipment',
    'create_shipment_with_books', 'create_shipments_for_ship_date',
    'commit_intake_batch', 'next_book_copy_sku', 'next_book_sku',
    'generate_sku', 'create_label_batch', 'get_active_label_batch',
    'mark_label_batch_printed', 'release_label_batch', 'get_picking_queue',
    'can_member_request_swap', 'compute_base_disposition'
  )
ORDER BY p.proname, identity_arguments;
```

## 16. Function grants and ACLs

```sql
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.proacl AS raw_acl,
  rp.grantee,
  rp.privilege_type,
  rp.is_grantable
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
LEFT JOIN information_schema.routine_privileges AS rp
  ON rp.routine_schema = n.nspname
 AND rp.routine_name = p.proname
WHERE n.nspname = 'public'
  AND p.proname IN (
    'get_shipment_pick_list', 'select_books_for_shipment',
    'create_shipment_with_books', 'create_shipments_for_ship_date',
    'commit_intake_batch', 'next_book_copy_sku', 'next_book_sku',
    'generate_sku', 'create_label_batch', 'get_active_label_batch',
    'mark_label_batch_printed', 'release_label_batch', 'get_picking_queue',
    'can_member_request_swap', 'compute_base_disposition'
  )
ORDER BY p.proname, rp.grantee, rp.privilege_type;
```

## 17. Function dependencies for picking, label, intake, and SKU RPCs

```sql
SELECT
  fn.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(fn.oid) AS identity_arguments,
  dep.deptype AS dependency_type,
  ref_ns.nspname AS referenced_schema,
  COALESCE(ref_rel.relname, ref_proc.proname, ref_type.typname) AS referenced_object,
  COALESCE(ref_rel.relkind::text, 'function_or_type') AS referenced_object_kind
FROM pg_catalog.pg_proc AS fn
JOIN pg_catalog.pg_namespace AS fn_ns ON fn_ns.oid = fn.pronamespace
LEFT JOIN pg_catalog.pg_depend AS dep
  ON dep.classid = 'pg_proc'::regclass
 AND dep.objid = fn.oid
LEFT JOIN pg_catalog.pg_class AS ref_rel
  ON ref_rel.oid = dep.refobjid
LEFT JOIN pg_catalog.pg_proc AS ref_proc
  ON ref_proc.oid = dep.refobjid
LEFT JOIN pg_catalog.pg_type AS ref_type
  ON ref_type.oid = dep.refobjid
LEFT JOIN pg_catalog.pg_namespace AS ref_ns
  ON ref_ns.oid = COALESCE(ref_rel.relnamespace, ref_proc.pronamespace, ref_type.typnamespace)
WHERE fn_ns.nspname = 'public'
  AND fn.proname IN (
    'get_shipment_pick_list', 'select_books_for_shipment',
    'create_shipment_with_books', 'create_shipments_for_ship_date',
    'commit_intake_batch', 'next_book_copy_sku', 'next_book_sku',
    'generate_sku', 'create_label_batch', 'get_active_label_batch',
    'mark_label_batch_printed', 'release_label_batch', 'get_picking_queue',
    'can_member_request_swap', 'compute_base_disposition'
  )
ORDER BY fn.proname, referenced_schema, referenced_object;
```

> Note: PostgreSQL dependency metadata may not list every table referenced inside dynamic SQL or PL/pgSQL bodies. Compare this result with the function definitions from Query 15.

## 18. Search label-batch relations and dependencies across all schemas

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  pg_catalog.obj_description(c.oid, 'pg_class') AS relation_comment
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relname ILIKE '%label%'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;
```

## 19. Search donations relations across all schemas

```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  c.relrowsecurity AS rls_enabled,
  pg_catalog.obj_description(c.oid, 'pg_class') AS relation_comment
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relname ILIKE '%donation%'
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
ORDER BY n.nspname, c.relname;
```

```sql
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_name ILIKE '%donation%'
ORDER BY c.table_schema, c.table_name, c.ordinal_position;
```

## 20. PostgREST-exposed schema clues

```sql
SELECT
  name,
  setting,
  source,
  context
FROM pg_catalog.pg_settings
WHERE name LIKE 'pgrst.%'
ORDER BY name;
```

```sql
SELECT
  current_setting('pgrst.db_schemas', true) AS configured_postgrest_schemas,
  current_setting('pgrst.db_extra_search_path', true) AS configured_extra_search_path,
  current_setting('pgrst.db_anon_role', true) AS configured_anon_role;
```

> Empty results are expected in many hosted Supabase SQL Editor sessions. Record them; do not attempt to set or refresh any setting.

## 21. Public-schema functions not in the target list

```sql
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname, identity_arguments;
```

## 22. Target relation dependencies

```sql
SELECT
  source_ns.nspname AS source_schema,
  source.relname AS source_relation,
  dep.deptype AS dependency_type,
  target_ns.nspname AS target_schema,
  target.relname AS target_relation,
  target.relkind AS target_relation_kind
FROM pg_catalog.pg_depend AS dep
JOIN pg_catalog.pg_class AS source ON source.oid = dep.objid
JOIN pg_catalog.pg_namespace AS source_ns ON source_ns.oid = source.relnamespace
JOIN pg_catalog.pg_class AS target ON target.oid = dep.refobjid
JOIN pg_catalog.pg_namespace AS target_ns ON target_ns.oid = target.relnamespace
WHERE source_ns.nspname = 'public'
  AND source.relname IN (
    'age_tiers', 'bins', 'themes', 'subscription_tiers', 'status_history',
    'intake_batches', 'intake_batch_items', 'sku_counters', 'picking_queue',
    'picking_batches', 'bundles', 'bundle_items', 'book_titles', 'book_copies',
    'shipments', 'shipment_books', 'returns', 'return_books',
    'member_book_history', 'donations'
  )
ORDER BY source.relname, target_ns.nspname, target.relname;
```

## How to hand off results

1. Create or update `docs/generated/phase-2g-results.md` manually.
2. Paste each query's result under a heading matching its section number.
3. For very large function/view definitions, preserve the full text in a local file and paste a sanitized summary plus file reference into the results document.
4. Redact only secrets. Keep identifiers, constraint names, type names, and function definitions intact because they are needed for migration planning.
5. Share the completed results document or paste its contents back for reconciliation. Do not paste any API key, connection URI, JWT, or customer PII.