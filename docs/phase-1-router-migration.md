# Phase 1 Router Migration Diff

**Date:** 2026-06-23  
**Scope:** server-only router architecture. No UI code, API contract, Supabase schema, migrations, database data, or workflow rules were changed.

## What changed

`server/routers.ts` changed from the 3,233-line implementation-and-composition file into the public application composition layer. It now imports stable domain boundaries and composes the exact same root tRPC namespaces.

The pre-existing implementation is preserved verbatim in `server/domains/_legacy/legacy-app-router.ts`, except for import paths and its exported name (`legacyAppRouter`). Each new domain file exposes the corresponding existing router instance. This is intentionally a safe Phase 1 strangler boundary: handlers retain their original code and runtime behavior while later work can migrate one domain at a time without changing consumers.

## File migration map

| Before | After | Change |
| --- | --- | --- |
| `server/routers.ts` | `server/routers.ts` | Replaced monolithic implementation with application router composition. |
| `server/routers.ts` implementation | `server/domains/_legacy/legacy-app-router.ts` | Relocated intact; `appRouter` renamed to private `legacyAppRouter`. |
| `server/routers/isbn.ts` | `server/domains/inventory/isbn.router.ts` | Physical move only; import path adjusted for its new directory. |
| `server/routers/picking.ts` | `server/domains/fulfillment/picking.router.ts` | Physical move only; import paths adjusted. |
| `server/routers/packing.ts` | `server/domains/fulfillment/packing.router.ts` | Physical move only; import paths adjusted. |
| `server/routers/shipping.ts` | `server/domains/fulfillment/shipping.router.ts` | Physical move only; import paths adjusted. |
| — | `server/domains/members/router.ts` | Member route boundary: `legacyAppRouter.members`. |
| — | `server/domains/inventory/router.ts` | Inventory, labels, receive, QC, and stock route boundaries. |
| — | `server/domains/fulfillment/router.ts` | Picking, packing, shipping, and shipments route boundaries. |
| — | `server/domains/returns/router.ts` | Returns route boundary. |
| — | `server/domains/donations/router.ts` | Donations route boundary. |
| — | `server/domains/core/router.ts` | Existing system, auth, and dashboard boundaries. |
| — | `server/domains/support/router.ts` | Existing internal support route boundary. |
| — | `server/domains/acquisition/legacy-router.ts` | Existing signup/welcome boundary, deliberately isolated and unchanged. |

## Root route contract: before and after

Every root namespace and child procedure remains unchanged. This is a structural import change only.

| Root namespace | Source after migration |
| --- | --- |
| `system`, `auth`, `dashboard` | `domains/core/router` |
| `members` | `domains/members/router` |
| `inventory`, `labels`, `receive`, `qc`, `stock`, `isbn` | `domains/inventory/*` |
| `picking`, `packing`, `shipping`, `shipments` | `domains/fulfillment/*` |
| `returns` | `domains/returns/router` |
| `donations` | `domains/donations/router` |
| `support` | `domains/support/router` |
| `welcome`, `signups` | `domains/acquisition/legacy-router` |

Representative unchanged calls:

- `trpc.inventory.summary`, `trpc.receive.addBook`, `trpc.labels.pending`, `trpc.qc.pass`, `trpc.stock.confirmPlaced`
- `trpc.members.list`, `trpc.members.requestBundle`
- `trpc.picking.confirmPicks`, `trpc.packing.markPacked`, `trpc.shipping.markShipped`, `trpc.shipments.byId`
- `trpc.returns.processBundleBook`, `trpc.donations.add`

## Explicit non-changes

- No SQL, `drizzle/`, `scripts/supabase/`, or Supabase client changes.
- No page, component, route URL, client tRPC call, or UI changes.
- No procedure input, output, auth middleware, business rule, state transition, EasyPost, ISBN, scanner, label, picking, packing, shipping, returns, member, or donation logic changes.
- No deletion or quarantine of signup/welcome/Shopify code in this phase. It is only isolated behind a legacy acquisition boundary.

## Verification

- `npm run check` passes after the migration.
- Production build passes (`npm run build`).
- A route-contract check confirmed all 16 retained root namespaces and 69 procedures are present in the new `appRouter`.
- `npm test`: the local PIN and logout tests pass. The three existing Supabase connection tests cannot run in this shell because `SUPABASE_URL` and `SUPABASE_ANON_KEY` are not supplied; no schema or connection code was changed.