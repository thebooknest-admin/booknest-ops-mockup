/**
 * Shipping Router — Pirateship CSV export + tracking import
 *
 * Flow:
 * 1. shipping.exportOrders   → packed shipments for next ship day with full addresses
 * 2. shipping.importTracking → match Pirateship export back to shipments + returns
 *    - Regular rows (BN-1003)     → mark outbound shipment as shipped
 *    - Return rows (BN-1003-RET)  → save return tracking + register with EasyPost
 */

import EasyPost from '@easypost/api';
import {z} from 'zod';
import {publicProcedure, router} from '../_core/trpc';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY!;
const OPS_BASE_URL = process.env.OPS_BASE_URL ?? 'https://booknest-ops-mockup-production.up.railway.app';

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sbFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {...sbHeaders, ...(options.headers ?? {})},
  });
}

const TIER_WEIGHT_OZ: Record<string, number> = {
  'little-nest': 32, 'cozy-nest': 48, 'story-nest': 64,
  little_nest: 32, cozy_nest: 48, story_nest: 64,
};
const DEFAULT_WEIGHT_OZ = 40;

const BOOK_NEST = {
  name: 'The Book Nest',
  street: '205 Ambrose Drive',
  street2: '#8',
  city: 'Ranson',
  state: 'WV',
  zip: '25438',
};

function getNextShipDate(): string {
  const today = new Date();
  const dow = today.getDay();
  if (dow === 2 || dow === 5) return today.toISOString().split('T')[0];
  const daysUntilTue = (2 - dow + 7) % 7;
  const daysUntilFri = (5 - dow + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + Math.min(daysUntilTue, daysUntilFri));
  return next.toISOString().split('T')[0];
}

/** Register a tracking number with EasyPost so we get webhook updates */
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
  // ─── CSV Export for Pirateship ────────────────────────────────────────────

  exportOrders: publicProcedure.query(async () => {
    const nextShipDate = getNextShipDate();

    const shipmentsRes = await sbFetch(
      `/shipments?status=eq.packed&shipment_type=eq.outbound&scheduled_ship_date=lte.${nextShipDate}&select=id,member_id,order_number,shipment_number,scheduled_ship_date&order=scheduled_ship_date.asc&limit=200`
    );
    const shipments: any[] = await shipmentsRes.json();

    if (!shipments.length) return { orders: [], missing: [], ship_date: nextShipDate };

    const memberIds = [...new Set(shipments.map((s) => s.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(`/members?id=in.(${memberIds.join(',')})&select=id,name,tier&limit=200`),
      sbFetch(`/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`),
    ]);

    const members: any[] = await membersRes.json();
    const addresses: any[] = await addressesRes.json();

    const memberMap = Object.fromEntries(members.map((m) => [m.id, m]));
    const addressMap = Object.fromEntries(addresses.map((a) => [a.member_id, a]));

    const orders = shipments
      .filter((s) => memberMap[s.member_id] && addressMap[s.member_id])
      .map((s) => {
        const m = memberMap[s.member_id];
        const a = addressMap[s.member_id];
        return {
          shipment_id: s.id,
          order_number: s.order_number ?? s.shipment_number ?? s.id.slice(0, 8).toUpperCase(),
          scheduled_ship_date: s.scheduled_ship_date,
          member_name: m.name,
          tier: m.tier ?? null,
          weight_oz: TIER_WEIGHT_OZ[m.tier ?? ''] ?? DEFAULT_WEIGHT_OZ,
          street: a.street,
          street2: a.street2 ?? '',
          city: a.city,
          state: a.state,
          zip: a.zip,
        };
      });

    const missing = shipments
      .filter((s) => !addressMap[s.member_id])
      .map((s) => ({
        shipment_id: s.id,
        order_number: s.order_number ?? s.shipment_number,
        member_name: memberMap[s.member_id]?.name ?? 'Unknown',
      }));

    return { orders, missing, ship_date: nextShipDate };
  }),

  // ─── Import Tracking Numbers from Pirateship ──────────────────────────────

  importTracking: publicProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            order_number: z.string(),
            tracking_number: z.string(),
            carrier: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const outboundResults: { order_number: string; tracking_number: string; shipment_id: string | null; success: boolean; error?: string }[] = [];
      const returnResults: { order_number: string; tracking_number: string; return_id: string | null; success: boolean; error?: string; easypost_registered?: boolean }[] = [];

      for (const row of input.rows) {
        const isReturn = row.order_number.endsWith('-RET');

        if (isReturn) {
          // ── Return label row ──────────────────────────────────────────────
          // Strip -RET to get the base order number, find the shipment, then the return
          const baseOrderNumber = row.order_number.replace(/-RET$/, '');

          const shipRes = await sbFetch(
            `/shipments?or=(order_number.eq.${encodeURIComponent(baseOrderNumber)},shipment_number.eq.${encodeURIComponent(baseOrderNumber)})&limit=1&select=id,member_id`
          );
          const [shipment] = await shipRes.json();

          if (!shipment) {
            returnResults.push({ order_number: row.order_number, tracking_number: row.tracking_number, return_id: null, success: false, error: 'No matching shipment found for return' });
            continue;
          }

          // Find the pending return for this member
          const returnRes = await sbFetch(
            `/returns?member_id=eq.${shipment.member_id}&status=eq.requested&order=created_at.desc&limit=1&select=id`
          );
          const [returnRecord] = await returnRes.json();

          if (!returnRecord) {
            returnResults.push({ order_number: row.order_number, tracking_number: row.tracking_number, return_id: null, success: false, error: 'No pending return found for this member' });
            continue;
          }

          // Save tracking number to return record
          const patch = await sbFetch(`/returns?id=eq.${returnRecord.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              return_tracking_number: row.tracking_number,
              updated_at: new Date().toISOString(),
            }),
            headers: { Prefer: 'return=minimal' },
          });

          if (!patch.ok) {
            returnResults.push({ order_number: row.order_number, tracking_number: row.tracking_number, return_id: returnRecord.id, success: false, error: 'Failed to save return tracking number' });
            continue;
          }

          // Register with EasyPost for tracking webhook
          const epRegistered = await registerEasyPostTracking(row.tracking_number);

          returnResults.push({
            order_number: row.order_number,
            tracking_number: row.tracking_number,
            return_id: returnRecord.id,
            success: true,
            easypost_registered: epRegistered,
          });

        } else {
          // ── Outbound shipment row ─────────────────────────────────────────
          const res = await sbFetch(
            `/shipments?or=(order_number.eq.${encodeURIComponent(row.order_number)},shipment_number.eq.${encodeURIComponent(row.order_number)})&limit=1&select=id,status`
          );
          const [shipment] = await res.json();

          if (!shipment) {
            outboundResults.push({ order_number: row.order_number, tracking_number: row.tracking_number, shipment_id: null, success: false, error: 'No matching shipment found' });
            continue;
          }

          const patch = await sbFetch(`/shipments?id=eq.${shipment.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              tracking_number: row.tracking_number,
              carrier: row.carrier ?? 'USPS',
              status: 'shipped',
              actual_ship_date: new Date().toISOString().split('T')[0],
              updated_at: new Date().toISOString(),
            }),
            headers: { Prefer: 'return=minimal' },
          });

          if (!patch.ok) {
            outboundResults.push({ order_number: row.order_number, tracking_number: row.tracking_number, shipment_id: shipment.id, success: false, error: 'Failed to update shipment' });
            continue;
          }

          outboundResults.push({ order_number: row.order_number, tracking_number: row.tracking_number, shipment_id: shipment.id, success: true });
        }
      }

      return {
        succeeded: outboundResults.filter((r) => r.success).length + returnResults.filter((r) => r.success).length,
        failed: outboundResults.filter((r) => !r.success).length + returnResults.filter((r) => !r.success).length,
        outbound: outboundResults,
        returns: returnResults,
      };
    }),
});