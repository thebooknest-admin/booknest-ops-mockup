import { beforeEach, describe, expect, it, vi } from "vitest";

const easyPost = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@easypost/api", () => ({
  default: class EasyPost {
    Tracker = { create: easyPost.create };
  },
}));

vi.mock("../../../supabase", () => ({
  getMemberAddress: vi.fn(),
  getMemberById: vi.fn(),
  getShipmentBooks: vi.fn(),
  getShipmentById: vi.fn(),
  getShipments: vi.fn(),
  sbFetch: vi.fn(),
  sbJson: vi.fn(),
  sbVoid: vi.fn(),
  updateShipmentStatus: vi.fn(),
}));

import {
  getMemberAddress,
  getMemberById,
  getShipmentBooks,
  getShipmentById,
  sbFetch,
  sbJson,
  sbVoid,
  updateShipmentStatus,
} from "../../../supabase";
import { markShipmentPacked } from "./packing.service";
import { getShipmentDetail, updateShipmentStatusService, updateShipmentTracking } from "./shipments.service";
import { markShipmentShipped, saveReturnTracking } from "./shipping.service";

const mockedSbFetch = vi.mocked(sbFetch);
const mockedSbJson = vi.mocked(sbJson);
const mockedSbVoid = vi.mocked(sbVoid);

beforeEach(() => {
  vi.resetAllMocks();
  easyPost.create.mockResolvedValue({});
});

describe("packing and shipping service extraction", () => {
  it("preserves packing.markPacked validation and shipment PATCH", async () => {
    mockedSbJson
      .mockResolvedValueOnce([{ id: "shipment-1", status: "packing" }])
      .mockResolvedValueOnce([{ id: "book-1", book_copy_id: "copy-1", status: "picked", book_copies: { status: "in_house" } }]);

    await expect(markShipmentPacked({ shipment_id: "shipment-1" })).resolves.toEqual({ success: true });
    expect(mockedSbVoid).toHaveBeenCalledWith("/shipments?id=eq.shipment-1", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({ status: "packed" });
  });

  it("preserves shipping.markShipped write order and member-history creation", async () => {
    mockedSbFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "shipment-1", member_id: "member-1", status: "packed" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 201 }));
    mockedSbJson
      .mockResolvedValueOnce([{ id: "book-1", book_title_id: "title-1", book_copy_id: "copy-1", status: "picked", book_copies: { status: "in_house" } }])
      .mockResolvedValueOnce([]);

    await expect(markShipmentShipped({ shipment_id: "shipment-1", tracking_number: "TRACK-1" })).resolves.toEqual({ success: true, shipment_id: "shipment-1", tracking_number: "TRACK-1" });
    expect(mockedSbVoid.mock.calls.map(([path]) => path)).toEqual([
      "/book_copies?id=in.(copy-1)",
      "/shipment_books?shipment_id=eq.shipment-1",
      "/shipments?id=eq.shipment-1",
    ]);
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({ status: "in_transit" });
    expect(mockedSbFetch.mock.calls[1][0]).toBe("/member_book_history");
    expect(JSON.parse(String((mockedSbFetch.mock.calls[1][1] as RequestInit).body))[0]).toMatchObject({ member_id: "member-1", book_title_id: "title-1", shipment_id: "shipment-1", kept: false });
    expect(easyPost.create).toHaveBeenCalledWith({ tracking_code: "TRACK-1", carrier: "USPS" });
  });

  it("preserves return tracking PATCH followed by EasyPost registration", async () => {
    mockedSbFetch
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "shipment-1", member_id: "member-1" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "return-1" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(saveReturnTracking({ shipment_id: "shipment-1", tracking_number: "RETURN-1" })).resolves.toEqual({ success: true, return_id: "return-1", easypost_registered: true });
    expect(mockedSbFetch.mock.calls[2][0]).toBe("/returns?id=eq.return-1");
    expect(easyPost.create).toHaveBeenCalledWith({ tracking_code: "RETURN-1", carrier: "USPS" });
  });

  it("preserves shipments.byId response assembly", async () => {
    vi.mocked(getShipmentById).mockResolvedValue({ id: "shipment-1", member_id: "member-1", address_id: null } as any);
    vi.mocked(getShipmentBooks).mockResolvedValue([{ book_title_id: "title-1", selection_metadata: { engine_version: "book-selection-v2" } }] as any);
    vi.mocked(getMemberById).mockResolvedValue({ id: "member-1", name: "Member" } as any);
    vi.mocked(getMemberAddress).mockResolvedValue({ id: "address-1" } as any);
    mockedSbFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: "title-1", title: "Book", author: "Author", cover_url: null }]), { status: 200 }));

    await expect(getShipmentDetail({ id: "shipment-1" })).resolves.toMatchObject({
      id: "shipment-1",
      member: { id: "member-1" },
      address: { id: "address-1" },
      books: [{ book_title: { title: "Book" }, selection_metadata: { engine_version: "book-selection-v2" } }],
    });
  });


  it("returns null selection metadata for legacy shipment detail rows", async () => {
    vi.mocked(getShipmentById).mockResolvedValue({ id: "shipment-legacy", member_id: "member-1", address_id: null } as any);
    vi.mocked(getShipmentBooks).mockResolvedValue([{ book_title_id: "title-1" }] as any);
    vi.mocked(getMemberById).mockResolvedValue({ id: "member-1", name: "Member" } as any);
    vi.mocked(getMemberAddress).mockResolvedValue({ id: "address-1" } as any);
    mockedSbFetch.mockResolvedValueOnce(new Response(JSON.stringify([{ id: "title-1", title: "Book", author: "Author", cover_url: null }]), { status: 200 }));

    await expect(getShipmentDetail({ id: "shipment-legacy" })).resolves.toMatchObject({
      books: [{ selection_metadata: null }],
    });
  });
  it("preserves shipment tracking and non-shipped status update behavior", async () => {
    mockedSbFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(updateShipmentTracking({ id: "shipment-1", tracking_number: "TRACK-1" })).resolves.toEqual({ success: true });
    expect(JSON.parse(String((mockedSbFetch.mock.calls[0][1] as RequestInit).body))).toMatchObject({ tracking_number: "TRACK-1", carrier: "USPS" });

    await expect(updateShipmentStatusService({ id: "shipment-1", status: "packing" })).resolves.toEqual({ success: true });
    expect(updateShipmentStatus).toHaveBeenCalledWith("shipment-1", "packing", {});
    await expect(updateShipmentStatusService({ id: "shipment-1", status: "shipped" })).rejects.toThrow("Use shipping.markShipped");
  });
});