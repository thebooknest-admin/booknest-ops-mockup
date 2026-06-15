import { sbJson } from "./supabase";

export type MemberAddressRow = {
  id: string;
  member_id: string;
  street: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
};

type ShopifyMailingAddress = {
  address1: string | null;
  address2: string | null;
  city: string | null;
  provinceCode: string | null;
  province: string | null;
  zip: string | null;
  countryCodeV2: string | null;
};

function getShopifyGraphqlConfig():
  | { shopDomain: string; accessToken: string }
  | null {
  const rawShopDomain =
    process.env.SHOPIFY_SHOP_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN;
  const accessToken =
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ??
    process.env.SHOPIFY_ACCESS_TOKEN;
  if (!rawShopDomain || !accessToken) return null;

  const shopDomain = rawShopDomain
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  return { shopDomain, accessToken };
}

function getConfiguredShopDomain(): string | null {
  const rawShopDomain =
    process.env.SHOPIFY_SHOP_DOMAIN ?? process.env.SHOPIFY_STORE_DOMAIN;
  if (!rawShopDomain) return null;
  return rawShopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isUsableShopifyAddress(
  address: ShopifyMailingAddress | null | undefined
): address is ShopifyMailingAddress {
  return Boolean(address?.address1 && address?.city && address?.zip);
}

async function fetchShopifyDefaultAddress(
  customerId: string | null | undefined
): Promise<ShopifyMailingAddress | null> {
  const config = await getShopifyAdminConfig();
  if (!config || !customerId) return null;

  const res = await fetch(
    `https://${config.shopDomain}/admin/api/2026-04/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": config.accessToken,
      },
      body: JSON.stringify({
        query: `
          query BookNestCustomerDefaultAddress($id: ID!) {
            customer(id: $id) {
              defaultAddress {
                address1
                address2
                city
                provinceCode
                province
                zip
                countryCodeV2
              }
            }
          }
        `,
        variables: { id: customerId },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Shopify address lookup failed: ${res.status} ${await res.text()}`);
  }

  const data: {
    errors?: Array<{ message?: string }>;
    data?: { customer?: { defaultAddress?: ShopifyMailingAddress | null } | null };
  } = await res.json();

  if (data.errors?.length) {
    throw new Error(
      `Shopify address lookup failed: ${data.errors
        .map(error => error.message ?? "Unknown Shopify error")
        .join("; ")}`
    );
  }

  return data.data?.customer?.defaultAddress ?? null;
}

async function getStoredShopifyAccessToken(
  shopDomain: string
): Promise<string | null> {
  try {
    const rows = await sbJson<{ access_token: string }[]>(
      `/shopify_installations?shop_domain=eq.${encodeURIComponent(shopDomain)}&select=access_token&limit=1`
    );
    return rows[0]?.access_token ?? null;
  } catch (error) {
    console.warn("[Shopify] Could not read stored Shopify token:", error);
    return null;
  }
}

async function getLatestStoredShopifyConfig():
  Promise<{ shopDomain: string; accessToken: string } | null> {
  try {
    const rows = await sbJson<
      { shop_domain: string; access_token: string }[]
    >(
      "/shopify_installations?select=shop_domain,access_token&order=updated_at.desc&limit=1"
    );
    const installation = rows[0];
    return installation
      ? {
          shopDomain: installation.shop_domain,
          accessToken: installation.access_token,
        }
      : null;
  } catch (error) {
    console.warn("[Shopify] Could not read latest Shopify token:", error);
    return null;
  }
}

async function getShopifyAdminConfig():
  Promise<{ shopDomain: string; accessToken: string } | null> {
  const envConfig = getShopifyGraphqlConfig();
  if (envConfig) return envConfig;

  const shopDomain = getConfiguredShopDomain();
  if (!shopDomain) {
    return getLatestStoredShopifyConfig();
  }

  const accessToken = await getStoredShopifyAccessToken(shopDomain);
  return accessToken
    ? { shopDomain, accessToken }
    : getLatestStoredShopifyConfig();
}

export async function getExistingDefaultAddress(
  memberId: string
): Promise<MemberAddressRow | null> {
  const rows = await sbJson<MemberAddressRow[]>(
    `/member_addresses?member_id=eq.${memberId}&is_default=eq.true&select=id,member_id,street,street2,city,state,zip,country,is_default&limit=1`
  );
  return rows[0] ?? null;
}

export async function ensureMemberDefaultAddressFromShopify(
  memberId: string
): Promise<MemberAddressRow | null> {
  const existingAddress = await getExistingDefaultAddress(memberId);
  if (existingAddress) return existingAddress;

  const [member] = await sbJson<
    {
      id: string;
      household_id: string | null;
      shopify_customer_id: string | null;
    }[]
  >(
    `/members?id=eq.${memberId}&select=id,household_id,shopify_customer_id&limit=1`
  );
  if (!member) return null;

  let shopifyCustomerId = member.shopify_customer_id;
  if (!shopifyCustomerId && member.household_id) {
    const [household] = await sbJson<
      { shopify_customer_id: string | null }[]
    >(
      `/households?id=eq.${member.household_id}&select=shopify_customer_id&limit=1`
    );
    shopifyCustomerId = household?.shopify_customer_id ?? null;
  }

  const shopifyAddress = await fetchShopifyDefaultAddress(shopifyCustomerId);
  if (!isUsableShopifyAddress(shopifyAddress)) return null;

  const now = new Date().toISOString();
  const [createdAddress] = await sbJson<MemberAddressRow[]>("/member_addresses", {
    method: "POST",
    body: JSON.stringify({
      member_id: memberId,
      address_type: "shipping",
      street: shopifyAddress.address1,
      street2: shopifyAddress.address2 ?? null,
      city: shopifyAddress.city,
      state: shopifyAddress.provinceCode ?? shopifyAddress.province ?? "",
      zip: shopifyAddress.zip,
      country: shopifyAddress.countryCodeV2 ?? "US",
      is_default: true,
      created_at: now,
      updated_at: now,
    }),
  });

  return createdAddress ?? null;
}
