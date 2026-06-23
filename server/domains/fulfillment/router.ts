/** Phase 1 fulfillment-domain boundary. Existing route namespaces are preserved. */
import { legacyAppRouter } from "../_legacy/legacy-app-router";

export const pickingRouter = legacyAppRouter.picking;
export const packingRouter = legacyAppRouter.packing;
export const shippingRouter = legacyAppRouter.shipping;
export const shipmentsRouter = legacyAppRouter.shipments;