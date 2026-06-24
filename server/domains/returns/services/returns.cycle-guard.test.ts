import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/supabase", () => ({ sbFetch: vi.fn(), sbJson: vi.fn(), sbVoid: vi.fn() }));

import { sbJson } from "../../../../server/supabase";
import { createReturnsService } from "./returns.service";

const mockedSbJson = vi.mocked(sbJson);
const createNextShipment = vi.fn();

function legacySource() {
  return readFileSync(resolve(process.cwd(), "server/domains/_legacy/legacy-app-router.ts"), "utf8");
}

function webhookSource() {
  return readFileSync(resolve(process.cwd(), "server/webhooks/easypost-tracking.ts"), "utf8");
}

function configureReturnStatus(status: "receiving" | "received") {
  mockedSbJson.mockImplementation(async (path: string) => {
    if (path.startsWith("/book_copies?id=eq.copy-1")) return [{ id: "copy-1", book_title_id: "title-1", status: "in_transit" }];
    if (path.startsWith("/shipment_books?id=eq.shipment-book-1")) return [{ id: "shipment-book-1", shipment_id: "shipment-1", shipments: { member_id: "member-1" } }];
    if (path.startsWith("/returns?original_shipment_id=eq.shipment-1")) return [{ id: "return-1", return_number: "RET-1", notes: null }];
    if (path.startsWith("/return_books?return_id=eq.return-1&book_copy_id")) return [];
    if (path.startsWith("/shipment_books?shipment_id=eq.shipment-1&book_copy_id=not.is.null")) return [{ id: "shipment-book-1", book_copy_id: "copy-1", book_copies: { status: status === "receiving" ? "in_transit" : "in_house" } }];
    if (path.startsWith("/return_books?return_id=eq.return-1&processed_at")) return status === "receiving" ? [] : [{ book_copy_id: "copy-1" }];
    return [];
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  createNextShipment.mockResolvedValue({ created: true, shipment_id: "next-shipment" });
});

describe("Phase 4A member-cycle regression gaps", () => {
  it("documents that manual bundle creation blocks picking, packing, and packed shipments", () => {
    const source = legacySource();
    const start = source.indexOf("async function createPickingOrderForMember");
    const end = source.indexOf("const returnsService", start);
    const helper = source.slice(start, end);
    expect(helper).toContain("status=in.(picking,packing,packed)");
  });

  it("documents the current gap: a shipped unresolved return is not in the manual bundle guard", () => {
    const source = legacySource();
    const start = source.indexOf("async function createPickingOrderForMember");
    const end = source.indexOf("const returnsService", start);
    const helper = source.slice(start, end);
    expect(helper).not.toContain("status=in.(picking,packing,packed,shipped)");
    expect(helper).not.toMatch(/status=in\.\([^)]*shipped[^)]*\)/);
  });

  it("keeps a partial return in receiving and does not attempt the next shipment", async () => {
    configureReturnStatus("receiving");
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "received" })).resolves.toMatchObject({ status: "receiving", next_shipment: null });
    expect(createNextShipment).not.toHaveBeenCalled();
  });

  it("attempts the next shipment after the current return-status calculation reaches received", async () => {
    configureReturnStatus("received");
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "received" })).resolves.toMatchObject({ status: "received", next_shipment: { shipment_id: "next-shipment" } });
    expect(createNextShipment).toHaveBeenCalledWith({ member_id: "member-1", source: "return" });
  });

  it("documents current webhook behavior: return in_transit can directly create a picking shipment", () => {
    const source = webhookSource();
    expect(source).toContain("status: 'in_transit'");
    expect(source).toContain("status=in.(picking,packing,packed)");
    expect(source).toContain("status: 'picking'");
    expect(source).toContain("shipment_created: true");
  });

  it("documents that duplicate-title exclusion is application read-then-write logic", () => {
    const source = legacySource();
    const start = source.indexOf("async function createPickingOrderForMember");
    const end = source.indexOf("const returnsService", start);
    const helper = source.slice(start, end);
    expect(helper).toContain("/member_book_history?member_id=eq.${member.id}&select=book_title_id");
    expect(helper).toContain("priorTitleIds.has(copy.book_title_id)");
  });

  it.todo("future: a shipped unresolved cycle must block manual bundle creation");
  it.todo("future: webhook retry and return in_transit must not create a next shipment before cycle closure");
  it.todo("future: duplicate-title prevention must be enforced transactionally at the service/database boundary");
});