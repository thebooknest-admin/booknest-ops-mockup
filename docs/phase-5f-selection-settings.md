# Phase 5F: Internal Selection Settings

## Executive summary

Phase 5F adds a simple internal settings surface for tuning Pippa's book-selection engine without editing code. Settings are stored in Supabase when the new additive table is available. If the table is unavailable, the engine falls back to Phase 5E code defaults and continues selecting books.

This is internal ops only. It does not touch customer-facing, signup, portal, or WordPress work.

## Schema/storage

A new additive migration creates `public.selection_engine_settings`:

- `id uuid primary key default gen_random_uuid()`
- `config jsonb not null`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

The app reads the newest active row. Updating settings deactivates currently active rows and inserts a new active row, preserving prior settings history.

## Settings list

The internal UI controls:

- discovery picks per shipment
- interest match target percentage
- series continuation strength
- maximum same series per shipment
- author diversity strength
- theme diversity strength
- inventory health strength
- reading progression strength
- allow previously sent in suggestions
- exclude previously sent from bundle creation
- seasonal filtering
- theme variety

Strength controls use: Off, Low, Medium, High.

## Defaults

Defaults match Phase 5E behavior:

- discovery picks per shipment: 1
- interest match target percentage: 85
- series continuation strength: High
- maximum same series per shipment: 1
- author diversity strength: Low
- theme diversity strength: High
- inventory health strength: Medium
- reading progression strength: Low
- allow previously sent in suggestions: On
- exclude previously sent from bundle creation: On
- seasonal filtering: On
- theme variety: On

## Backend/API

New internal tRPC namespace:

- `selectionSettings.get`
- `selectionSettings.update`
- `selectionSettings.reset`
- `selectionSettings.defaults`

All procedures use the existing operator/admin boundary.

## UI

A new internal page is available at `/settings/selection` and appears in the ops sidebar as Selection Settings.

The page uses plain controls and helper text so future operators can understand what each setting changes.

## Fallback behavior

The selection engine attempts to load active database settings for each selection run. If the table is absent, inaccessible, or returns no row, it falls back to code defaults. This keeps fulfillment safe before the migration is applied and during rollback.

## Rollback plan

1. Revert the route/page/router changes.
2. Leave the additive table in place; unused rows do not affect runtime once code is reverted.
3. If needed in non-production, deactivate all settings rows or drop the table after confirming no deployed code reads it.
4. The engine will use code defaults if settings cannot be read.

## Future uses

Future phases can add richer validation, policy version stamps in `selection_metadata`, change history display, and operator presets once the basic settings loop has proven useful.
