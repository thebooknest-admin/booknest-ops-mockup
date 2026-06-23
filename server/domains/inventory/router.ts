/** Phase 1 inventory-domain boundary. Existing route namespaces are preserved. */
import { legacyAppRouter } from "../_legacy/legacy-app-router";

export const inventoryRouter = legacyAppRouter.inventory;
export const labelsRouter = legacyAppRouter.labels;
export const receiveRouter = legacyAppRouter.receive;
export const qcRouter = legacyAppRouter.qc;
export const stockRouter = legacyAppRouter.stock;