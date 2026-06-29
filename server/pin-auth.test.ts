import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { PIN_SESSION_COOKIE_NAME } from "./_core/pinSession";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from "../shared/const";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  value?: string;
  options: Record<string, unknown>;
};

const originalPin = process.env.VITE_APP_PIN;
const originalOpsPin = process.env.OPS_PIN;
const originalJwtSecret = process.env.JWT_SECRET;

function createMockReqRes(cookieHeader?: string) {
  const setCookies: CookieCall[] = [];
  const clearedCookies: CookieCall[] = [];

  const req = {
    protocol: "https",
    headers: {
      cookie: cookieHeader,
      "x-forwarded-proto": "https",
    },
  } as TrpcContext["req"];

  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      setCookies.push({ name, value, options });
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      clearedCookies.push({ name, options });
    },
  } as TrpcContext["res"];

  return { req, res, setCookies, clearedCookies };
}

async function createCallerFromCookie(cookieHeader?: string) {
  const { req, res, setCookies, clearedCookies } = createMockReqRes(cookieHeader);
  const ctx = await createContext({ req, res } as any);
  return {
    caller: appRouter.createCaller(ctx),
    ctx,
    setCookies,
    clearedCookies,
  };
}

beforeEach(() => {
  process.env.VITE_APP_PIN = "123456";
  delete process.env.OPS_PIN;
  process.env.JWT_SECRET = "test-pin-session-secret";
});

afterEach(() => {
  if (originalPin === undefined) delete process.env.VITE_APP_PIN;
  else process.env.VITE_APP_PIN = originalPin;

  if (originalOpsPin === undefined) delete process.env.OPS_PIN;
  else process.env.OPS_PIN = originalOpsPin;

  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;

  vi.restoreAllMocks();
});

describe("PIN operator authentication", () => {
  it("rejects protected tRPC before a PIN session exists", async () => {
    const { caller } = await createCallerFromCookie();

    await expect(caller.system.supabaseDebug()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: UNAUTHED_ERR_MSG,
    });
  });

  it("authenticates protected tRPC after valid PIN creates a server-readable session", async () => {
    const login = await createCallerFromCookie();

    await expect(login.caller.auth.pinLogin({ pin: "123456" })).resolves.toMatchObject({
      success: true,
      user: {
        role: "admin",
        loginMethod: "pin",
        openId: "booknest-pin-operator",
      },
    });

    const pinCookie = login.setCookies.find(cookie => cookie.name === PIN_SESSION_COOKIE_NAME);
    expect(pinCookie?.value).toBeTruthy();
    expect(pinCookie?.options).toMatchObject({
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
    });

    const authed = await createCallerFromCookie(`${PIN_SESSION_COOKIE_NAME}=${pinCookie!.value}`);

    await expect(authed.caller.system.supabaseDebug()).resolves.toMatchObject({
      expected_url_env_vars: expect.arrayContaining(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]),
    });
    await expect(authed.caller.auth.me()).resolves.toMatchObject({
      role: "admin",
      loginMethod: "pin",
    });
  });

  it("does not authenticate invalid PIN attempts", async () => {
    const login = await createCallerFromCookie();

    await expect(login.caller.auth.pinLogin({ pin: "000000" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid PIN",
    });
    expect(login.setCookies.find(cookie => cookie.name === PIN_SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("logout clears both OAuth and PIN session cookies", async () => {
    const login = await createCallerFromCookie();
    await login.caller.auth.pinLogin({ pin: "123456" });
    const pinCookie = login.setCookies.find(cookie => cookie.name === PIN_SESSION_COOKIE_NAME);

    const authed = await createCallerFromCookie(`${PIN_SESSION_COOKIE_NAME}=${pinCookie!.value}`);
    await expect(authed.caller.auth.logout()).resolves.toEqual({ success: true });

    expect(authed.clearedCookies.map(cookie => cookie.name)).toEqual(
      expect.arrayContaining([COOKIE_NAME, PIN_SESSION_COOKIE_NAME])
    );
  });
});