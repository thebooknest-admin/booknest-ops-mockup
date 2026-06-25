import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/supabase", () => ({ sbJson: vi.fn() }));

import { sbJson } from "../../../../server/supabase";
import { getMemberCycleState, isMemberCycleOpen } from "./member-cycle.guard";

const mockedSbJson = vi.mocked(sbJson);

type CycleFixture = {
  shipmentStatus?: string;
  activeReturnStatus?: string;
  receivedReturn?: boolean;
  expected?: string[];
  resolved?: Array<{ book_copy_id: string; received?: boolean; condition_notes?: string }>;
};

function configureCycle(fixture: CycleFixture) {
  mockedSbJson.mockImplementation(async (path: string) => {
    if (path.startsWith("/shipments?member_id=")) {
      return fixture.shipmentStatus ? [{ id: "shipment-1", status: fixture.shipmentStatus }] : [];
    }
    if (path.startsWith("/returns?member_id=")) {
      return fixture.activeReturnStatus ? [{ id: "return-active", status: fixture.activeReturnStatus }] : [];
    }
    if (path.startsWith("/returns?original_shipment_id=eq.shipment-1")) {
      return fixture.receivedReturn ? [{ id: "return-1", status: "received" }] : [];
    }
    if (path.startsWith("/shipment_books?shipment_id=eq.shipment-1")) {
      return (fixture.expected ?? []).map(book_copy_id => ({ book_copy_id }));
    }
    if (path.startsWith("/return_books?return_id=eq.return-1")) {
      return fixture.resolved ?? [];
    }
    return [];
  });
}

beforeEach(() => vi.resetAllMocks());

describe("member cycle closure guard", () => {
  it("keeps manual and return follow-on creation wired through the closure-aware guard", () => {
    const source = readFileSync(resolve(process.cwd(), "server/domains/_legacy/legacy-app-router.ts"), "utf8");
    const start = source.indexOf("async function createPickingOrderForMember");
    const end = source.indexOf("const returnsService", start);
    expect(source.slice(start, end)).toContain("getMemberCycleState(input.member_id)");
  });
  it.each(["picking", "packing", "packed"])("keeps %s shipments open", async (shipmentStatus) => {
    configureCycle({ shipmentStatus });
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(true);
  });

  it("keeps a shipped shipment with no linked return open", async () => {
    configureCycle({ shipmentStatus: "shipped" });
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(true);
  });

  it.each(["requested", "in_transit", "receiving"])("keeps shipped cycles with %s returns open", async (activeReturnStatus) => {
    configureCycle({ shipmentStatus: "shipped", activeReturnStatus });
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(true);
  });

  it("keeps a received return open when an expected copy is unresolved", async () => {
    configureCycle({ shipmentStatus: "shipped", receivedReturn: true, expected: ["copy-1", "copy-2"], resolved: [{ book_copy_id: "copy-1" }] });
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(true);
  });

  it("closes a shipped cycle when every expected copy has a processed resolution", async () => {
    configureCycle({ shipmentStatus: "shipped", receivedReturn: true, expected: ["copy-1", "copy-2"], resolved: [{ book_copy_id: "copy-1" }, { book_copy_id: "copy-2" }] });
    await expect(getMemberCycleState("member-1")).resolves.toEqual({ open: false, shipment: null, returnRecord: null });
  });

  it.each([
    ["kept/paid", { book_copy_id: "copy-1", received: false, condition_notes: "Kept/paid before return" }],
    ["missing/lost", { book_copy_id: "copy-1", received: false, condition_notes: "Missing on return" }],
    ["withdrawn", { book_copy_id: "copy-1", received: false, condition_notes: "Kept/paid before return" }],
    ["approved issue/damaged", { book_copy_id: "copy-1", received: true, condition_notes: "Issue on return" }],
  ])("counts processed %s records as final resolutions", async (_label, resolution) => {
    configureCycle({ shipmentStatus: "shipped", receivedReturn: true, expected: ["copy-1"], resolved: [resolution] });
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(false);
  });

  it("allows a next shipment decision only after the cycle is fully resolved", async () => {
    configureCycle({ shipmentStatus: "shipped", receivedReturn: true, expected: ["copy-1"], resolved: [{ book_copy_id: "copy-1" }] });
    await expect(isMemberCycleOpen("member-1")).resolves.toBe(false);
  });
});
