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

    return res.status(200).json({ ok: true, return_updated: true, shipment_created: false });

  } catch (e) {
    console.error('[EasyPost webhook] Error:', e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
