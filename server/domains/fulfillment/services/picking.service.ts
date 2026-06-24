import { formatInventoryLocation } from "@shared/booknest";
import { sbFetch, sbJson, sbVoid } from "../../../supabase";

export type ShipmentPickListInput = {
  shipment_id: string;
};

export type SwapShipmentBookInput = {
  shipment_id: string;
  member_id: string;
  old_book_copy_id: string;
  books_needed: number;
};

type HolidayWindow = {
  keywords: string[];
  month: number;
  day: number;
  beforeDays: number;
  afterDays: number;
};

const HOLIDAY_WINDOWS: HolidayWindow[] = [
  { keywords: ["christmas", "santa", "reindeer", "nativity", "noel"], month: 12, day: 25, beforeDays: 45, afterDays: 7 },
  { keywords: ["halloween", "trick", "pumpkin", "ghost", "spooky"], month: 10, day: 31, beforeDays: 45, afterDays: 3 },
  { keywords: ["thanksgiving", "turkey", "pilgrim"], month: 11, day: 26, beforeDays: 28, afterDays: 3 },
  { keywords: ["easter", "bunny", "egg hunt"], month: 4, day: 5, beforeDays: 35, afterDays: 7 },
  { keywords: ["valentine", "valentine's day"], month: 2, day: 14, beforeDays: 28, afterDays: 3 },
];

function daysBetweenDates(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aUtc - bUtc) / 86_400_000);
}

function isDateInHolidayWindow(date: Date, window: HolidayWindow): boolean {
  for (const year of [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1]) {
    const holiday = new Date(year, window.month - 1, window.day);
    const delta = daysBetweenDates(date, holiday);
    if (delta >= -window.beforeDays && delta <= window.afterDays) return true;
  }
  return false;
}

function isSeasonalBookAllowed(title: string | null | undefined): boolean {
  const normalizedTitle = String(title ?? "").toLowerCase();
  const matchedWindow = HOLIDAY_WINDOWS.find(window =>
    window.keywords.some(keyword => normalizedTitle.includes(keyword))
  );
  if (!matchedWindow) return true;
  return isDateInHolidayWindow(new Date(), matchedWindow);
}

export async function getShipmentPickList(input: ShipmentPickListInput): Promise<any[]> {
  const res = await sbFetch(`/rpc/get_shipment_pick_list`, {
    method: "POST",
    body: JSON.stringify({
      p_shipment_id: input.shipment_id,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get shipment pick list: ${await res.text()}`);
  }

  const rows: any[] = await res.json();
  const copyIds = Array.from(
    new Set(rows.map(row => row.book_copy_id).filter(Boolean))
  );
  if (copyIds.length === 0) return rows;

  const copyRows = await sbJson<
    { id: string; bin_id: string | null; section: string | null }[]
  >(
    `/book_copies?id=in.(${copyIds.join(",")})&select=id,bin_id,section&limit=200`
  );
  const copyMap = new Map(copyRows.map(copy => [copy.id, copy]));

  return rows.map(row => {
    const copy = copyMap.get(row.book_copy_id);
    const location = formatInventoryLocation(
      copy?.bin_id ?? row.bin_id,
      copy?.section
    );
    return {
      ...row,
      bin_id: location ?? row.bin_id,
      section: copy?.section ?? null,
      location,
    };
  });
}

export async function swapShipmentBook(input: SwapShipmentBookInput): Promise<any> {
  const assignedRows = await sbJson<
    { id: string; book_copy_id: string | null; book_title_id: string | null }[]
  >(
    `/shipment_books?shipment_id=eq.${input.shipment_id}&select=id,book_copy_id,book_title_id&limit=100`
  );
  const assignedCopyIds = new Set(
    assignedRows.map((row) => row.book_copy_id).filter(Boolean)
  );
  const oldShipmentBook = assignedRows.find(
    (row) => row.book_copy_id === input.old_book_copy_id
  );

  if (!oldShipmentBook) {
    throw new Error("The selected book is no longer assigned to this shipment.");
  }

  const candidateRes = await sbFetch(`/rpc/select_books_for_shipment`, {
    method: "POST",
    body: JSON.stringify({
      p_member_id: input.member_id,
      p_shipment_id: input.shipment_id,
      p_books_needed: input.books_needed,
    }),
  });

  if (!candidateRes.ok) {
    throw new Error(`Failed to select alternate book: ${await candidateRes.text()}`);
  }

  const candidates: any[] = await candidateRes.json();
  const replacement = candidates.find((book) => {
    return (
      book.book_copy_id &&
      !assignedCopyIds.has(book.book_copy_id) &&
      isSeasonalBookAllowed(book.title)
    );
  });

  if (!replacement) {
    throw new Error("No alternate book found.");
  }

  const patchRes = await sbFetch(
    `/shipment_books?id=eq.${oldShipmentBook.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        book_copy_id: replacement.book_copy_id,
        book_title_id: replacement.book_title_id,
        status: "ready_for_picking",
        match_score: replacement.match_score,
        picked_at: null,
        scanned_at: null,
      }),
      headers: { Prefer: "return=representation" },
    }
  );

  if (!patchRes.ok) {
    throw new Error(`Failed to swap shipment book: ${await patchRes.text()}`);
  }

  const [updated] = await patchRes.json();

  await sbVoid(`/book_copies?id=eq.${input.old_book_copy_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "in_house",
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  });

  await sbVoid(`/book_copies?id=eq.${replacement.book_copy_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  });

  await sbVoid(`/shipment_book_swaps`, {
    method: "POST",
    body: JSON.stringify({
      shipment_id: input.shipment_id,
      old_book_copy_id: input.old_book_copy_id,
      old_book_title_id: oldShipmentBook.book_title_id,
      new_book_copy_id: replacement.book_copy_id,
      new_book_title_id: replacement.book_title_id,
      reason: "Manual picker swap",
    }),
    headers: { Prefer: "return=minimal" },
  });

  return updated;
}