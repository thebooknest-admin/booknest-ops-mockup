import { z } from "zod";
import { operatorProcedure, router } from "../../_core/trpc";
import { listPackingOrders, markShipmentPacked } from "./services/packing.service";

export const packingRouter = router({
  list: operatorProcedure.query(async () => listPackingOrders()),
  markPacked: operatorProcedure
    .input(z.object({ shipment_id: z.string() }))
    .mutation(async ({ input }) => markShipmentPacked(input)),
});