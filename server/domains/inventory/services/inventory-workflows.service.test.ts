import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../supabase", () => ({
  getBinConfigs: vi.fn(),
  getBookCopies: vi.fn(),
  getBookTitlesWithCopies: vi.fn(),
  getInventorySummary: vi.fn(),
  sbFetch: vi.fn(),
  sbJson: vi.fn(),
  sbVoid: vi.fn(),
}));

import { sbFetch, sbJson, sbVoid } from "../../../supabase";
import { updateInventoryCopy } from "./inventory.service";
import { markLabelsPrinted } from "./labels.service";
import { receiveBook } from "./receive.service";
import { confirmStockPlaced, failQc, passQc } from "./workflow.service";

const mockedSbFetch = vi.mocked(sbFetch);
const mockedSbJson = vi.mocked(sbJson);
const mockedSbVoid = vi.mocked(sbVoid);

beforeEach(() => vi.clearAllMocks());

describe("inventory service extraction", () => {
  it("preserves labels.markPrinted's two PATCH operations and statuses", async () => {
    await expect(markLabelsPrinted({ ids: ["copy-1", "copy-2"] })).resolves.toEqual({ success: true });
    expect(mockedSbVoid).toHaveBeenCalledTimes(2);
    expect(mockedSbVoid.mock.calls[0][0]).toBe("/book_copies?id=in.(copy-1,copy-2)");
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({ label_status: "printed" });
    expect(mockedSbVoid.mock.calls[1][0]).toBe("/book_copies?id=in.(copy-1,copy-2)&status=eq.pending_label");
    expect(JSON.parse(String((mockedSbVoid.mock.calls[1][1] as RequestInit).body))).toMatchObject({ status: "pending_stock" });
  });

  it("preserves receive.addBook's title then pending-QC copy payload flow", async () => {
    mockedSbJson
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "title-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "copy-1" }]);

    await expect(receiveBook({
      isbn: "9780000000001",
      title: "A Book",
      author: "An Author",
      age_group: "Hatchlings",
      bin_id: "HATCH-ADV-01",
      bin_theme: "Adventure",
      condition: "good",
    })).resolves.toMatchObject({ success: true, sku: "BN-HATCH-000001", copy_id: "copy-1", title_id: "title-1" });

    expect(mockedSbJson.mock.calls[2][0]).toBe("/book_titles");
    expect(mockedSbJson.mock.calls[4][0]).toBe("/book_copies");
    expect(JSON.parse(String((mockedSbJson.mock.calls[4][1] as RequestInit).body))).toMatchObject({
      sku: "BN-HATCH-000001",
      book_title_id: "title-1",
      status: "pending_qc",
      condition: "good",
      label_status: "pending",
    });
  });

  it("preserves QC pass and fail status/label transitions", async () => {
    await expect(passQc({ copy_id: "copy-1", condition: "good", notes: "ok" })).resolves.toEqual({ success: true, next_status: "pending_stock" });
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      status: "pending_stock", label_status: "printed", condition: "good", qc_notes: "ok",
    });

    await expect(failQc({ copy_id: "copy-2", notes: "damaged" })).resolves.toEqual({ success: true });
    expect(JSON.parse(String((mockedSbVoid.mock.calls[1][1] as RequestInit).body))).toMatchObject({
      status: "donated_lfl", label_status: "not_required", qc_notes: "damaged",
    });
  });

  it("preserves stock.confirmPlaced's direct placement payload", async () => {
    await expect(confirmStockPlaced({ copy_id: "copy-1", bin_id: "SOAR-ADV-01", section: "b" })).resolves.toEqual({ success: true });
    expect(mockedSbVoid.mock.calls[0][0]).toBe("/book_copies?id=eq.copy-1");
    expect(JSON.parse(String((mockedSbVoid.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      status: "in_house", bin_id: "SOAR-ADV-01", section: "B",
    });
  });

  it("preserves inventory.updateCopy's terminal label behavior", async () => {
    mockedSbFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(updateInventoryCopy({ id: "copy-1", status: "damaged", condition: "poor" })).resolves.toEqual({ success: true });
    expect(mockedSbFetch).toHaveBeenCalledWith("/book_copies?id=eq.copy-1", expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse(String((mockedSbFetch.mock.calls[0][1] as RequestInit).body))).toMatchObject({
      status: "damaged", condition: "poor", label_status: "not_required",
    });
  });
});