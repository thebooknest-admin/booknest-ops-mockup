import { LABEL_STATUSES, formatInventoryLocation, normalizeShelvingSection } from "@shared/booknest";
import { sbFetch, sbJson, sbVoid } from "../../../supabase";

function mapQueueCopy(c: any) {
  return {
    id: c.id as string,
    sku: c.sku as string,
    isbn: c.isbn as string | null,
    age_group: c.age_group as string,
    bin_id: c.bin_id as string,
    section: c.section as string | null,
    location: formatInventoryLocation(c.bin_id, c.section),
    status: c.status as string,
    condition: c.condition as string | null,
    received_at: c.received_at as string,
    book_title_id: c.book_title_id as string,
    book_title: c.book_titles as { id: string; title: string; author: string; cover_url: string | null } | null,
  };
}

export async function getQcQueue() {
  const data = await sbJson<any[]>(
    "/book_copies?status=eq.pending_qc&select=id,sku,isbn,age_group,bin_id,section,status,condition,received_at,book_title_id,book_titles(id,title,author,cover_url)&order=received_at.asc&limit=1000"
  );
  return data.map(mapQueueCopy);
}

export async function getQcCount() {
  const res = await sbFetch("/book_copies?status=eq.pending_qc&select=id", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return { count: parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10) };
}

export async function passQc(input: any) {
  const nextStatus = input.reprint_label ? "pending_label" : "pending_stock";
  await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: nextStatus,
      condition: input.condition,
      qc_notes: input.notes ?? null,
      qc_passed_at: new Date().toISOString(),
      label_status: input.reprint_label ? LABEL_STATUSES.pending : LABEL_STATUSES.printed,
    }),
    headers: { Prefer: "return=minimal" },
  });
  return { success: true, next_status: nextStatus };
}

export async function failQc(input: any) {
  await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "donated_lfl",
      label_status: LABEL_STATUSES.notRequired,
      qc_notes: input.notes ?? null,
      qc_failed_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  });
  return { success: true };
}

export async function passAllQc(input: { copy_ids: string[] }) {
  if (input.copy_ids.length === 0) return { success: true, count: 0 };
  const now = new Date().toISOString();
  await sbVoid(`/book_copies?id=in.(${input.copy_ids.join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ status: "pending_label", label_status: LABEL_STATUSES.pending, condition: "good", qc_passed_at: now, updated_at: now }),
    headers: { Prefer: "return=minimal" },
  });
  return { success: true, count: input.copy_ids.length };
}

export async function getStockQueue() {
  const data = await sbJson<any[]>(
    "/book_copies?status=eq.pending_stock&select=id,sku,isbn,age_group,bin_id,section,status,condition,received_at,book_title_id,book_titles(id,title,author,cover_url)&order=received_at.asc&limit=1000"
  );
  return data.map(mapQueueCopy);
}

export async function getStockCount() {
  const res = await sbFetch("/book_copies?status=eq.pending_stock&select=id", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  return { count: parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10) };
}

export async function getStockBins() {
  const copies = await sbJson<{ bin_id: string | null; section: string | null }[]>(
    "/book_copies?bin_id=not.is.null&status=in.(in_house,pending_stock,pending_label,pending_qc)&select=bin_id,section&limit=5000"
  );
  return Array.from(new Set(copies.map(copy => formatInventoryLocation(copy.bin_id, copy.section)).filter((binId): binId is string => Boolean(binId)))).sort((a, b) => a.localeCompare(b));
}

export async function confirmStockPlaced(input: any) {
  await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "in_house",
      stocked_at: new Date().toISOString(),
      ...(input.bin_id ? { bin_id: input.bin_id } : {}),
      ...(input.section !== undefined ? { section: normalizeShelvingSection(input.section) } : {}),
    }),
    headers: { Prefer: "return=minimal" },
  });
  return { success: true };
}

export async function confirmAllStockPlaced(input: { copy_ids: string[] }) {
  if (input.copy_ids.length === 0) return { success: true, count: 0 };
  const now = new Date().toISOString();
  await sbVoid(`/book_copies?id=in.(${input.copy_ids.join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({ status: "in_house", stocked_at: now }),
    headers: { Prefer: "return=minimal" },
  });
  return { success: true, count: input.copy_ids.length };
}