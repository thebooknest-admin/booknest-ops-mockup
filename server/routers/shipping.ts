/**
 * Shipping Router — Shippo label creation + manual tracking entry
 *
 * Flow:
 * 1. shipping.list          → packed shipments with full addresses for the queue
 * 2. shipping.markShipped   → save tracking number + mark shipment as shipped
 *                             + auto-create member_book_history rows
 *                             + register return tracking with EasyPost
 */

import EasyPost from '@easypost/api';
import { z } from 'zod';
import { publicProcedure, router } from '../_core/trpc';
import { sbFetch } from '../supabase';

const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY!;

/** Register a return tracking number with EasyPost so we get webhook updates */
async function registerEasyPostTracking(trackingNumber: string): Promise<boolean> {
  try {
    const client = new EasyPost(EASYPOST_API_KEY);
    await client.Tracker.create({
      tracking_code: trackingNumber,
      carrier: 'USPS',
    });
    return true;
  } catch (e) {
    console.error('EasyPost tracker registration failed:', e);
    return false;
  }
}

export const shippingRouter = router({

  // ─── List packed shipments for the shipping queue ─────────────────────────

  list: publicProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const status = input?.status ?? 'packed';

      const shipmentsRes = await sbFetch(
        `/shipments?status=eq.${status}&shipment_type=eq.outbound&select=id,member_id,order_number,shipment_number,scheduled_ship_date&order=scheduled_ship_date.asc&limit=200`
      );
      const shipments: any[] = await shipmentsRes.json();

      if (!shipments.length) return { data: [] };

      const memberIds = [...new Set(shipments.map((s) => s.member_id))];

      const [membersRes, addressesRes] = await Promise.all([
        sbFetch(`/members?id=in.(${memberIds.join(',')})&select=id,name,tier&limit=200`),
        sbFetch(`/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`),
      ]);

      const members: any[] = await membersRes.json();
      const addresses: any[] = await addressesRes.json();

      const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
      const addressMap = Object.fromEntries(addresses.map((a) => [a.member_id, a]));

      const data = shipments.map((s) => {
        const m = memberMap[s.member_id];
        const a = addressMap[s.member_id];
        return {
          id: s.id,
          order_number: s.order_number ?? null,
          shipment_number: s.shipment_number ?? null,
          scheduled_ship_date: s.scheduled_ship_date ?? null,
          member_name: m?.name ?? 'Unknown',
          member_tier: m?.tier ?? null,
          address: a
            ? {
                street: a.street,
                street2: a.street2 ?? null,
                city: a.city,
                state: a.state,
                zip: a.zip,
              }
            : null,
        };
      });

      return { data };
    }),

  // ─── Mark a single shipment as shipped ───────────────────────────────────

  markShipped: publicProcedure
    .input(
      z.object({
        shipment_id: z.string(),
        tracking_number: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { shipment_id, tracking_number } = input;

      // 1. Fetch the shipment to get member_id
      const shipRes = await sbFetch(
        `/shipments?id=eq.${shipment_id}&select=id,member_id,status&limit=1`
      );
      const [shipment] = await shipRes.json();

      if (!shipment) throw new Error('Shipment not found');
      if (shipment.status === 'shipped') throw new Error('Shipment already marked as shipped');

      // 2. Update shipment → shipped
      const patch = await sbFetch(`/shipments?id=eq.${shipment_id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          tracking_number,
          carrier: 'USPS',
          status: 'shipped',
          actual_ship_date: new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        }),
        headers: { Prefer: 'return=minimal' },
      });

      if (!patch.ok) {
        const err = await patch.text();
        throw new Error(`Failed to update shipment: ${err}`);
      }

      // 3. Auto-create member_book_history rows
      const sbRes = await sbFetch(
        `/shipment_books?shipment_id=eq.${shipment_id}&select=book_title_id`
      );
      const shipmentBooks: { book_title_id: string }[] = await sbRes.json();

      if (shipmentBooks.length > 0 && shipment.member_id) {
        const today = new Date().toISOString().split('T')[0];
        const historyRows = shipmentBooks.map((sb) => ({
          member_id: shipment.member_id,
          book_title_id: sb.book_title_id,
          shipment_id,
          received_date: today,
          kept: false,
          created_at: new Date().toISOString(),
        }));

        const histRes = await sbFetch('/member_book_history', {
          method: 'POST',
          body: JSON.stringify(historyRows),
          headers: { Prefer: 'return=minimal' },
        });

        if (!histRes.ok) {
          console.error(`[markShipped] Failed to create member_book_history for shipment ${shipment_id}`);
        } else {
          console.log(`[markShipped] Created ${historyRows.length} member_book_history rows`);
        }
      }

      // 4. Register outbound tracking with EasyPost for webhook updates
      await registerEasyPostTracking(tracking_number);

      return { success: true, shipment_id, tracking_number };
    }),

  // ─── Save return tracking number ─────────────────────────────────────────
  // Called when a return label is scanned on receipt (EasyPost webhook flow)

  saveReturnTracking: publicProcedure
    .input(
      z.object({
        shipment_id: z.string(),
        tracking_number: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { shipment_id, tracking_number } = input;

      // Find the shipment to get member_id
      const shipRes = await sbFetch(
        `/shipments?id=eq.${shipment_id}&select=id,member_id&limit=1`
      );
      const [shipment] = await shipRes.json();
      if (!shipment) throw new Error('Shipment not found');

      // Find the pending return for this member
      const returnRes = await sbFetch(
        `/returns?member_id=eq.${shipment.member_id}&status=eq.requested&order=created_at.desc&limit=1&select=id`
      );
      const [returnRecord] = await returnRes.json();
      if (!returnRecord) throw new Error('No pending return found for this member');

      // Save tracking to return record
      const patch = await sbFetch(`/returns?id=eq.${returnRecord.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          return_tracking_number: tracking_number,
          updated_at: new Date().toISOString(),
        }),
        headers: { Prefer: 'return=minimal' },
      });

      if (!patch.ok) throw new Error('Failed to save return tracking number');

      // Register with EasyPost
      const epRegistered = await registerEasyPostTracking(tracking_number);

      return { success: true, return_id: returnRecord.id, easypost_registered: epRegistered };
    }),
});