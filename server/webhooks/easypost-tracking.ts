/**
 * EasyPost Tracking Webhook Handler
 * URL: https://booknest-ops-mockup-production.up.railway.app/webhooks/easypost-tracking
 */

import type { Request, Response } from 'express';
import { assertSupabaseResponse, getSupabaseRestConfig } from '../supabase';

async function sbFetch(path: string, options: RequestInit = {}) {
  const config = getSupabaseRestConfig();
  return fetch(`${config.url}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
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

    const returnPath = `/returns?return_tracking_number=eq.${encodeURIComponent(trackingNumber)}&select=id,member_id,status&limit=1`;
    const returnRes = await sbFetch(returnPath);
    await assertSupabaseResponse(returnRes, returnPath);
    const returnData: any[] = await returnRes.json();
    const returnRecord = returnData[0];

    if (!returnRecord || returnRecord.status !== 'requested') {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const updatePath = `/returns?id=eq.${returnRecord.id}`;
    const updateRes = await sbFetch(updatePath, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_transit', updated_at: new Date().toISOString() }),
      headers: { Prefer: 'return=minimal' },
    });
    await assertSupabaseResponse(updateRes, updatePath);

    return res.status(200).json({ ok: true, return_updated: true, shipment_created: false });

  } catch (e) {
    console.error('[EasyPost webhook] Error:', e);
    return res.status(200).json({ ok: false, error: String(e) });
  }
}
