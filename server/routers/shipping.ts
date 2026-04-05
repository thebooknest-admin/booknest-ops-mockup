/**
 * Shipping Router — EasyPost label generation for swap returns
 *
 * Workflow:
 * 1. shipping.pendingSwaps    → list all returns with status 'requested' and no label yet
 * 2. shipping.generateLabel   → generate a return label for a specific return record
 * 3. shipping.generateAllLabels → batch generate labels for all pending swaps
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
  weight: 32,
};

export const shippingRouter = router({
  /**
   * Returns all swap return requests that don't have a label yet.
   */
  pendingSwaps: publicProcedure.query(async () => {
    const returnsRes = await sbFetch(
      `/returns?status=eq.requested&return_label_url=is.null&select=id,member_id,original_shipment_id,created_at&order=created_at.asc&limit=100`,
    );
    const returns: any[] = await returnsRes.json();

    if (!returns.length) return {pending: []};

    const memberIds = [...new Set(returns.map((r) => r.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(
        `/members?id=in.(${memberIds.join(',')})&select=id,name,email&limit=200`,
      ),
      sbFetch(
        `/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`,
      ),
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

  /**
   * Generates a return label for a specific return record.
   */
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

        return {
          success: true,
          return_id: input.return_id,
          label_url: labelUrl,
          tracking_number: trackingNumber,
          shipping_cost: shippingCost,
        };
      } catch (e: any) {
        console.error('EasyPost label generation failed:', e);
        return {
          success: false,
          error: e?.message ?? 'Label generation failed',
        };
      }
    }),

  /**
   * Batch generates labels for all pending swaps that have a valid address.
   */
  generateAllLabels: publicProcedure.mutation(async () => {
    const returnsRes = await sbFetch(
      `/returns?status=eq.requested&return_label_url=is.null&select=id,member_id&order=created_at.asc&limit=50`,
    );
    const returns: any[] = await returnsRes.json();

    if (!returns.length) return {processed: 0, failed: 0, results: []};

    const memberIds = [...new Set(returns.map((r) => r.member_id))];

    const [membersRes, addressesRes] = await Promise.all([
      sbFetch(
        `/members?id=in.(${memberIds.join(',')})&select=id,name&limit=200`,
      ),
      sbFetch(
        `/member_addresses?member_id=in.(${memberIds.join(',')})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=200`,
      ),
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
          from_address: {
            name: member.name,
            street1: address.street,
            street2: address.street2 || undefined,
            city: address.city,
            state: address.state,
            zip: address.zip,
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
        results.push({
          return_id: r.id,
          success: true,
          label_url: labelUrl,
          tracking_number: trackingNumber,
        });
      } catch (e: any) {
        failed++;
        results.push({
          return_id: r.id,
          success: false,
          error: e?.message ?? 'Unknown error',
        });
      }
    }

    return {processed, failed, results};
  }),
});