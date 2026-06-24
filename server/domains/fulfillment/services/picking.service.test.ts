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
    mockedSbJson.mockResolvedValueOnce([{ id: "copy-1", bin_id: "SOAR-ADV-01", section: "B" }]);

    await expect(getShipmentPickList({ shipment_id: "shipment-1" })).resolves.toEqual([
      {
        book_copy_id: "copy-1",
        bin_id: "SOAR-ADV-B",
        section: "B",
        location: "SOAR-ADV-B",
        extra: "value",
      },
    ]);
    expect(mockedSbFetch).toHaveBeenCalledWith("/rpc/get_shipment_pick_list", {
      method: "POST",
      body: JSON.stringify({ p_shipment_id: "shipment-1" }),
    });
    expect(mockedSbJson).toHaveBeenCalledWith(
      "/book_copies?id=in.(copy-1)&select=id,bin_id,section&limit=200"
    );
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
      { id: "shipment-book-1", book_copy_id: "old-copy", book_title_id: "old-title" },
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
    expect(mockedSbFetch).toHaveBeenNthCalledWith(2, "/shipment_books?id=eq.shipment-book-1", {
      method: "PATCH",
      body: JSON.stringify({
        book_copy_id: "new-copy",
        book_title_id: "new-title",
        status: "ready_for_picking",
        match_score: 88,
        picked_at: null,
        scanned_at: null,
      }),
      headers: { Prefer: "return=representation" },
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
      { id: "shipment-book-1", book_copy_id: "old-copy", book_title_id: "old-title" },
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