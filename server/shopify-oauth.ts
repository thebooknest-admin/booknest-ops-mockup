import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { sbVoid } from "./supabase";

const SHOPIFY_SCOPES = "read_customers";

function getShopifyClientConfig() {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const appUrl =
    process.env.SHOPIFY_APP_URL ??
    process.env.APP_URL ??
    process.env.PUBLIC_APP_URL;

  if (!clientId || !clientSecret || !appUrl) return null;

  return {
    clientId,
    clientSecret,
    appUrl: appUrl.replace(/\/$/, ""),
  };
}

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeShopDomain(shop: string | undefined): string | null {
  if (!shop) return null;
  const normalized = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(normalized)
    ? normalized
    : null;
}

function buildShopifyHmacMessage(req: Request): string {
  return Object.entries(req.query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map(item => [key, String(item)] as const)
        : [[key, String(value)] as const]
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function verifyShopifyHmac(req: Request, clientSecret: string): boolean {
  const hmac = getQueryParam(req, "hmac");
  if (!hmac) return false;

  const digest = crypto
    .createHmac("sha256", clientSecret)
    .update(buildShopifyHmacMessage(req))
    .digest("hex");

  const digestBuffer = Buffer.from(digest);
  const hmacBuffer = Buffer.from(hmac);
  return (
    digestBuffer.length === hmacBuffer.length &&
    crypto.timingSafeEqual(digestBuffer, hmacBuffer)
  );
}

async function storeShopifyAccessToken(input: {
  shopDomain: string;
  accessToken: string;
  scope: string | null;
}) {
  const now = new Date().toISOString();
  await sbVoid("/shopify_installations", {
    method: "POST",
    body: JSON.stringify({
      shop_domain: input.shopDomain,
      access_token: input.accessToken,
      scope: input.scope,
      installed_at: now,
      updated_at: now,
    }),
    headers: {
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
  });
}

export function registerShopifyOAuthRoutes(app: Express) {
  app.get("/api/shopify/install", (req: Request, res: Response) => {
    const config = getShopifyClientConfig();
    if (!config) {
      res.status(500).send("Missing Shopify OAuth env vars.");
      return;
    }

    const shopDomain = normalizeShopDomain(getQueryParam(req, "shop"));
    if (!shopDomain) {
      res.status(400).send("Missing or invalid shop.");
      return;
    }

    if (!verifyShopifyHmac(req, config.clientSecret)) {
      res.status(401).send("Invalid Shopify install signature.");
      return;
    }

    const state = crypto
      .createHmac("sha256", config.clientSecret)
      .update(shopDomain)
      .digest("hex");
    const redirectUri = `${config.appUrl}/api/shopify/callback`;
    const authUrl = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("scope", SHOPIFY_SCOPES);
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    res.redirect(302, authUrl.toString());
  });

  app.get("/api/shopify/callback", async (req: Request, res: Response) => {
    try {
      const config = getShopifyClientConfig();
      if (!config) {
        res.status(500).send("Missing Shopify OAuth env vars.");
        return;
      }

      const code = getQueryParam(req, "code");
      const state = getQueryParam(req, "state");
      const shopDomain = normalizeShopDomain(getQueryParam(req, "shop"));

      if (!code || !state || !shopDomain) {
        res.status(400).send("Missing Shopify callback parameters.");
        return;
      }
      const expectedState = crypto
        .createHmac("sha256", config.clientSecret)
        .update(shopDomain)
        .digest("hex");
      if (state !== expectedState) {
        res.status(401).send("Invalid Shopify OAuth state.");
        return;
      }
      if (!verifyShopifyHmac(req, config.clientSecret)) {
        res.status(401).send("Invalid Shopify callback signature.");
        return;
      }

      const tokenRes = await fetch(
        `https://${shopDomain}/admin/oauth/access_token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
          }),
        }
      );

      if (!tokenRes.ok) {
        res
          .status(502)
          .send(`Shopify token exchange failed: ${await tokenRes.text()}`);
        return;
      }

      const tokenData: { access_token: string; scope?: string } =
        await tokenRes.json();
      await storeShopifyAccessToken({
        shopDomain,
        accessToken: tokenData.access_token,
        scope: tokenData.scope ?? null,
      });

      res
        .status(200)
        .send("BookNest Shopify address sync is installed. You can close this tab.");
    } catch (error) {
      console.error("[Shopify OAuth] Callback failed", error);
      res
        .status(500)
        .send(
          `Shopify OAuth callback failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
    }
  });
}
