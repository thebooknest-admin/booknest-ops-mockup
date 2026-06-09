/**
 * Packing Router — visibility into picked orders awaiting packing
 *
 * Status flow:
 * picking → packing → packed → shipped
 *
 * 1. packing.list       → all shipments in 'packing' status with member + address
 * 2. packing.markPacked → moves a shipment from 'packing' → 'packed'
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { sbFetch, sbJson, sbVoid } from "../supabase";

export const packingRouter = router({
  /**
   * Returns all shipments in 'packing' status, enriched with member + address.
   */
  list: publicProcedure.query(async () => {
    const shipmentsRes = await sbFetch(
      `/shipments?status=eq.packing&shipment_type=eq.outbound&select=id,member_id,shipment_number,order_number,scheduled_ship_date&order=scheduled_ship_date.asc&limit=200`
    );
    const shipments: any[] = await shipmentsRes.json();

    if (!shipments.length) return { orders: [] };

    const memberIds = [...new Set(shipments.map((s) => s.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(
        `/members?id=in.(${memberIds.join(",")})&select=id,name,tier,age_group&limit=200`
      ),
      sbFetch(
        `/member_addresses?member_id=in.(${memberIds.join(",")})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`
      ),
    ]);

    const members: any[] = await membersRes.json();
    const addresses: any[] = await addressesRes.json();

    const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
    const addressMap = Object.fromEntries(addresses.map((a) => [a.member_id, a]));

    const orders = shipments
      .filter((s) => memberMap[s.member_id])
      .map((s) => {
        const m = memberMap[s.member_id];
        return {
          shipment_id: s.id,
          shipment_number: s.shipment_number,
          order_number: s.order_number,
          scheduled_ship_date: s.scheduled_ship_date,
          member_id: m.id,
          member_name: m.name,
          tier: m.tier,
          age_group: m.age_group,
          address: addressMap[m.id] ?? null,
        };
      });

    return { orders };
  }),

  /**
   * Moves a single shipment from 'packing' → 'packed'.
   */
  markPacked: publicProcedure
    .input(z.object({ shipment_id: z.string() }))
    .mutation(async ({ input }) => {
      const [shipment] = await sbJson<{ id: string; status: string }[]>(
        `/shipments?id=eq.${input.shipment_id}&select=id,status&limit=1`
      );
      if (!shipment) throw new Error("Shipment not found.");
      if (shipment.status !== "packing") {
        throw new Error(`Shipment is already ${shipment.status}; refresh the queue.`);
      }

      const shipmentBooks = await sbJson<
        {
          id: string;
          book_copy_id: string | null;
          status: string | null;
          book_copies: { status: string | null } | null;
        }[]
      >(
        `/shipment_books?shipment_id=eq.${input.shipment_id}&select=id,book_copy_id,status,book_copies(status)&limit=200`
      );

      if (shipmentBooks.length === 0) {
        throw new Error("Cannot pack a shipment with no books assigned.");
      }

      const incompleteBook = shipmentBooks.find(
        (book) => !book.book_copy_id || book.status !== "picked"
      );

      if (incompleteBook) {
        throw new Error("Cannot pack until every assigned book has been scanned in picking.");
      }

      const unreservableBook = shipmentBooks.find(
        (book) => !["in_house", "in_transit"].includes(book.book_copies?.status ?? "")
      );

      if (unreservableBook) {
        throw new Error("Cannot pack because one or more picked books is no longer available.");
      }

      const now = new Date().toISOString();
      await sbVoid(`/shipments?id=eq.${input.shipment_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "packed",
          updated_at: now,
        }),
        headers: { Prefer: "return=minimal" },
      });
      return { success: true };
    }),
});
