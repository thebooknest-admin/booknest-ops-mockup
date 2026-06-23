/**
 * Book Nest application router.
 *
 * Phase 1 composes stable domain boundaries without changing the public tRPC
 * contract. Existing clients continue to call the same namespaces and
 * procedures (for example, `inventory.summary` and `returns.processBundle`).
 */
import { router } from "./_core/trpc";
import {
  authRouter,
  dashboardRouter,
  systemRouter,
} from "./domains/core/router";
import {
  inventoryRouter,
  labelsRouter,
  qcRouter,
  receiveRouter,
  stockRouter,
} from "./domains/inventory/router";
import { membersRouter } from "./domains/members/router";
import {
  packingRouter,
  pickingRouter,
  shipmentsRouter,
  shippingRouter,
} from "./domains/fulfillment/router";
import { returnsRouter } from "./domains/returns/router";
import { donationsRouter } from "./domains/donations/router";
import { supportRouter } from "./domains/support/router";
import {
  signupsRouter,
  welcomeRouter,
} from "./domains/acquisition/legacy-router";
import { isbnRouter } from "./domains/inventory/isbn.router";

export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  dashboard: dashboardRouter,
  members: membersRouter,
  inventory: inventoryRouter,
  labels: labelsRouter,
  receive: receiveRouter,
  qc: qcRouter,
  stock: stockRouter,
  isbn: isbnRouter,
  picking: pickingRouter,
  packing: packingRouter,
  shipping: shippingRouter,
  shipments: shipmentsRouter,
  returns: returnsRouter,
  donations: donationsRouter,
  support: supportRouter,
  // Compatibility routes deliberately isolated from internal ops domains.
  welcome: welcomeRouter,
  signups: signupsRouter,
});

export type AppRouter = typeof appRouter;