import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/supabase", () => ({ sbFetch: vi.fn(), sbJson: vi.fn(), sbVoid: vi.fn() }));

import { sbJson } from "../../../../server/supabase";
import { getMemberCycleState, isMemberCycleOpen } from "./member-cycle.guard";
import { createReturnsService } from "./returns.service";

const mockedSbJson = vi.mocked(sbJson);
const createNextShipment = vi.fn();

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

function setCycle(shipmentStatus?: string, returnStatus?: string) {
  mockedSbJson
    .mockResolvedValueOnce(shipmentStatus ? [{ id: "shipment-1", status: shipmentStatus }] : [])
    .mockResolvedValueOnce(returnStatus ? [{ id: "return-1", status: returnStatus }] : []);
}

beforeEach(() => {
  vi.resetAllMocks();
  createNextShipment.mockResolvedValue({ created: true, shipment_id: "next-shipment" });
});

describe("Phase 4B member-cycle guard", () => {
  it("wires the manual bundle helper through the member-cycle guard", () => {
    const source = readFileSync(resolve(process.cwd(), "server/domains/_legacy/legacy-app-router.ts"), "utf8");
    const start = source.indexOf("async function createPickingOrderForMember");
    const end = source.indexOf("const returnsService", start);
    const helper = source.slice(start, end);
    expect(helper).toContain("getMemberCycleState(input.member_id)");
  });
  it.each(["picking", "packing", "packed", "shipped"])("blocks %s outbound shipments", async (status) => {
    setCycle(status);
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(true);
  });

  it.each(["requested", "in_transit", "receiving"])("blocks %s returns", async (status) => {
    setCycle(undefined, status);
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(true);
  });

  it("allows bundle creation only when no configured shipment or return is open", async () => {
    setCycle();
    await expect(getMemberCycleState("member-1")).resolves.toEqual({ open: false, shipment: null, returnRecord: null });
  });

  it("keeps a partial return in receiving and does not attempt a next shipment", async () => {
    configureReturnStatus("receiving");
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "received" })).resolves.toMatchObject({ status: "receiving", next_shipment: null });
    expect(createNextShipment).not.toHaveBeenCalled();
  });

  it("captures the guarded next-shipment result when return processing reaches received", async () => {
    configureReturnStatus("received");
    createNextShipment.mockResolvedValueOnce({ created: false, shipment_id: "shipment-1", status: "shipped", reason: "open_shipment_exists" });
    const service = createReturnsService(createNextShipment);
    await expect(service.processBundleBook({ shipment_id: "shipment-1", shipment_book_id: "shipment-book-1", copy_id: "copy-1", outcome: "received" })).resolves.toMatchObject({ status: "received", next_shipment: { created: false, reason: "open_shipment_exists" } });
    expect(createNextShipment).toHaveBeenCalledWith({ member_id: "member-1", source: "return" });
  });

  it("documents unchanged webhook behavior: return in_transit can still create a picking shipment", () => {
    const source = webhookSource();
    expect(source).toContain("status: 'in_transit'");
    expect(source).toContain("status=in.(picking,packing,packed)");
    expect(source).toContain("status: 'picking'");
    expect(source).toContain("shipment_created: true");
  });

  it.todo("future: webhook retry and return in_transit must not create a next shipment before cycle closure");
  it.todo("future: duplicate-title prevention must be enforced transactionally at the service/database boundary");
});