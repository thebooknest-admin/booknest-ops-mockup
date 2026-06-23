# The Book Nest Ops: Cleanup Report and Migration Plan

**Audit date:** 2026-06-23  
**Scope:** the internal owner/operator app only. Customer signup, welcome, portal, WordPress, and Shopify checkout work are explicitly out of scope.

## Executive summary

The repository already contains the important operational workflows: inventory intake, ISBN lookup and classification, camera barcode scanning, inventory labels, pick/pack/ship, return handling, members, donation logging, and EasyPost tracking. The immediate goal is not a rewrite. It is to make those workflows a small, secure, clearly-owned application.

The principal risks are architectural rather than missing screens:

1. `server/routers.ts` is a 112 KB mixed-domain router; it blends ops logic with public welcome/signup and support flows.
2. Nearly every operational read and mutation is a `publicProcedure`. A PIN gate in the browser is not authorization.
3. The checked-in Drizzle schema is a MySQL starter `users` table, whereas application data is accessed through Supabase PostgREST. It must not be treated as the database source of truth.
4. Book condition is persisted and displayed in several workflows despite the stated rule not to track it.
5. Age-tier vocabulary is inconsistent (`skyreaders` vs `sky_readers`) and the required `13+` tier is absent.
6. Transition checks are implemented across several REST writes. They need database-backed, transactional state transitions to protect against duplicate picks and premature re-ships.
7. Mock notifications and a template/Manus surface are still part of the app bundle.

No code or data should be deleted in the first pass. Quarantine source into an archive branch/folder only after route and import checks, then delete it in a later release.

## What the current ops application contains

| Area | Existing implementation | Assessment |
| --- | --- | --- |
| Inventory and catalog | Inventory list/detail, receive flow, QC, labels, shelving, sections | Keep; refactor into inventory domain modules. |
| Intake | ISBN classifier, metadata lookup, tag/age suggestions, webcam barcode reader | Keep; consolidate duplicated taxonomy/age code. |
| Fulfilment | Pick suggestions, scan confirmation, packing queue, shipping queue, bundle view | Keep; enforce transitions in PostgreSQL RPCs. |
| Shipping | Manual tracking entry and EasyPost tracker registration/webhook | Keep; make webhook verified/idempotent and isolate carrier client. |
| Returns | Return bundles, per-book return resolution, history, automatic next shipment logic | Keep; redesign around a single member circulation cycle. |
| Members | List, profile, creation, address and bundle request actions | Keep; remove Shopify-address fallback. |
| Donations | Intake and log | Keep; replace condition grading with a one-time circulation disposition. |
| Support reports | Internal triage of damaged/missing reports | Keep as an optional ops domain; no customer UI work is implied. |
| Public acquisition | Signup, welcome, event-signup overlay/control, Shopify OAuth/address sync | Quarantine; out of scope. |
| Template/platform features | Manus OAuth/SDK/AI/chat/map/voice, component showcase, mock data | Quarantine after dependency check. |

## Files to keep

Keep these as functional source material. They should move into the proposed structure rather than be copied unchanged.

- `client/src/pages/{Dashboard,InventoryPage,ReceivePage,QCQueuePage,LabelsPage,StockQueuePage,PickingPage,PackingPage,ShippingPage,ShipBundlePage,OrdersPage,ReturnsPage,MembersPage,MemberProfilePage,DonationIntakePage,DonationLogPage,SupportPage,IsbnLookupPage}.tsx`
- `client/src/components/{AppLayout,AddMemberModal,BookDetailDrawer,PinGate,useBarcodeScanner}.tsx` and only the `components/ui/*` controls actually imported by retained screens.
- `client/src/lib/{trpc,utils,shipDays}.ts` (after standardization); `client/src/lib/{ageInference,tags}.ts` as reference for the canonical classification module.
- `server/routers/{isbn,picking,packing,shipping}.ts`, `server/book-matching.ts`, `server/webhooks/easypost-tracking.ts`, `server/supabase.ts`, and `shared/booknest.ts`.
- `scripts/{backfill-metadata,reclassify-books}.js` as controlled admin scripts, moved under an explicit `scripts/maintenance/` area with dry-run support.
- `scripts/supabase/{001_label_status_not_required,003_book_copy_sections}.sql` as historical migration inputs. Move their *contents* to the canonical migration history; do not replay blindly.

## Files to refactor

| File/group | Required refactor |
| --- | --- |
| `server/routers.ts` | Split its member, inventory, label, receive, QC, stock, donation, return, support, and dashboard routers into named domain modules. Delete no behavior during the split; move tests with each router. |
| `server/supabase.ts` | Reduce to a typed Supabase server client/repository boundary. Stop putting aggregate logic in this generic client. Use service-role credentials only on the server and fail fast on missing environment variables. |
| `server/routers/{picking,packing,shipping}.ts` | Replace multi-request check-then-write sequences with PostgreSQL RPCs/transactions that own a state transition. Keep the scanner-facing API small and idempotent. |
| `server/webhooks/easypost-tracking.ts` | Verify EasyPost webhook signatures, record delivery/event IDs, make handling idempotent, and never create a shipment from an unverified event. |
| `server/_core/trpc.ts` and `server/_core/context.ts` | Make all `/api/ops/*` procedures admin-protected. Retain public procedures only for a health endpoint and, temporarily, explicitly mounted public legacy endpoints. |
| `client/src/App.tsx` | Route only the ops app. Remove hostname routing and `/signup`/`/welcome` routes after quarantine. |
| `client/src/components/AppLayout.tsx` | Remove the signup overlay and `lib/data` notifications; simplify navigation around the daily ops flow. |
| `client/src/components/{BookDetailDrawer,AddMemberModal}.tsx` | Make edits use domain DTOs and explicit inventory move/disposition actions; remove condition editing. |
| `client/src/pages/{ReceivePage,QCQueuePage,StockQueuePage,DonationIntakePage,DonationLogPage}.tsx` | Remove condition capture/badges. Ask only whether a received/returned book is suitable for circulation; route unsuitable items directly to `removed` or `donated_out` with a reason. |
| `client/src/lib/{ageInference,tags}.ts` and `shared/booknest.ts` | Make `shared/catalog/` the only taxonomy/age/SKU/location source. Normalize `skyreaders` to `sky_readers`, add `thirteen_plus`, and make Cozy Nest the canonical six-book plan. |
| `drizzle/{schema.ts,relations.ts,0000_adorable_stick.sql}` and `drizzle.config.ts` | Retire from the application data path. They describe MySQL/Manus auth, not Supabase/Postgres. Keep read-only until the authoritative Supabase migrations are committed and validated. |

## Files to quarantine (do not delete in phase one)

Move these to `archive/customer-acquisition/` or `archive/platform-template/` on a dedicated cleanup branch; remove their routes/imports first.

### Customer acquisition / ecommerce (out of scope)

- `client/src/pages/{SignupPage,SignupControlPage,WelcomePage}.tsx`
- `server/routers.ts` namespaces `welcome` and `signups`
- `server/{shopify-oauth,shopify-address}.ts`
- `scripts/supabase/002_shopify_installations.sql`
- Shopify registration in `server/_core/index.ts`

`picking` currently calls `ensureMemberDefaultAddressFromShopify`; replace it with a required, versioned `member_addresses` record before moving the Shopify files. `shopify_customer_id` can remain nullable legacy data, but should not be required by the ops workflow.

### Mock/template/unused candidates

- `client/src/lib/data.ts` — active mock notifications plus mock domain models/data. The current sidebar imports `notifications` from it.
- `client/src/pages/{ComponentShowcase,Home}.tsx`
- `client/src/components/{AIChatBox,DashboardLayout,DashboardLayoutSkeleton,ManusDialog,Map}.tsx`
- `server/{db,storage}.ts`
- `server/_core/{dataApi,imageGeneration,llm,map,oauth,sdk,voiceTranscription}.ts` and related Manus auth files, after confirming the retained admin authentication replacement.

The audit found no retained-screen imports for the template candidate components/pages above. Confirm with `rg` and a production build immediately before moving them. Do not remove shared UI components mechanically; tree-shake them first and remove only those still unused.

## Proposed target folder structure

```text
client/src/
  app/                    # provider composition, guarded ops routes
  features/
    dashboard/
    members/
    catalog/               # ISBN lookup and classification review
    inventory/             # catalog, locations, moves, labels, QC, intake
    fulfilment/            # pick, pack, ship, shipment detail
    returns/
    donations/
    support/
  components/              # shared ops controls only
  lib/                     # transport, formatting, scanner primitive

server/
  api/
    ops-router.ts
    public-router.ts       # health only; legacy endpoints temporarily explicit
  domains/
    members/
    catalog/
    inventory/
    fulfilment/
    returns/
    donations/
    support/
  integrations/
    supabase/
    easypost/
    isbn/
  webhooks/
  auth/

shared/
  catalog/                 # age tiers, taxonomy, ISBN normalization
  inventory/               # statuses and valid transitions
  fulfilment/              # plan definitions and DTOs

supabase/
  migrations/              # timestamped Postgres source of truth
  functions/               # only if a job/webhook merits an Edge Function
  seed/                    # deliberately named non-production fixtures

archive/
  customer-acquisition/
  platform-template/
docs/
  ops-cleanup-report.md
```

## Backend/API cleanup plan

1. **Introduce a protected ops boundary.** Mount an `opsRouter` below the existing tRPC router. Convert every retained query/mutation from `publicProcedure` to `adminProcedure` (or a dedicated `operatorProcedure`). A browser PIN can remain a convenience lock, but it is not the authorization control.
2. **Keep public routes isolated.** `system.health` may remain public. The legacy welcome/signup endpoints should live in a separate router only until quarantined, never alongside ops procedures.
3. **Use repositories and domain services.** Domain routers validate input and call one service; repositories perform database access. Remove ad-hoc PostgREST URLs from route handlers.
4. **Use Supabase RPCs for atomic mutations.** Implement `receive_copy`, `move_copy`, `confirm_pick`, `mark_packed`, `mark_shipped`, `process_return_book`, and `create_member_cycle` as transaction-owning PostgreSQL functions. Each accepts an idempotency key and returns the updated aggregate.
5. **Represent the state machine once.** Put valid transitions in `shared/inventory` and enforce them in database functions. Do not let pages patch `status` directly.
6. **Harden shipping.** Make an `EasyPostClient` own label/tracker calls, persist external IDs and immutable carrier events, and make webhook processing signature-verified and idempotent. The existing shipping file says “Shippo” while using EasyPost—correct the terminology during extraction.
7. **Standardize errors/observability.** Return typed domain errors such as `COPY_NOT_AVAILABLE`, `DUPLICATE_MEMBER_TITLE`, and `RETURN_REQUIRED`; log actor, entity, before/after states, request ID, and carrier event ID.
8. **Remove Shopify fallbacks.** An outbound shipment must have a valid snapshot of the member address selected before pick starts. Ops should never need a live Shopify request to complete a pick.

## Supabase schema gaps and migrations

The live schema was not inspected in this audit, so this is a target checklist derived from the REST tables used by the code. First export the Supabase schema and compare it to this list before applying migrations.

### Canonical enums/checks

- `age_tier`: `hatchlings`, `fledglings`, `soarers`, `sky_readers`, `thirteen_plus`.
- `plan_code`: retain `cozy_nest` with `book_count = 6`; do not infer the number in UI code.
- `copy_status`: intake/QC/label/shelving/available/reserved/in_transit/returning/removed/donated_out/lost. Use names that map to actual workflow states and terminal dispositions.
- `shipment_status` and `return_status` with explicit checks, not open text columns.
- Remove `book_copies.condition` from the active model only after data migration. Replace with `circulation_disposition` (`circulatable`, `removed`, `donated_out`) and `disposition_reason`; these record a one-time operational decision, not a condition grade.

### Required tables / fields

- `book_titles`: canonical normalized ISBN-13, title, author, metadata, age tier, primary theme; unique non-null ISBN-13.
- `book_copies`: immutable SKU, title ID, current `location_id`, status, source donation/intake ID, timestamps. ISBN should be derived from the title where feasible.
- `storage_locations`: bin plus section, age tier/theme, active flag, display code; a unique `(bin_code, section_code)` means sections are first-class and copies can move later.
- `inventory_moves`: copy, from/to location, reason, operator, timestamp. This is the audit trail for shelving/moves, instead of overwriting `bin_id`/`section` without history.
- `intake_batches` and `intake_items`: scan/import provenance and a clear disposition for rejected/donated-out items.
- `donations` / optional `donors`: donation intake must link to created inventory copies or an out-of-circulation disposition.
- `shipments`, `shipment_books`, `returns`, `return_books`: preserve their current roles, but add immutable address snapshots, carrier external IDs, and state timestamps.
- `member_book_history`: unique `(member_id, book_title_id)` for the “never duplicate a title for a member” rule. If an exception is ever allowed, it must be an explicit override table/action, not a silent duplicate.
- `member_cycles` (recommended): one record per active lending cycle tying the outbound shipment to a return. This makes “no new bundle until returns are handled” deterministic.
- `print_jobs` / `print_job_items`: label template/version, printer target, operator, requested/printed/failed timestamps, and idempotency key.
- `webhook_events` and `operation_audit_log`: external event de-duplication and owner/operator traceability.

### Required constraints and indexes

- A partial unique index preventing more than one active circulation cycle per member.
- A partial unique index preventing an available/reserved copy from being allocated to more than one open shipment.
- A database function that locks the copy and member cycle (`FOR UPDATE`) before allocating/transitioning it.
- Indexes for available picking by `(age_tier, theme, location_id, status)`, SKU lookup, normalized ISBN-13, active return queue, and shipment status/date.
- RLS: operators can use approved RPCs and required read views; anonymous users cannot read/write operational tables. Server-only service role bypasses RLS in repositories.

## Owner/operator dashboard UX improvements

The dashboard should be a workbench, not a reporting gallery. Lead with the next irreversible operation.

1. **Today’s work strip:** “Pick 3”, “Pack 2”, “Ship 2”, “Returns 1”, “Labels 14”, each opening a filtered queue.
2. **Single fulfilment lane:** Pick → Pack → Ship with a prominent count, a no-surprises shipment detail, and clear blocking reasons (missing address, return outstanding, unavailable copy).
3. **Scanner-first pick mode:** full-screen scan input, expected SKU/location at the top, loud success/error feedback, undo before commit, and no manual status dropdown.
4. **Location-first inventory:** scan SKU, show current bin/section, select destination or scan a location label, then commit a recorded move. Use the exact same pattern for shelving and returns.
5. **Exception queue:** a single place for no-match scans, duplicate-title conflicts, missing/removed copy, address issues, and carrier failures. Never bury these in toast messages.
6. **Return checkpoint:** show all books in the cycle and require each one to be either checked into circulation, donated out, or removed before unlocking the next bundle.
7. **Membership detail:** one concise timeline of prior titles, open cycle, address snapshot, preferences, and the next permitted action. Highlight “Cozy Nest — 6 books” as the standard plan.
8. **Label workflow:** one print job per batch, a preview/count, print confirmation, reprint with a reason, and a reconciliation of unprinted/failed labels.
9. **Donation intake:** scan ISBN → review title/classification → choose `circulate`, `donate out`, or `remove` → record donor note. No condition scale.
10. **Keyboard and hardware:** autofocus scan fields, accept USB scanner Enter suffixes, show large location/SKU typography, and avoid modal stacks during pick/receive.

## Step-by-step implementation plan

### Phase 0 — freeze and measure

1. Create a cleanup branch and capture a production-safe Supabase schema export, RLS policies, SQL functions, and table row counts.
2. Add smoke tests for the existing receive, pick, pack, ship, return, ISBN, label, and donation routes before moving code.
3. Record the existing public URL/routes and revoke or disable unnecessary public exposure after the protected replacement is ready.

### Phase 1 — establish the boundary

4. Create `client/src/app` and `server/api/ops-router.ts`; preserve URLs initially but route all retained UI through guarded ops routes.
5. Convert retained procedures to operator/admin authorization; add an actual operator identity/role in Supabase Auth or the chosen admin auth provider.
6. Remove signup overlay/navigation and mock notification import from `AppLayout`; leave customer code untouched but unreachable.

### Phase 2 — make Supabase authoritative

7. Commit a `supabase/migrations` baseline from the real database. Treat `drizzle/` as legacy until it can be archived.
8. Add the canonical enums, age tier/plan normalization, location and movement records, and condition-to-disposition migration.
9. Backfill `skyreaders` to `sky_readers`, add `thirteen_plus`, normalize ISBNs, and derive/verify Cozy Nest = 6 from the plan table.

### Phase 3 — protect business rules

10. Implement RPCs and tests for pick, pack, ship, return, move, receive, and label status transitions.
11. Enforce a unique member/title history and active member cycle; migrate existing duplicate/open records into an owner-reviewed exception report rather than silently deleting them.
12. Replace direct route-level status patches with RPC calls, adding idempotency keys for scanner retries and carrier events.

### Phase 4 — extract domains and improve workflow UX

13. Split `server/routers.ts` and move pages into feature folders one domain at a time. Keep compatibility exports until each UI consumer moves.
14. Build the daily-work dashboard, scanner-first picking, location move flow, and returns checkpoint.
15. Extract EasyPost into `server/integrations/easypost`, verify webhook signatures, deduplicate carrier events, and persist label/tracker IDs.

### Phase 5 — quarantine and remove safely

16. Move signup/welcome/Shopify and template-only source into `archive/`, remove their server registrations, and validate that the ops build has no imports/routes left.
17. Remove mock `lib/data.ts`, unused template code, unused dependencies, and obsolete Drizzle/MySQL config only after a clean production build, route smoke test, and a rollback-tagged release.
18. Maintain an archive manifest with the commit SHA and restoration instructions; delete in a later release after the owner confirms none of the quarantined functionality is needed.

## Verification gates before each destructive change

- `npm run check`, test suite, and production build pass.
- A roleless session cannot call any ops mutation.
- A duplicate title cannot be allocated to the same member.
- An in-flight or otherwise allocated copy cannot be picked again.
- A member with an unhandled return cannot receive a new outbound cycle.
- A book can move between bin/section with a recorded move.
- A received unusable book never enters available inventory and does not require a condition rating.
- EasyPost duplicate/forged webhook events have no effect.
- One Cozy Nest pick contains exactly six allocated titles unless an explicit documented override is used.
