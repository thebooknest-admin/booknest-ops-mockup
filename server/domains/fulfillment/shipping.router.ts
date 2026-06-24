import { z } from "zod";
import { operatorProcedure, router } from "../../_core/trpc";
import {
  listShippingShipments,
  markShipmentShipped,
  saveReturnTracking,
} from "./services/shipping.service";

export const shippingRouter = router({
  list: operatorProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => listShippingShipments(input)),
  markShipped: operatorProcedure
    .input(z.object({ shipment_id: z.string(), tracking_number: z.string() }))
    .mutation(async ({ input }) => markShipmentShipped(input)),
  saveReturnTracking: operatorProcedure
    .input(z.object({ shipment_id: z.string(), tracking_number: z.string() }))
    .mutation(async ({ input }) => saveReturnTracking(input)),
});