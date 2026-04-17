/**
 * Shipping Router — EasyPost label generation
 *
 * Return label flow:
 * 1. shipping.pendingSwaps      → list swap returns needing a label
 * 2. shipping.generateLabel     → generate return label for one swap
 * 3. shipping.generateAllLabels → batch generate return labels
 *
 * Outbound label flow:
 * 4. shipping.generateOutboundLabel     → generate label for one packed shipment
 * 5. shipping.generateAllOutboundLabels → bulk generate labels for all packed shipments
 */

import EasyPost from '@easypost/api';
import {z} from 'zod';
import {publicProcedure, router} from '../_core/trpc';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const EASYPOST_API_KEY = process.env.EASYPOST_API_KEY!;

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sbFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {...sbHeaders, ...(options.headers ?? {})},
  });
}

const BOOK_NEST_ADDRESS = {
  company: 'The Book Nest',
  street1: '205 Ambrose Drive',
  street2: '#8',
  city: 'Ranson',
  state: 'WV',
  zip: '25438',
  country: 'US',
};

const RETURN_PARCEL = {
  length: 13,
  width: 11,
  height: 4,
  weight: 32, // oz
};

// Outbound parcel — 11x14 mailer, weight estimated by tier
const OUTBOUND_PARCEL_BASE = {
  length: 14,
  width: 11,
  height: 3,
};

const TIER_WEIGHT_OZ: Record<string, number> = {
  'little-nest': 32,  // ~2 lbs  (4 books)
  'cozy-nest':   48,  // ~3 lbs  (6 books)
  'story-nest':  64,  // ~4 lbs  (8 books)
  little_nest:   32,
  cozy_nest:     48,
  story_nest:    64,
};
const DEFAULT_WEIGHT_OZ = 40;

function getOutboundParcel(tier: string | null) {
  return {
    ...OUTBOUND_PARCEL_BASE,
    weight: TIER_WEIGHT_OZ[tier ?? ''] ?? DEFAULT_WEIGHT_OZ,
  };
}

export const shippingRouter = router({
  // ─── Return Labels ────────────────────────────────────────────────────────

  pendingSwaps: publicProcedure.query(async () => {
    const returnsRes = await sbFetch(
      `/returns?status=eq.requested&return_label_url=is.null&select=id,member_id,original_shipment_id,created_at&order=created_at.asc&limit=100`,
    );
    const returns: any[] = await returnsRes.json();

    if (!returns.length) return {pending: []};

    const memberIds = [...new Set(returns.map((r) => r.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(`/members?id=in.(${memberIds.join(',')})&select=id,name,email&limit=200`),
      sbFetch(`/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`),
    ]);

    const members: any[] = await membersRes.json();
    const addresses: any[] = await addressesRes.json();

    const memberMap: Record<string, any> = {};
    for (const m of members) memberMap[m.id] = m;

    const addressMap: Record<string, any> = {};
    for (const a of addresses) addressMap[a.member_id] = a;

    const pending = returns.map((r) => ({
      return_id: r.id,
      member_id: r.member_id,
      member_name: memberMap[r.member_id]?.name ?? 'Unknown',
      member_email: memberMap[r.member_id]?.email ?? '',
      address: addressMap[r.member_id] ?? null,
      original_shipment_id: r.original_shipment_id,
      created_at: r.created_at,
    }));

    return {pending};
  }),

  generateLabel: publicProcedure
    .input(
      z.object({
        return_id: z.string(),
        member_name: z.string(),
        street: z.string(),
        street2: z.string().optional(),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
      }),
    )
    .mutation(async ({input}) => {
      const client = new EasyPost(EASYPOST_API_KEY);

      try {
        const shipment = await client.Shipment.create({
          from_address: {
            name: input.member_name,
            street1: input.street,
            street2: input.street2 || undefined,
            city: input.city,
            state: input.state,
            zip: input.zip,
            country: 'US',
          },
          to_address: BOOK_NEST_ADDRESS,
          parcel: RETURN_PARCEL,
        });

        const bought = await client.Shipment.buy(
          shipment.id,
          shipment.lowestRate(['USPS'], ['Media Mail']),
        );

        const labelUrl = bought.postage_label?.label_url ?? null;
        const trackingNumber = bought.tracking_code ?? null;
        const shippingCost = Number(bought.selected_rate?.rate ?? 0);

        await sbFetch(`/returns?id=eq.${input.return_id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            return_label_url: labelUrl,
            return_tracking_number: trackingNumber,
            return_label_generated_at: new Date().toISOString(),
            shipping_cost: shippingCost,
            status: 'label_generated',
            updated_at: new Date().toISOString(),
          }),
          headers: {Prefer: 'return=minimal'},
        });

        return {success: true, return_id: input.return_id, label_url: labelUrl, tracking_number: trackingNumber, shipping_cost: shippingCost};
      } catch (e: any) {
        console.error('EasyPost return label failed:', e);
        return {success: false, error: e?.message ?? 'Label generation failed'};
      }
    }),

  generateAllLabels: publicProcedure.mutation(async () => {
    const returnsRes = await sbFetch(
      `/returns?status=eq.requested&return_label_url=is.null&select=id,member_id&order=created_at.asc&limit=50`,
    );
    const returns: any[] = await returnsRes.json();

    if (!returns.length) return {processed: 0, failed: 0, results: []};

    const memberIds = [...new Set(returns.map((r) => r.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(`/members?id=in.(${memberIds.join(',')})&select=id,name&limit=200`),
      sbFetch(`/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`),
    ]);

    const members: any[] = await membersRes.json();
    const addresses: any[] = await addressesRes.json();

    const memberMap: Record<string, any> = {};
    for (const m of members) memberMap[m.id] = m;

    const addressMap: Record<string, any> = {};
    for (const a of addresses) addressMap[a.member_id] = a;

    const client = new EasyPost(EASYPOST_API_KEY);
    const results: any[] = [];
    let processed = 0;
    let failed = 0;

    for (const r of returns) {
      const address = addressMap[r.member_id];
      const member = memberMap[r.member_id];

      if (!address || !member) {
        failed++;
        results.push({return_id: r.id, success: false, error: 'No address found'});
        continue;
      }

      try {
        const shipment = await client.Shipment.create({
          from_address: {name: member.name, street1: address.street, street2: address.street2 || undefined, city: address.city, state: address.state, zip: address.zip, country: 'US'},
          to_address: BOOK_NEST_ADDRESS,
          parcel: RETURN_PARCEL,
        });

        const bought = await client.Shipment.buy(shipment.id, shipment.lowestRate(['USPS'], ['Media Mail']));

        const labelUrl = bought.postage_label?.label_url ?? null;
        const trackingNumber = bought.tracking_code ?? null;
        const shippingCost = Number(bought.selected_rate?.rate ?? 0);

        await sbFetch(`/returns?id=eq.${r.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            return_label_url: labelUrl,
            return_tracking_number: trackingNumber,
            return_label_generated_at: new Date().toISOString(),
            shipping_cost: shippingCost,
            status: 'label_generated',
            updated_at: new Date().toISOString(),
          }),
          headers: {Prefer: 'return=minimal'},
        });

        processed++;
        results.push({return_id: r.id, success: true, label_url: labelUrl, tracking_number: trackingNumber});
      } catch (e: any) {
        failed++;
        results.push({return_id: r.id, success: false, error: e?.message ?? 'Unknown error'});
      }
    }

    return {processed, failed, results};
  }),

  // ─── Outbound Labels ──────────────────────────────────────────────────────

  /**
   * Generates an outbound shipping label for a single packed shipment.
   * Saves label_url + tracking_number to the shipment row.
   * Does NOT mark as shipped — you still confirm via ShipBundlePage.
   */
  generateOutboundLabel: publicProcedure
    .input(z.object({ shipment_id: z.string() }))
    .mutation(async ({input}) => {
      // Fetch shipment + member + address
      const shipmentRes = await sbFetch(
        `/shipments?id=eq.${input.shipment_id}&select=id,member_id,label_url,tracking_number&limit=1`
      );
      const [shipment] = await shipmentRes.json();
      if (!shipment) return {success: false, error: 'Shipment not found'};

      // Already has a label — return existing
      if (shipment.label_url) {
        return {success: true, shipment_id: input.shipment_id, label_url: shipment.label_url, tracking_number: shipment.tracking_number, already_existed: true};
      }

      const [memberRes, addressRes] = await Promise.all([
        sbFetch(`/members?id=eq.${shipment.member_id}&select=id,name,tier&limit=1`),
        sbFetch(`/member_addresses?member_id=eq.${shipment.member_id}&is_default=eq.true&select=street,street2,city,state,zip&limit=1`),
      ]);

      const [member] = await memberRes.json();
      const [address] = await addressRes.json();

      if (!address) return {success: false, error: 'No shipping address on file for this member'};

      const client = new EasyPost(EASYPOST_API_KEY);

      try {
        const ep = await client.Shipment.create({
          from_address: BOOK_NEST_ADDRESS,
          to_address: {
            name: member?.name ?? 'Book Nest Member',
            street1: address.street,
            street2: address.street2 || undefined,
            city: address.city,
            state: address.state,
            zip: address.zip,
            country: 'US',
          },
          parcel: getOutboundParcel(member?.tier ?? null),
        });

        const bought = await client.Shipment.buy(
          ep.id,
          ep.lowestRate(),
        );

        const labelUrl = bought.postage_label?.label_url ?? null;
        const trackingNumber = bought.tracking_code ?? null;
        const shippingCost = Number(bought.selected_rate?.rate ?? 0);
        const carrier = bought.selected_rate?.carrier ?? null;
        const service = bought.selected_rate?.service ?? null;

        await sbFetch(`/shipments?id=eq.${input.shipment_id}`, {
  method: 'PATCH',
  body: JSON.stringify({
    label_url: labelUrl,
    tracking_number: trackingNumber,
    carrier: carrier,
    updated_at: new Date().toISOString(),
  }),
  headers: {Prefer: 'return=minimal'},
});

        return {
          success: true,
          shipment_id: input.shipment_id,
          label_url: labelUrl,
          tracking_number: trackingNumber,
          carrier,
          service,
          shipping_cost: shippingCost,
          already_existed: false,
        };
      } catch (e: any) {
        console.error('EasyPost outbound label failed:', e);
        return {success: false, error: e?.message ?? 'Label generation failed'};
      }
    }),

  /**
   * Bulk generates outbound labels for all packed shipments.
   * Skips any that already have a label_url.
   * Opens all labels in a print-ready batch URL at the end.
   */
  generateAllOutboundLabels: publicProcedure.mutation(async () => {
    // Get all packed outbound shipments without a label
    const shipmentsRes = await sbFetch(
      `/shipments?status=eq.packed&shipment_type=eq.outbound&label_url=is.null&select=id,member_id&order=scheduled_ship_date.asc&limit=50`
    );
    const shipments: any[] = await shipmentsRes.json();

    if (!shipments.length) return {processed: 0, failed: 0, skipped: 0, results: [], label_urls: []};

    const memberIds = [...new Set(shipments.map((s) => s.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(`/members?id=in.(${memberIds.join(',')})&select=id,name,tier&limit=200`),
      sbFetch(`/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`),
    ]);

    const members: any[] = await membersRes.json();
    const addresses: any[] = await addressesRes.json();

    const memberMap: Record<string, any> = {};
    for (const m of members) memberMap[m.id] = m;

    const addressMap: Record<string, any> = {};
    for (const a of addresses) addressMap[a.member_id] = a;

    const client = new EasyPost(EASYPOST_API_KEY);
    const results: any[] = [];
    const labelUrls: string[] = [];
    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const s of shipments) {
      const member = memberMap[s.member_id];
      const address = addressMap[s.member_id];

      if (!address) {
        failed++;
        results.push({shipment_id: s.id, success: false, error: 'No address on file'});
        continue;
      }

      try {
        const ep = await client.Shipment.create({
          from_address: BOOK_NEST_ADDRESS,
          to_address: {
            name: member?.name ?? 'Book Nest Member',
            street1: address.street,
            street2: address.street2 || undefined,
            city: address.city,
            state: address.state,
            zip: address.zip,
            country: 'US',
          },
          parcel: getOutboundParcel(member?.tier ?? null),
        });

        const bought = await client.Shipment.buy(ep.id, ep.lowestRate());

        const labelUrl = bought.postage_label?.label_url ?? null;
        const trackingNumber = bought.tracking_code ?? null;
        const shippingCost = Number(bought.selected_rate?.rate ?? 0);
        const carrier = bought.selected_rate?.carrier ?? null;

        await sbFetch(`/shipments?id=eq.${s.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            label_url: labelUrl,
            tracking_number: trackingNumber,
            carrier,
            updated_at: new Date().toISOString(),
          }),
          headers: {Prefer: 'return=minimal'},
        });

        if (labelUrl) labelUrls.push(labelUrl);
        processed++;
        results.push({shipment_id: s.id, success: true, label_url: labelUrl, tracking_number: trackingNumber, shipping_cost: shippingCost});
      } catch (e: any) {
        failed++;
        results.push({shipment_id: s.id, success: false, error: e?.message ?? 'Unknown error'});
      }
    }

    return {processed, failed, skipped, results, label_urls: labelUrls};
  }),
});