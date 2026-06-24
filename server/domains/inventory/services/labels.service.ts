import { LABEL_STATUSES, formatInventoryLocation } from "@shared/booknest";
import { sbJson, sbVoid } from "../../../supabase";

export async function getPendingLabels() {
  const copies = await sbJson<any[]>(
    "/book_copies?label_status=eq.pending&status=in.(in_house,pending_label)&select=id,sku,isbn,book_title_id,age_group,bin_id,section,label_status,received_at&limit=1000&order=received_at.asc"
  );
  const titleIds = Array.from(new Set(copies.map(c => c.book_title_id).filter(Boolean)));
  let titleMap: Record<string, { title: string; author: string; isbn: string | null; bin_theme: string | null }> = {};
  if (titleIds.length > 0) {
    const titles = await sbJson<{ id: string; title: string; author: string; isbn: string | null; bin_theme: string | null }[]>(
      `/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author,isbn,bin_theme&limit=1000`
    );
    titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
  }
  return copies.map(c => ({
    ...c,
    location: formatInventoryLocation(c.bin_id, c.section),
    isbn: (c.isbn ?? titleMap[c.book_title_id]?.isbn ?? null) as string | null,
    book_title: titleMap[c.book_title_id] ?? null,
  }));
}

export async function markLabelsPrinted(input: { ids: string[] }) {
  const now = new Date().toISOString();
  await sbVoid(`/book_copies?id=in.(${input.ids.join(",")})`, {
    method: "PATCH",
    body: JSON.stringify({
      label_status: LABEL_STATUSES.printed,
      label_printed_at: now,
      updated_at: now,
    }),
    headers: { Prefer: "return=minimal" },
  });
  await sbVoid(`/book_copies?id=in.(${input.ids.join(",")})&status=eq.pending_label`, {
    method: "PATCH",
    body: JSON.stringify({ status: "pending_stock", updated_at: now }),
    headers: { Prefer: "return=minimal" },
  });
  return { success: true };
}