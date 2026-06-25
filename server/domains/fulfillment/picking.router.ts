/**
 * Picking Router — Scan-based picking engine
 *
 * Status flow:
 * picking → packing → shipped
 *
 * 1. picking.dailyOrders  → list all shipments in 'picking' status
 * 2. picking.suggestBooks → ranked book suggestions with SKU + bin location
 * 3. picking.confirmPicks → scan confirmed, move shipment to 'packing'
 */

import { z } from "zod";
import { formatInventoryLocation } from "@shared/booknest";
import { operatorProcedure, router } from "../../_core/trpc";
import { sbFetch, sbJson, sbVoid } from "../../supabase";
import { ensureMemberDefaultAddressFromShopify } from "../../shopify-address";
import { getShipmentPickList, swapShipmentBook } from "./services/picking.service";
import { getBookCount, suggestBooksForMember } from "./services/book-selection";

function getBirthdayBoxInfo(birthday: string | null, shipmentDate: string | null) {
  if (!birthday || !shipmentDate) return null;

  const birthDate = new Date(birthday);
  const shipDate = new Date(shipmentDate);

  const birthdayThisYear = new Date(
    shipDate.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );

  const windowStart = new Date(shipDate);
  windowStart.setDate(shipDate.getDate() - 7);

  const windowEnd = new Date(shipDate);
  windowEnd.setDate(shipDate.getDate() + 7);

  if (birthdayThisYear >= windowStart && birthdayThisYear <= windowEnd) {
    return {
      is_birthday_box: true,
      birthday: birthdayThisYear.toISOString().split("T")[0],
      message: "Add birthday book if available + birthday gift",
    };
  }

  return null;
}

export const pickingRouter = router({
  /**
   * Returns all shipments in 'picking' status.
   */
  dailyOrders: operatorProcedure
    .input(
      z.object({
        date: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const today = input?.date ?? new Date().toISOString().split("T")[0];

      // Get all shipments in picking status
      const shipmentsRes = await sbFetch(
  `/shipments?status=eq.picking&shipment_type=eq.outbound&select=id,member_id,scheduled_ship_date&order=scheduled_ship_date.asc&limit=200`
);
      const pendingShipments: any[] = await shipmentsRes.json();

      if (!pendingShipments.length) return { orders: [], date: today };

      const memberIds = [...new Set(pendingShipments.map((s) => s.member_id))];

      // ✅ FIXED: added books_per_box to select
      const membersRes = await sbFetch(
        `/members?id=in.(${memberIds.join(",")})&welcome_form_completed=eq.true&select=id,name,tier,age_group,birthday,next_ship_date,topics_to_avoid,notes,email,subscription_status,books_per_box&limit=200`
      );
      const members: any[] = await membersRes.json();
      const memberMap: Record<string, any> = {};
      for (const m of members) memberMap[m.id] = m;

      // Get member interests
      const interestsRes = await sbFetch(
        `/member_interests?member_id=in.(${memberIds.join(",")})&select=member_id,interest_category&limit=500`
      );
      const interests: any[] = await interestsRes.json();
      const interestsByMember: Record<string, string[]> = {};
      for (const i of interests) {
        if (!interestsByMember[i.member_id]) interestsByMember[i.member_id] = [];
        interestsByMember[i.member_id].push(i.interest_category);
      }

      // Get member addresses
      const addressRes = await sbFetch(
        `/member_addresses?member_id=in.(${memberIds.join(",")})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=500`
      );
      const addresses: any[] = await addressRes.json();
      const addressByMember: Record<string, any> = {};
      for (const a of addresses) addressByMember[a.member_id] = a;

      const orders = pendingShipments
        .filter((s) => memberMap[s.member_id])
        .map((s) => {
          const m = memberMap[s.member_id];
          const isOverdue = s.scheduled_ship_date < today;
          const birthdayBox = getBirthdayBoxInfo(
  m.birthday ?? null,
  s.scheduled_ship_date ?? null
);
          return {
            member_id: m.id,
            member_name: m.name,
            tier: m.tier,
            age_group: m.age_group,
            next_ship_date: s.scheduled_ship_date,
            topics_to_avoid: m.topics_to_avoid ?? [],
            interests: interestsByMember[m.id] ?? [],
            notes: m.notes ?? null,
            address: addressByMember[m.id] ?? null,
            books_needed: getBookCount(m.tier, m.books_per_box), // ✅ FIXED
            shipment_id: s.id,
            birthday_box: birthdayBox,
            is_overdue: isOverdue,
          };
        });

      return { orders, date: today };
    }),

  /**
   * Suggests ranked books for a specific member with SKU + bin location.
   */
  suggestBooks: operatorProcedure
    .input(
      z.object({
        member_id: z.string(),
        count: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ input }) => suggestBooksForMember(input)),
      /**
   * Returns the existing assigned pick list for a shipment.
   */
  getShipmentPickList: operatorProcedure
    .input(
      z.object({
        shipment_id: z.string(),
      })
    )
    .query(async ({ input }) => getShipmentPickList(input)),
  /**
   * Swaps one assigned shipment book for a new alternate.
   */
  swapShipmentBook: operatorProcedure
    .input(
      z.object({
        shipment_id: z.string(),
        member_id: z.string(),
        old_book_copy_id: z.string(),
        books_needed: z.number().min(1).max(50).default(30),
      })
    )
    .mutation(async ({ input }) => swapShipmentBook(input)),
  /**
   * Confirms scanned picks — moves shipment to 'packing' status.
   */
  confirmPicks: operatorProcedure
    .input(
      z.object({
        picks: z.array(
          z.object({
            member_id: z.string(),
            shipment_id: z.string(),
            book_title_ids: z.array(z.string()),
            copy_ids: z.array(z.string()),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const results: { member_id: string; shipment_id: string; shipment_number: string }[] = [];

      for (const pick of input.picks) {
        const { member_id, shipment_id, book_title_ids, copy_ids } = pick;
        const now = new Date().toISOString();

        if (book_title_ids.length !== copy_ids.length) {
          throw new Error("Each scanned copy must have a matching title.");
        }

        const uniqueCopyIds = Array.from(new Set(copy_ids.filter(Boolean)));
        if (uniqueCopyIds.length !== copy_ids.length) {
          throw new Error("A copy was scanned more than once for this shipment.");
        }

        // Get the existing shipment
        const [shipment] = await sbJson<
          { id: string; shipment_number: string; member_id: string; status: string }[]
        >(
          `/shipments?id=eq.${shipment_id}&select=id,shipment_number,member_id,status&limit=1`
        );
        if (!shipment) throw new Error("Shipment not found.");
        if (shipment.member_id !== member_id) {
          throw new Error("Shipment does not belong to the selected member.");
        }
        if (shipment.status !== "picking") {
          throw new Error(`Shipment is already ${shipment.status}; refresh the queue.`);
        }

        const assignedRows = await sbJson<
          {
            id: string;
            book_title_id: string | null;
            book_copy_id: string | null;
            status: string | null;
          }[]
        >(
          `/shipment_books?shipment_id=eq.${shipment_id}&select=id,book_title_id,book_copy_id,status&limit=200`
        );

        if (assignedRows.length === 0) {
          throw new Error("Shipment has no assigned books to pick.");
        }

        if (uniqueCopyIds.length !== assignedRows.length) {
          throw new Error("Scan every assigned book before completing the order.");
        }

        const copies = await sbJson<
          { id: string; book_title_id: string; status: string }[]
        >(
          `/book_copies?id=in.(${uniqueCopyIds.join(",")})&select=id,book_title_id,status&limit=200`
        );
        const copyMap = new Map(copies.map((copy) => [copy.id, copy]));

        if (copies.length !== uniqueCopyIds.length) {
          throw new Error("One or more scanned copies no longer exists.");
        }

        let address: { id: string } | null = null;
        try {
          address = await ensureMemberDefaultAddressFromShopify(member_id);
        } catch (error) {
          console.warn(
            `[picking.confirmPicks] Could not sync Shopify address for member ${member_id}:`,
            error
          );
        }

        const usedShipmentBookIds = new Set<string>();
        for (let i = 0; i < book_title_ids.length; i++) {
          const titleId = book_title_ids[i];
          const copyId = copy_ids[i];
          if (!titleId || !copyId) continue;

          const copy = copyMap.get(copyId);
          if (!copy) throw new Error(`Scanned copy ${copyId} was not found.`);
          if (copy.book_title_id !== titleId) {
            throw new Error("A scanned copy does not match its assigned title.");
          }
          if (!["in_house", "reserved"].includes(copy.status)) {
            throw new Error("A scanned copy is not available for picking. Refresh and try again.");
          }

          const shipmentBook = assignedRows.find(
            (row) =>
              !usedShipmentBookIds.has(row.id) &&
              (row.book_copy_id === copyId ||
                (!row.book_copy_id && row.book_title_id === titleId))
          );

          if (!shipmentBook) {
            throw new Error("A scanned copy is not assigned to this shipment.");
          }

          usedShipmentBookIds.add(shipmentBook.id);

          await sbVoid(`/shipment_books?id=eq.${shipmentBook.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              book_copy_id: copyId,
              book_title_id: titleId,
              status: "picked",
              picked_at: now,
              scanned_at: now,
            }),
            headers: { Prefer: "return=minimal" },
          });
        }

        await sbVoid(`/shipments?id=eq.${shipment_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "packing",
            address_id: address?.id ?? null,
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });

        // Update member's next_ship_date (advance by ~4 weeks)
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 28);
        await sbVoid(`/members?id=eq.${member_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            next_ship_date: nextDate.toISOString().split("T")[0],
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });

        results.push({
          member_id,
          shipment_id: shipment.id,
          shipment_number: shipment.shipment_number,
        });
      }

      return { success: true, shipments: results };
    }),

  /**
   * Returns a master pick list for confirmed shipments grouped by bin.
   */
  batchPickList: operatorProcedure
    .input(z.object({ shipment_ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.shipment_ids.length) return { bins: [], total_books: 0 };

      const sbRes = await sbFetch(
        `/shipment_books?shipment_id=in.(${input.shipment_ids.join(",")})&select=shipment_id,book_title_id,book_copy_id&limit=500`
      );
      const sbBooks: any[] = await sbRes.json();

      const titleIds = Array.from(new Set(sbBooks.map((b) => b.book_title_id)));
      const titleMap: Record<string, any> = {};
      if (titleIds.length > 0) {
        for (let i = 0; i < titleIds.length; i += 50) {
          const batch = titleIds.slice(i, i + 50);
          const tr = await sbFetch(
            `/book_titles?id=in.(${batch.join(",")})&select=id,title,author,cover_url&limit=200`
          );
          const titles: any[] = await tr.json();
          for (const t of titles) titleMap[t.id] = t;
        }
      }

      const copyIds = Array.from(new Set(sbBooks.map((b) => b.book_copy_id).filter(Boolean)));
      const copyMap: Record<string, any> = {};
      if (copyIds.length > 0) {
        for (let i = 0; i < copyIds.length; i += 50) {
          const batch = copyIds.slice(i, i + 50);
          const cr = await sbFetch(
            `/book_copies?id=in.(${batch.join(",")})&select=id,sku,bin_id,section&limit=200`
          );
          const copies: any[] = await cr.json();
          for (const c of copies) copyMap[c.id] = c;
        }
      }

      const shipRes = await sbFetch(
        `/shipments?id=in.(${input.shipment_ids.join(",")})&select=id,member_id&limit=200`
      );
      const shipments: any[] = await shipRes.json();
      const memberIds = Array.from(new Set(shipments.map((s) => s.member_id)));
      const memberMap: Record<string, string> = {};
      if (memberIds.length > 0) {
        const mr = await sbFetch(
          `/members?id=in.(${memberIds.join(",")})&select=id,name&limit=200`
        );
        const members: any[] = await mr.json();
        for (const m of members) memberMap[m.id] = m.name;
      }
      const shipmentMemberMap: Record<string, string> = {};
      for (const s of shipments) {
        shipmentMemberMap[s.id] = memberMap[s.member_id] ?? "Unknown";
      }

      const binMap: Record<string, { bin_id: string; items: any[] }> = {};
      for (const sb of sbBooks) {
        const title = titleMap[sb.book_title_id];
        if (!title) continue;
        const binId =
          formatInventoryLocation(
            copyMap[sb.book_copy_id]?.bin_id,
            copyMap[sb.book_copy_id]?.section
          ) ?? "UNKNOWN";
        if (!binMap[binId]) binMap[binId] = { bin_id: binId, items: [] };
        binMap[binId].items.push({
          book_title_id: sb.book_title_id,
          book_copy_id: sb.book_copy_id,
          sku: copyMap[sb.book_copy_id]?.sku ?? null,
          title: title.title,
          author: title.author,
          cover_url: title.cover_url ?? null,
          shipment_id: sb.shipment_id,
          member_name: shipmentMemberMap[sb.shipment_id] ?? "Unknown",
        });
      }

      const bins = Object.values(binMap).sort((a, b) => a.bin_id.localeCompare(b.bin_id));
      return { bins, total_books: sbBooks.length };
    }),
});
