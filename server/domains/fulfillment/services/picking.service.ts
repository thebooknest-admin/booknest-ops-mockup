import { formatInventoryLocation } from "@shared/booknest";
import { sbFetch, sbJson, sbVoid } from "../../../supabase";
import { isSeasonalBookAllowed } from "./book-selection";
import type { SelectionMetadata } from "./book-selection";

export type ShipmentPickListInput = {
  shipment_id: string;
};

export type SwapShipmentBookInput = {
  shipment_id: string;
  member_id: string;
  old_book_copy_id: string;
  books_needed: number;
};

type ShipmentBookMetadataRow = {
  id: string;
  book_copy_id: string | null;
  book_title_id: string | null;
  selection_metadata?: SelectionMetadata | null;
};

function findSelectionMetadata(
  row: any,
  metadataRows: ShipmentBookMetadataRow[]
): SelectionMetadata | null {
  const byId = metadataRows.find(metadata => metadata.id && row.id && metadata.id === row.id);
  const byCopy = metadataRows.find(metadata => metadata.book_copy_id && metadata.book_copy_id === row.book_copy_id);
  const byTitle = metadataRows.find(metadata => metadata.book_title_id && metadata.book_title_id === row.book_title_id);
  return byId?.selection_metadata ?? byCopy?.selection_metadata ?? byTitle?.selection_metadata ?? null;
}

function buildSwapSelectionMetadata(
  replacement: any,
  previousSelectionMetadata: SelectionMetadata | null | undefined
) {
  return {
    engine_version: "book-selection-v2-swap",
    policy_version: "2026-06-selection-v2",
    selected_at: new Date().toISOString(),
    final_score: typeof replacement.match_score === "number" ? replacement.match_score : 0,
    score_breakdown: {
      swap_candidate_score: typeof replacement.match_score === "number" ? replacement.match_score : 0,
    },
    explanation_codes: [],
    explanation_labels: [],
    explanations: [],
    author_diversity_adjustment: 0,
    theme_diversity_adjustment: 0,
    series_continuation: {
      series_key: null,
      series_label: null,
      book_number: null,
      continued_existing_series: false,
    },
    series_order_validation: {
      checked: false,
      valid: true,
      detail: null,
    },
    reading_progression_adjustment: 0,
    inventory_health_adjustment: 0,
    pippas_surprise: false,
    source: "swap",
    previous_selection_metadata: previousSelectionMetadata ?? null,
  };
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

  const copyMap = new Map<string, { id: string; bin_id: string | null; section: string | null }>();
  if (copyIds.length > 0) {
    const copyRows = await sbJson<
      { id: string; bin_id: string | null; section: string | null }[]
    >(
      `/book_copies?id=in.(${copyIds.join(",")})&select=id,bin_id,section&limit=200`
    );
    for (const copy of copyRows) copyMap.set(copy.id, copy);
  }

  const metadataRows = await sbJson<ShipmentBookMetadataRow[]>(
    `/shipment_books?shipment_id=eq.${input.shipment_id}&select=id,book_copy_id,book_title_id,selection_metadata&limit=200`
  );

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
      selection_metadata: findSelectionMetadata(row, metadataRows),
    };
  });
}

export async function swapShipmentBook(input: SwapShipmentBookInput): Promise<any> {
  const assignedRows = await sbJson<
    { id: string; book_copy_id: string | null; book_title_id: string | null; selection_metadata?: SelectionMetadata | null }[]
  >(
    `/shipment_books?shipment_id=eq.${input.shipment_id}&select=id,book_copy_id,book_title_id,selection_metadata&limit=100`
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
      isSeasonalBookAllowed({ title: book.title })
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
        selection_metadata: buildSwapSelectionMetadata(replacement, oldShipmentBook.selection_metadata),
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