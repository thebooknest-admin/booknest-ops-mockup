import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSupabaseEnvDiagnostics,
  getSupabaseRestConfig,
  sbFetch,
} from "./supabase";

const SUPABASE_ENV_NAMES = [
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const originalEnv = Object.fromEntries(
  SUPABASE_ENV_NAMES.map(name => [name, process.env[name]])
) as Record<(typeof SUPABASE_ENV_NAMES)[number], string | undefined>;

function clearSupabaseEnv() {
  for (const name of SUPABASE_ENV_NAMES) {
    delete process.env[name];
  }
}

beforeEach(() => {
  clearSupabaseEnv();
});

afterEach(() => {
  clearSupabaseEnv();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value !== undefined) process.env[name] = value;
  }
  vi.unstubAllGlobals();
});

describe("Supabase server env resolution", () => {
  it("accepts production-style NEXT_PUBLIC URL plus service role key without exposing secrets", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://booknestprod.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret-value";
    process.env.SUPABASE_ANON_KEY = "anon-secret-value";

    const diagnostics = getSupabaseEnvDiagnostics();

    expect(diagnostics).toMatchObject({
      supabase_url_present: true,
      supabase_url_source: "NEXT_PUBLIC_SUPABASE_URL",
      supabase_anon_key_present: true,
      supabase_service_role_key_present: true,
      effective_key_present: true,
      effective_key_source: "service_role",
      effective_key_env: "SUPABASE_SERVICE_ROLE_KEY",
      project_ref: "booknestprod",
    });
    expect(JSON.stringify(diagnostics)).not.toContain("service-secret-value");
    expect(JSON.stringify(diagnostics)).not.toContain("anon-secret-value");

    expect(getSupabaseRestConfig()).toMatchObject({
      url: "https://booknestprod.supabase.co",
      urlEnv: "NEXT_PUBLIC_SUPABASE_URL",
      key: "service-secret-value",
      keyEnv: "SUPABASE_SERVICE_ROLE_KEY",
      keySource: "service_role",
      projectRef: "booknestprod",
    });
  });

  it("falls back to anon key when service role key is unavailable", () => {
    process.env.SUPABASE_URL = "https://anononly.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-secret-value";

    expect(getSupabaseEnvDiagnostics()).toMatchObject({
      effective_key_source: "anon",
      effective_key_env: "SUPABASE_ANON_KEY",
      supabase_service_role_key_present: false,
    });
    expect(getSupabaseRestConfig()).toMatchObject({
      key: "anon-secret-value",
      keySource: "anon",
    });
  });

  it("fails loudly when server-side Supabase env is missing", () => {
    expect(getSupabaseEnvDiagnostics()).toMatchObject({
      supabase_url_present: false,
      supabase_anon_key_present: false,
      supabase_service_role_key_present: false,
      effective_key_present: false,
      effective_key_source: "none",
      project_ref: null,
    });

    expect(() => getSupabaseRestConfig()).toThrow(
      "Supabase is not configured for server-side ops data access"
    );
  });

  it("uses the resolved server key for REST calls", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://booknestprod.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret-value";

    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sbFetch("/members?limit=1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://booknestprod.supabase.co/rest/v1/members?limit=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          apikey: "service-secret-value",
          Authorization: "Bearer service-secret-value",
        }),
      })
    );
  });
});