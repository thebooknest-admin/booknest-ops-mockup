import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../supabase", () => ({
  sbFetch: vi.fn(),
  sbJson: vi.fn(),
  sbVoid: vi.fn(),
}));

import { sbFetch, sbJson, sbVoid } from "../../../supabase";
import { getShipmentPickList, swapShipmentBook } from "./picking.service";

const mockedSbFetch = vi.mocked(sbFetch);
const mockedSbJson = vi.mocked(sbJson);
const mockedSbVoid = vi.mocked(sbVoid);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getShipmentPickList", () => {
  it("preserves the RPC payload and pick-list enrichment", async () => {
    mockedSbFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ book_copy_id: "copy-1", bin_id: "LEGACY-BIN", extra: "value" }]), { status: 200 })
    );
    mockedSbJson
      .mockResolvedValueOnce([{ id: "copy-1", bin_id: "SOAR-ADV-01", section: "B" }])
      .mockResolvedValueOnce([{ id: "shipment-book-1", book_copy_id: "copy-1", book_title_id: "title-1", selection_metadata: { engine_version: "book-selection-v2" } }]);

    await expect(getShipmentPickList({ shipment_id: "shipment-1" })).resolves.toEqual([
      {
        book_copy_id: "copy-1",
        bin_id: "SOAR-ADV-B",
        section: "B",
        location: "SOAR-ADV-B",
        extra: "value",
        selection_metadata: { engine_version: "book-selection-v2" },
      },
    ]);
    expect(mockedSbFetch).toHaveBeenCalledWith("/rpc/get_shipment_pick_list", {
      method: "POST",
      body: JSON.stringify({ p_shipment_id: "shipment-1" }),
    });
    expect(mockedSbJson).toHaveBeenNthCalledWith(1,
      "/book_copies?id=in.(copy-1)&select=id,bin_id,section&limit=200"
    );
    expect(mockedSbJson).toHaveBeenNthCalledWith(2,
      "/shipment_books?shipment_id=eq.shipment-1&select=id,book_copy_id,book_title_id,selection_metadata&limit=200"
    );
  });

  it("returns null metadata for legacy pick-list rows", async () => {
    mockedSbFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ book_copy_id: null, bin_id: "LEGACY-BIN" }]), { status: 200 })
    );
    mockedSbJson.mockResolvedValueOnce([]);

    await expect(getShipmentPickList({ shipment_id: "shipment-legacy" })).resolves.toEqual([
      {
        book_copy_id: null,
        bin_id: "LEGACY-BIN",
        section: null,
        location: "LEGACY-BIN",
        selection_metadata: null,
      },
    ]);
  });
  it("preserves the RPC error text", async () => {
    mockedSbFetch.mockResolvedValueOnce(new Response("rpc failure", { status: 500 }));
    await expect(getShipmentPickList({ shipment_id: "shipment-1" })).rejects.toThrow(
      "Failed to get shipment pick list: rpc failure"
    );
  });
});

describe("swapShipmentBook", () => {
  it("preserves the candidate RPC payload and direct update sequence", async () => {
    mockedSbJson.mockResolvedValueOnce([
      { id: "shipment-book-1", book_copy_id: "old-copy", book_title_id: "old-title", selection_metadata: { engine_version: "book-selection-v2", final_score: 70 } },
    ]);
    mockedSbFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { book_copy_id: "new-copy", book_title_id: "new-title", title: "Any Book", match_score: 88 },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: "shipment-book-1", book_copy_id: "new-copy" },
      ]), { status: 200 }));

    await expect(swapShipmentBook({
      shipment_id: "shipment-1",
      member_id: "member-1",
      old_book_copy_id: "old-copy",
      books_needed: 6,
    })).resolves.toEqual({ id: "shipment-book-1", book_copy_id: "new-copy" });

    expect(mockedSbFetch).toHaveBeenNthCalledWith(1, "/rpc/select_books_for_shipment", {
      method: "POST",
      body: JSON.stringify({
        p_member_id: "member-1",
        p_shipment_id: "shipment-1",
        p_books_needed: 6,
      }),
    });
    expect(mockedSbFetch.mock.calls[1][0]).toBe("/shipment_books?id=eq.shipment-book-1");
    const patchBody = JSON.parse(String((mockedSbFetch.mock.calls[1][1] as RequestInit).body));
    expect(patchBody).toMatchObject({
      book_copy_id: "new-copy",
      book_title_id: "new-title",
      status: "ready_for_picking",
      match_score: 88,
      selection_metadata: {
        engine_version: "book-selection-v2-swap",
        source: "swap",
        previous_selection_metadata: { engine_version: "book-selection-v2", final_score: 70 },
      },
      picked_at: null,
      scanned_at: null,
    });
    expect(mockedSbVoid).toHaveBeenCalledTimes(3);
    expect(mockedSbVoid.mock.calls.map(([path]) => path)).toEqual([
      "/book_copies?id=eq.old-copy",
      "/book_copies?id=eq.new-copy",
      "/shipment_book_swaps",
    ]);
  });

  it("retains the existing seasonal candidate filter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00.000Z"));
    mockedSbJson.mockResolvedValueOnce([
      { id: "shipment-book-1", book_copy_id: "old-copy", book_title_id: "old-title", selection_metadata: { engine_version: "book-selection-v2", final_score: 70 } },
    ]);
    mockedSbFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { book_copy_id: "holiday-copy", book_title_id: "holiday-title", title: "Christmas Story", match_score: 99 },
        { book_copy_id: "new-copy", book_title_id: "new-title", title: "Any Book", match_score: 88 },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: "shipment-book-1", book_copy_id: "new-copy" },
      ]), { status: 200 }));

    await swapShipmentBook({
      shipment_id: "shipment-1",
      member_id: "member-1",
      old_book_copy_id: "old-copy",
      books_needed: 6,
    });

    const patchOptions = mockedSbFetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(patchOptions.body))).toMatchObject({
      book_copy_id: "new-copy",
      book_title_id: "new-title",
    });
  });
  it("preserves the missing-assignment error", async () => {
    mockedSbJson.mockResolvedValueOnce([]);
    await expect(swapShipmentBook({
      shipment_id: "shipment-1",
      member_id: "member-1",
      old_book_copy_id: "old-copy",
      books_needed: 6,
    })).rejects.toThrow("The selected book is no longer assigned to this shipment.");
  });
});