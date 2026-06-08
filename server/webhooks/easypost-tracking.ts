/**
 * EasyPost Tracking Webhook Handler
 * URL: https://booknest-ops-mockup-production.up.railway.app/webhooks/easypost-tracking
 */

import type {Request, Response} from 'express';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function sbFetch(path: string, options: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {...sbHeaders, ...(options.headers ?? {})},
  });
}

function nextUnusedNumber(
  existingValues: Array<string | null>,
  prefix: string,
  start: number,
  width: number
): string {
  const used = new Set(existingValues.filter(Boolean));
  let next = start;
  let candidate = '';
  do {
    candidate = `${prefix}${String(next).padStart(width, '0')}`;
    next++;
  } while (used.has(candidate));
  return candidate;
}

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

const ACCEPTED_STATUSES = new Set(['pre_transit', 'in_transit', 'out_for_delivery']);

export async function easypostTrackingWebhook(req: Request, res: Response) {
  try {
    const event = req.body;

    if (event?.description !== 'tracker.updated') {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const tracker = event?.result;
    const trackingNumber: string | undefined = tracker?.tracking_code;
    const status: string | undefined = tracker?.status;

    if (!trackingNumber || !status || !ACCEPTED_STATUSES.has(status)) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const returnRes = await sbFetch(
      `/returns?return_tracking_number=eq.${encodeURIComponent(trackingNumber)}&select=id,member_id,status&limit=1`
    );
    const returnData: any[] = await returnRes.json();
    const returnRecord = returnData[0];

    if (!returnRecord || returnRecord.status !== 'requested') {
      return res.status(200).json({ ok: true, skipped: true });
    }

    await sbFetch(`/returns?id=eq.${returnRecord.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_transit', updated_at: new Date().toISOString() }),
      headers: { Prefer: 'return=minimal' },
    });

    // Check if next shipment already exists
    const existingRes = await sbFetch(
      `/shipments?member_id=eq.${returnRecord.member_id}&status=in.(picking,packing,packed)&limit=1&select=id`
    );
    const existingData: any[] = await existingRes.json();

    if (existingData[0]) {
      return res.status(200).json({ ok: true, return_updated: true, shipment_created: false });
    }

    // Count shipments for number generation
    const countRes = await sbFetch('/shipments?select=id', {
      headers: { Prefer: 'count=exact', Range: '0-0' },
    });
    const total = parseInt(countRes.headers.get('content-range')?.split('/')[1] ?? '0', 10);
    const numbersRes = await sbFetch('/shipments?select=shipment_number,order_number&limit=10000');
    const existingNumbers: { shipment_number: string | null; order_number: string | null }[] =
      numbersRes.ok ? await numbersRes.json() : [];
    const shipmentNumber = nextUnusedNumber(
      existingNumbers.map(row => row.shipment_number),
      'SHP-',
      total + 1,
      6
    );
    const orderNumber = nextUnusedNumber(
      existingNumbers.map(row => row.order_number),
      'BN-',
      total + 1001,
      4
    );
    const nextShipDate = getNextShipDate();

    await sbFetch('/shipments', {
      method: 'POST',
      body: JSON.stringify({
        member_id: returnRecord.member_id,
        status: 'picking',
        shipment_type: 'outbound',
        shipment_number: shipmentNumber,
        order_number: orderNumber,
        scheduled_ship_date: nextShipDate,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });

    console.log(`[EasyPost webhook] ✅ Return in_transit, new shipment created for member ${returnRecord.member_id}`);
    return res.status(200).json({ ok: true, return_updated: true, shipment_created: true, ship_date: nextShipDate });

  } catch (e) {
    console.error('[EasyPost webhook] Error:', e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
