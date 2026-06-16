/**
 * Supabase REST API client for BookNest Ops
 * Uses the anon key for read/write operations allowed by RLS policies.
 * All calls are server-side to keep the key secure.
 */

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const BASE_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

export async function sbFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1${path}`;

  return fetch(url, {
    ...options,
    headers: {
      ...BASE_HEADERS,
      ...(options.headers ?? {}),
    },
  });
}

export async function sbJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await sbFetch(path, options);

  if (!res.ok) {
    throw new Error(
      `Supabase request failed for ${path}: ${res.status} ${res.statusText} - ${await res.text()}`
    );
  }

  return (await res.json()) as T;
}

export async function sbVoid(
  path: string,
  options: RequestInit = {}
): Promise<void> {
  const res = await sbFetch(path, options);

  if (!res.ok) {
    throw new Error(
      `Supabase request failed for ${path}: ${res.status} ${res.statusText} - ${await res.text()}`
    );
  }
}

// ─── Members ──────────────────────────────────────────────────────────────────

export interface Member {
  id: string;
  name: string;
  tier: string;
  age_group: string;
  topics_to_avoid: string[] | null;
  email: string;
  phone: string | null;
  subscription_status: string;
  next_ship_date: string | null;
  shopify_customer_id: string | null;
  is_founding_flock: boolean;
  is_vip: boolean;
  welcome_form_completed: boolean;
  created_at: string;
  updated_at: string;
}

export async function getMembers(): Promise<{ data: Member[]; total: number }> {
  const res = await sbFetch("/members?order=name.asc&limit=200", {
    headers: { Prefer: "count=exact" },
  });

  const total = parseInt(
    res.headers.get("content-range")?.split("/")[1] ?? "0",
    10
  );

  const data: Member[] = await res.json();

  return { data, total };
}

export async function getMemberById(id: string): Promise<Member | null> {
  const res = await sbFetch(`/members?id=eq.${id}&limit=1`);
  const data: Member[] = await res.json();

  return data[0] ?? null;
}

// ─── Book Titles ──────────────────────────────────────────────────────────────

export interface BookTitle {
  id: string;
  isbn: string | null;
  title: string;
  author: string;
  cover_url: string | null;
  age_group: string | null;
  suggested_age_tier: string | null;
  primary_topic: string | null;
  bin_theme: string | null;
  tag_ids: string[] | null;
  description: string | null;
  subjects: string[] | null;
  publisher: string | null;
  published_date: string | null;
  page_count: number | null;
  classification_version: string | null;
  created_at: string;
  updated_at: string;
}

export interface BookTag {
  id: string;
  bin_theme: string;
  tag: string;
}

export async function getBookTitles(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  age_group?: string;
}): Promise<{ data: BookTitle[]; total: number }> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;

  let qs =
    `?limit=${limit}` +
    `&offset=${offset}` +
    `&order=title.asc` +
    `&select=id,isbn,title,author,cover_url,age_group,suggested_age_tier,primary_topic,bin_theme,tag_ids,description,subjects,publisher,published_date,page_count,classification_version,created_at,updated_at`;

  if (params?.search) {
    qs += `&or=(title.ilike.*${encodeURIComponent(
      params.search
    )}*,author.ilike.*${encodeURIComponent(params.search)}*)`;
  }

  if (params?.age_group) {
    qs += `&age_group=ilike.${encodeURIComponent(params.age_group)}`;
  }

  const res = await sbFetch(`/book_titles${qs}`, {
    headers: { Prefer: "count=exact" },
  });

  const total = parseInt(
    res.headers.get("content-range")?.split("/")[1] ?? "0",
    10
  );

  const data: BookTitle[] = await res.json();

  return { data, total };
}

// ─── Book Copies ──────────────────────────────────────────────────────────────

export interface BookCopy {
  id: string;
  sku: string;
  book_title_id: string;
  isbn: string | null;
  age_group: string;
  bin: string | null;
  bin_id: string | null;
  section: string | null;
  status: string;
  condition: string | null;
  label_status: string;
  received_at: string;
  created_at: string;
  updated_at: string;
}

export async function getBookCopies(params?: {
  status?: string;
  bin_id?: string;
  age_group?: string;
  limit?: number;
}): Promise<{ data: BookCopy[]; total: number }> {
  const limit = params?.limit ?? 100;

  let qs = `?limit=${limit}&order=received_at.desc`;

  if (params?.status) qs += `&status=eq.${params.status}`;
  if (params?.bin_id) qs += `&bin_id=eq.${encodeURIComponent(params.bin_id)}`;
  if (params?.age_group) {
    qs += `&age_group=ilike.${encodeURIComponent(params.age_group)}`;
  }

  const res = await sbFetch(`/book_copies${qs}`, {
    headers: { Prefer: "count=exact" },
  });

  const total = parseInt(
    res.headers.get("content-range")?.split("/")[1] ?? "0",
    10
  );

  const data: BookCopy[] = await res.json();

  return { data, total };
}

export async function getInventorySummary(): Promise<{
  total: number;
  in_house: number;
  in_transit: number;
  returned: number;
  by_age: Record<string, number>;
  by_bin: Record<string, number>;
  low_bins: string[];
}> {
  const res = await sbFetch(
    "/book_copies?select=status,age_group,bin_id,section&limit=2000",
    {
      headers: { Prefer: "count=exact" },
    }
  );

  const copies: {
    status: string;
    age_group: string;
    bin_id: string | null;
    section: string | null;
  }[] = await res.json();

  const nonInventoryStatuses = new Set([
    "donated",
    "donated_lfl",
    "lost",
    "withdrawn",
  ]);

  const summary = {
    total: copies.length,
    in_house: 0,
    in_transit: 0,
    returned: 0,
    by_age: {} as Record<string, number>,
    by_bin: {} as Record<string, number>,
    low_bins: [] as string[],
  };

  for (const copy of copies) {
    if (copy.status === "in_house") summary.in_house++;
    else if (copy.status === "in_transit") summary.in_transit++;
    else if (copy.status === "returned") summary.returned++;

    if (copy.age_group) {
      summary.by_age[copy.age_group] =
        (summary.by_age[copy.age_group] ?? 0) + 1;
    }

    if (copy.bin_id && !nonInventoryStatuses.has(copy.status)) {
      summary.by_bin[copy.bin_id] = (summary.by_bin[copy.bin_id] ?? 0) + 1;
    }
  }

  summary.low_bins = Object.entries(summary.by_bin)
    .filter(([, count]) => count < 3)
    .map(([bin]) => bin);

  return summary;
}

// ─── Shipments ────────────────────────────────────────────────────────────────

export interface Shipment {
  id: string;
  member_id: string;
  order_number: string | null;
  shipment_number: string | null;
  status: string;
  scheduled_ship_date: string | null;
  actual_ship_date: string | null;
  tracking_number: string | null;
  carrier: string | null;
  label_url: string | null;
  address_id: string | null;
  shipment_type: string;
  created_at: string;
  updated_at: string;
}

export async function getShipments(params?: {
  status?: string;
  limit?: number;
}): Promise<{ data: Shipment[]; total: number }> {
  const limit = params?.limit ?? 50;

  let qs =
    `?limit=${limit}` +
    `&order=created_at.desc` +
    `&select=id,member_id,order_number,shipment_number,status,scheduled_ship_date,actual_ship_date,tracking_number,carrier,label_url,address_id,shipment_type,created_at,updated_at`;

  if (params?.status) qs += `&status=eq.${params.status}`;

  const res = await sbFetch(`/shipments${qs}`, {
    headers: { Prefer: "count=exact" },
  });

  const total = parseInt(
    res.headers.get("content-range")?.split("/")[1] ?? "0",
    10
  );

  const data: Shipment[] = await res.json();

  return { data, total };
}

export async function getShipmentById(id: string): Promise<Shipment | null> {
  const res = await sbFetch(`/shipments?id=eq.${id}&limit=1`);
  const data: Shipment[] = await res.json();

  return data[0] ?? null;
}

export async function updateShipmentStatus(
  id: string,
  status: string,
  extra?: Partial<Shipment>
): Promise<void> {
  await sbFetch(`/shipments?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      updated_at: new Date().toISOString(),
      ...extra,
    }),
    headers: { Prefer: "return=minimal" },
  });
}

// ─── Shipment Books ───────────────────────────────────────────────────────────

export interface ShipmentBook {
  id: string;
  shipment_id: string;
  book_title_id: string;
  book_copy_id: string | null;
  status: string;
  picked_at: string | null;
  scanned_at: string | null;
  selection_reason: string | null;
  match_score: number | null;
  created_at: string;
}

export async function getShipmentBooks(
  shipment_id: string
): Promise<ShipmentBook[]> {
  const res = await sbFetch(
    `/shipment_books?shipment_id=eq.${shipment_id}&limit=20`
  );

  return res.json();
}

// ─── Member Addresses ─────────────────────────────────────────────────────────

export interface MemberAddress {
  id: string;
  member_id: string;
  address_type: string;
  street: string;
  street2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  is_default: boolean;
}

export async function getMemberAddress(
  member_id: string
): Promise<MemberAddress | null> {
  const res = await sbFetch(
    `/member_addresses?member_id=eq.${member_id}&is_default=eq.true&limit=1`
  );

  const data: MemberAddress[] = await res.json();

  return data[0] ?? null;
}

// ─── Bin Floor Config ─────────────────────────────────────────────────────────

export interface BinConfig {
  id: string;
  bin_code: string;
  min_bin_floor: number;
  active: boolean;
  note: string | null;
}

export async function getBinConfigs(): Promise<BinConfig[]> {
  const res = await sbFetch(
    "/bin_floor_config?active=eq.true&order=bin_code.asc&limit=100"
  );

  return res.json();
}

// ─── Book Titles with Copy Counts ─────────────────────────────────────────────

export interface BookTitleWithCopies extends BookTitle {
  tags: BookTag[];
  copy_count: number;
  in_house_count: number;
  in_transit_count: number;
  pending_qc_count: number;
  pending_label_count: number;
  pending_stock_count: number;
  returned_count: number;
  restricted_count: number;
  bin_id: string | null;
  section: string | null;
  sku_min: string | null;
  sku_max: string | null;
}

export async function getBookTitlesWithCopies(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  age_group?: string;
}): Promise<{
  data: BookTitleWithCopies[];
  total: number;
  catalog_only_count: number;
}> {
  const titlesResult = await getBookTitles({
    ...params,
    limit: params?.limit ?? 5000,
  });

  if (titlesResult.data.length === 0) {
    return { data: [], total: 0, catalog_only_count: 0 };
  }

  const titleIds = titlesResult.data.map(title => title.id);
  const BATCH_SIZE = 50;

  const allCopies: {
    book_title_id: string;
    status: string;
    label_status: string | null;
    bin_id: string | null;
    section: string | null;
    sku: string | null;
  }[] = [];

  for (let i = 0; i < titleIds.length; i += BATCH_SIZE) {
    const batch = titleIds.slice(i, i + BATCH_SIZE);

    const copiesRes = await sbFetch(
      `/book_copies?book_title_id=in.(${batch.join(
        ","
      )})&select=book_title_id,status,label_status,bin_id,section,sku&limit=2000`
    );

    if (copiesRes.ok) {
      const batchCopies: {
        book_title_id: string;
        status: string;
        label_status: string | null;
        bin_id: string | null;
        section: string | null;
        sku: string | null;
      }[] = await copiesRes.json();

      allCopies.push(...batchCopies);
    }
  }

  const nonInventoryStatuses = new Set([
    "donated",
    "donated_lfl",
    "lost",
    "withdrawn",
  ]);

  const copyMap: Record<
    string,
    {
      total: number;
      in_house: number;
      in_transit: number;
      pending_qc: number;
      pending_label: number;
      pending_stock: number;
      returned: number;
      restricted: number;
      bin_id: string | null;
      section: string | null;
      skus: string[];
    }
  > = {};

  for (const copy of allCopies) {
    if (!copyMap[copy.book_title_id]) {
      copyMap[copy.book_title_id] = {
        total: 0,
        in_house: 0,
        in_transit: 0,
        pending_qc: 0,
        pending_label: 0,
        pending_stock: 0,
        returned: 0,
        restricted: 0,
        bin_id: null,
        section: null,
        skus: [],
      };
    }

    const entry = copyMap[copy.book_title_id];

    if (!nonInventoryStatuses.has(copy.status)) {
      entry.total++;
    }

    if (copy.status === "in_house") entry.in_house++;
    else if (copy.status === "in_transit") entry.in_transit++;
    else if (copy.status === "pending_qc") entry.pending_qc++;
    else if (copy.status === "pending_stock") entry.pending_stock++;
    else if (copy.status === "returned") entry.returned++;
    else if (copy.status === "restricted") entry.restricted++;

    if (
      copy.label_status === "pending" &&
      ["in_house", "pending_label"].includes(copy.status)
    ) {
      entry.pending_label++;
    }

    if (copy.bin_id && !entry.bin_id) {
      entry.bin_id = copy.bin_id;
    }
    if (copy.section && !entry.section) {
      entry.section = copy.section;
    }

    if (copy.sku) {
      entry.skus.push(copy.sku);
    }
  }

  const allTagIds = Array.from(
    new Set(
      titlesResult.data
        .flatMap(title => title.tag_ids ?? [])
        .filter((id): id is string => Boolean(id))
    )
  );

  let tagMap: Record<string, BookTag> = {};

  if (allTagIds.length > 0) {
    const tagRes = await sbFetch(
      `/book_sorting_tags?id=in.(${allTagIds.join(
        ","
      )})&select=id,bin_theme,tag&limit=1000`
    );

    if (tagRes.ok) {
      const tags: BookTag[] = await tagRes.json();

      tagMap = Object.fromEntries(tags.map(tag => [tag.id, tag]));
    }
  }

  const data: BookTitleWithCopies[] = titlesResult.data.map(title => {
    const entry = copyMap[title.id];
    const skus = entry?.skus.sort() ?? [];

    return {
      ...title,
      tags: (title.tag_ids ?? [])
        .map(id => tagMap[id])
        .filter((tag): tag is BookTag => Boolean(tag)),
      copy_count: entry?.total ?? 0,
      in_house_count: entry?.in_house ?? 0,
      in_transit_count: entry?.in_transit ?? 0,
      pending_qc_count: entry?.pending_qc ?? 0,
      pending_label_count: entry?.pending_label ?? 0,
      pending_stock_count: entry?.pending_stock ?? 0,
      returned_count: entry?.returned ?? 0,
      restricted_count: entry?.restricted ?? 0,
      bin_id: entry?.bin_id ?? null,
      section: entry?.section ?? null,
      sku_min: skus.length > 0 ? skus[0] : null,
      sku_max: skus.length > 1 ? skus[skus.length - 1] : null,
    };
  });

  const filteredData = data.filter(book => (book.copy_count ?? 0) > 0);
  const catalogOnlyCount = data.length - filteredData.length;

  return {
    data: filteredData,
    total: filteredData.length,
    catalog_only_count: catalogOnlyCount,
  };
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const [
    membersRes,
    shipmentsRes,
    inventoryRes,
    returnsRes,
    qcRes,
    labelsRes,
    stockRes,
  ] = await Promise.all([
    sbFetch("/members?select=id,subscription_status&limit=500"),
    sbFetch(
      "/shipments?shipment_type=eq.outbound&select=id,status,scheduled_ship_date,actual_ship_date&limit=500"
    ),
    getInventorySummary(),
    sbFetch("/returns?select=id&status=in.(requested,in_transit,receiving)", {
      headers: { Prefer: "count=exact", Range: "0-0" },
    }),
    sbFetch("/book_copies?status=eq.pending_qc&select=id", {
      headers: { Prefer: "count=exact", Range: "0-0" },
    }),
    sbFetch(
      "/book_copies?label_status=eq.pending&status=in.(in_house,pending_label)&select=id",
      { headers: { Prefer: "count=exact", Range: "0-0" } }
    ),
    sbFetch("/book_copies?status=eq.pending_stock&select=id", {
      headers: { Prefer: "count=exact", Range: "0-0" },
    }),
  ]);

  const getCount = (res: Response) =>
    parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);

  const pendingReturns = getCount(returnsRes);
  const pendingQc = getCount(qcRes);
  const pendingLabels = getCount(labelsRes);
  const pendingStock = getCount(stockRes);

  const members: { id: string; subscription_status: string }[] =
    await membersRes.json();

  const shipments: {
    id: string;
    status: string;
    scheduled_ship_date: string | null;
    actual_ship_date: string | null;
  }[] = await shipmentsRes.json();

  const today = new Date().toISOString().split("T")[0];

  const activeMembers = members.filter(
    member => member.subscription_status === "active"
  ).length;

  const waitlistMembers = members.filter(
    member => member.subscription_status === "waitlist"
  ).length;

  const toPick = shipments.filter(
    shipment => shipment.status === "picking"
  ).length;

  const toPack = shipments.filter(
    shipment => shipment.status === "packing"
  ).length;

  const toShip = shipments.filter(
    shipment => shipment.status === "packed"
  ).length;

  const overdueShipments = shipments.filter(
    shipment =>
      (shipment.status === "picking" ||
        shipment.status === "packing" ||
        shipment.status === "packed") &&
      shipment.scheduled_ship_date &&
      shipment.scheduled_ship_date < today
  ).length;

  const shippedToday = shipments.filter(
    shipment =>
      shipment.status === "shipped" && shipment.actual_ship_date === today
  ).length;

  const totalOrders = shipments.length;

  return {
    activeMembers,
    waitlistMembers,
    toPick,
    toPack,
    toShip,
    overdueShipments,
    shippedToday,
    totalOrders,
    pendingReturns,
    pendingSwaps: pendingReturns,
    pendingQc,
    pendingLabels,
    pendingStock,
    inventory: inventoryRes,
  };
}
