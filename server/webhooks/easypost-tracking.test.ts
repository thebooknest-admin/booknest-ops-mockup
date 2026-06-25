import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_ANON_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllEnvs());

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function createResponse() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status } as any, status, json };
}

describe("EasyPost return tracking webhook", () => {
  it("updates a requested return to in_transit without creating a shipment", async () => {
    fetchMock
      .mockResolvedValueOnce(response([{ id: "return-1", member_id: "member-1", status: "requested" }]))
      .mockResolvedValueOnce(response([]));
    const { easypostTrackingWebhook } = await import("./easypost-tracking");
    const result = createResponse();

    await easypostTrackingWebhook({ body: { description: "tracker.updated", result: { tracking_code: "TRACK-1", status: "in_transit" } } } as any, result.res);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://example.supabase.co/rest/v1/returns?id=eq.return-1");
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toMatchObject({ status: "in_transit" });
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/shipments") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
    expect(result.json).toHaveBeenCalledWith({ ok: true, return_updated: true, shipment_created: false });
  });

  it("does not create a shipment for repeated in_transit events", async () => {
    const { easypostTrackingWebhook } = await import("./easypost-tracking");
    for (let i = 0; i < 2; i++) {
      fetchMock
        .mockResolvedValueOnce(response([{ id: "return-1", member_id: "member-1", status: "requested" }]))
        .mockResolvedValueOnce(response([]));
      const result = createResponse();
      await easypostTrackingWebhook({ body: { description: "tracker.updated", result: { tracking_code: "TRACK-1", status: "in_transit" } } } as any, result.res);
    }
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/shipments") && (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });
});