import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/supabase", () => ({ sbFetch: vi.fn(), sbJson: vi.fn(), sbVoid: vi.fn() }));

import { sbFetch, sbJson, sbVoid } from "../../../../server/supabase";
import { createReturnsService } from "./returns.service";

const mockedSbFetch = vi.mocked(sbFetch);
const mockedSbJson = vi.mocked(sbJson);
const mockedSbVoid = vi.mocked(sbVoid);
const createNextShipment = vi.fn();

function configureReturnReads(options: { outcome: "received" | "missing" | "issue"; kept?: boolean; status?: "received" | "receiving" } = { outcome: "received" }) {
  mockedSbJson.mockImplementation(async (path: string) => {
    if (path.startsWith("/book_copies?id=eq.copy-1")) return [{ id: "copy-1", book_title_id: "title-1", status: "in_transit" }];
    if (path.startsWith("/shipment_books?id=eq.shipment-book-1")) return [{ id: "shipment-book-1", shipment_id: "shipment-1", shipments: { member_id: "member-1" } }];
    if (path.startsWith("/member_book_history")) return options.kept ? [{ id: "history-1" }] : [];
    if (path.startsWith("/returns?original_shipment_id=eq.shipment-1")) return [{ id: "return-1", return_number: "RET-1", notes: null }];
    if (path.startsWith("/return_books?return_id=eq.return-1&book_copy_id")) return [];
    if (path.startsWith("/shipment_books?shipment_id=eq.shipment-1&book_copy_id=not.is.null")) return [{ id: "shipment-book-1", book_copy_id: "copy-1", book_copies: { status: options.status === "receiving" ? "in_transit" : "in_house" } }];
    if (path.startsWith("/return_books?return_id=eq.return-1&processed_at")) return options.status === "receiving" ? [] : [{ book_copy_id: "copy-1" }];
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  createNextShipment.mockResolvedValue({ created: true, shipment_id: "next-shipment" });
});

describe("returns service regression behavior", () => {
  it("preserves received processing, history update, and automatic next-shipment attempt", async () => {
    configureReturnReads({ outcome: "received" });
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "received", notes: "ok" })).resolves.toMatchObject({ success: true, return_id: "return-1", status: "received", next_shipment: { shipment_id: "next-shipment" } });
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({ status: "in_house" });
    expect(mockedSbVoid.mock.calls.map(([path]) => path)).toContain("/member_book_history?member_id=eq.member-1&shipment_id=eq.shipment-1&book_title_id=eq.title-1");
    expect(createNextShipment).toHaveBeenCalledWith({ member_id: "member-1", source: "return" });
  });

  it("preserves missing processing without a member-history return update", async () => {
    configureReturnReads({ outcome: "missing" });
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "missing", notes: "missing" })).resolves.toMatchObject({ status: "received" });
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({ status: "lost" });
    expect(mockedSbVoid.mock.calls.map(([path]) => path)).not.toContain("/member_book_history?member_id=eq.member-1&shipment_id=eq.shipment-1&book_title_id=eq.title-1");
  });

  it("preserves issue processing and its issue return-book note", async () => {
    configureReturnReads({ outcome: "issue" });
    const service = createReturnsService(createNextShipment);
    await service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "issue", notes: "cover" });
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({ status: "in_house" });
    const returnBookCall = mockedSbVoid.mock.calls.find(([path]) => path === "/return_books");
    expect(JSON.parse(String((returnBookCall?.[1] as RequestInit).body))).toMatchObject({ received: true, condition_notes: "Issue on return: cover" });
  });

  it("preserves bundle processing for every in-transit book", async () => {
    configureReturnReads({ outcome: "received" });
    const original = mockedSbJson.getMockImplementation();
    mockedSbJson.mockImplementation(async (path: string, options?: RequestInit) => {
      if (path.startsWith("/shipment_books?shipment_id=eq.shipment-1&book_copy_id=not.is.null&select=id,book_copy_id,book_copies(status)")) return [{ id: "shipment-book-1", book_copy_id: "copy-1", book_copies: { status: "in_transit" } }];
      return original?.(path, options) ?? [];
    });
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundle({ shipment_id: "shipment-1", notes: "bulk" })).resolves.toMatchObject({ success: true, processed_count: 1, return_id: "return-1" });
  });

  it("preserves return status calculation and lookup-by-SKU assembly", async () => {
    mockedSbJson
      .mockResolvedValueOnce([{ id: "shipment-book-1", book_copy_id: "copy-1", book_copies: { status: "in_transit" } }])
      .mockResolvedValueOnce([]);
    const service = createReturnsService(createNextShipment);
    await expect(service.getNextReturnStatus("return-1", "shipment-1")).resolves.toBe("receiving");

    mockedSbFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "copy-1", book_title_id: "title-1", bin_id: "BIN-01", section: "A" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "title-1", title: "Book", author: "Author" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ shipment_id: "shipment-1", id: "shipment-book-1" }]), { status: 200 }));
    await expect(service.lookupBySku({ sku: "SKU-1" })).resolves.toMatchObject({ location: "BIN-A", book_title: { title: "Book" }, last_shipment_id: "shipment-1" });
  });
});