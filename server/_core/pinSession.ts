import { parse as parseCookieHeader } from "cookie";
import type { CookieOptions, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { getSessionCookieOptions } from "./cookies";

export const PIN_SESSION_COOKIE_NAME = "booknest_ops_pin_session";
export const PIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

type PinSessionPayload = {
  kind: "booknest_ops_pin";
  role: "admin";
};

function getConfiguredPin() {
  return process.env.OPS_PIN?.trim() || process.env.VITE_APP_PIN?.trim() || "";
}

function getPinSessionSecret() {
  const secret =
    process.env.PIN_SESSION_SECRET?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    getConfiguredPin();

  if (!secret) {
    throw new Error("PIN authentication is not configured. Set OPS_PIN or VITE_APP_PIN.");
  }

  return new TextEncoder().encode(secret);
}

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return new Map<string, string>();
  const parsed = parseCookieHeader(cookieHeader);
  return new Map(Object.entries(parsed));
}

function createPinOperatorUser(): User {
  const now = new Date();
  return {
    id: 0,
    openId: "booknest-pin-operator",
    name: "BookNest Operator",
    email: null,
    loginMethod: "pin",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export function verifyPin(pin: string) {
  const configuredPin = getConfiguredPin();
  if (!configuredPin) {
    throw new Error("PIN authentication is not configured. Set OPS_PIN or VITE_APP_PIN.");
  }
  return pin === configuredPin;
}

export async function createPinSessionToken(): Promise<string> {
  const issuedAt = Date.now();
  const expirationSeconds = Math.floor((issuedAt + PIN_SESSION_DURATION_MS) / 1000);

  return new SignJWT({ kind: "booknest_ops_pin", role: "admin" } satisfies PinSessionPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getPinSessionSecret());
}

export async function verifyPinSessionToken(cookieValue: string | undefined | null): Promise<boolean> {
  if (!cookieValue) return false;

  try {
    const { payload } = await jwtVerify(cookieValue, getPinSessionSecret(), {
      algorithms: ["HS256"],
    });

    return payload.kind === "booknest_ops_pin" && payload.role === "admin";
  } catch {
    return false;
  }
}

export async function authenticatePinSessionRequest(req: Request): Promise<User | null> {
  const cookies = parseCookies(req.headers.cookie);
  const pinSessionCookie = cookies.get(PIN_SESSION_COOKIE_NAME);

  if (!(await verifyPinSessionToken(pinSessionCookie))) return null;

  return createPinOperatorUser();
}

export async function setPinSessionCookie(req: Request, res: Response): Promise<User> {
  const token = await createPinSessionToken();
  res.cookie(PIN_SESSION_COOKIE_NAME, token, {
    ...getSessionCookieOptions(req),
    maxAge: PIN_SESSION_DURATION_MS,
  } satisfies CookieOptions);
  return createPinOperatorUser();
}

export function clearPinSessionCookie(req: Request, res: Response) {
  res.clearCookie(PIN_SESSION_COOKIE_NAME, {
    ...getSessionCookieOptions(req),
    maxAge: -1,
  });
}

