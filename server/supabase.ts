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

async function sbFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  return fetch(url, {
    ...options,
    headers: {
      ...BASE_HEADERS,
      ...(options.headers ?? {}),
    },
  });
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
  const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
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
  primary_topic: string | null;
  bin_theme: string | null;
  description: string | null;
  subjects: string[] | null;
  publisher: string | null;
  published_date: string | null;
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export async function getBookTitles(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  age_group?: string;
}): Promise<{ data: BookTitle[]; total: number }> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  let qs = `?limit=${limit}&offset=${offset}&order=title.asc`;
  if (params?.search) {
    qs += `&or=(title.ilike.*${encodeURIComponent(params.search)}*,author.ilike.*${encodeURIComponent(params.search)}*)`;
  }
  if (params?.age_group) {
    qs += `&age_group=ilike.${encodeURIComponent(params.age_group)}`;
  }
  const res = await sbFetch(`/book_titles${qs}`, {
    headers: { Prefer: "count=exact" },
  });
  const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
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
  if (params?.age_group) qs += `&age_group=ilike.${encodeURIComponent(params.age_group)}`;
  const res = await sbFetch(`/book_copies${qs}`, {
    headers: { Prefer: "count=exact" },
  });
  const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
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
  // Get all copies with status counts
  const res = await sbFetch("/book_copies?select=status,age_group,bin_id&limit=2000", {
    headers: { Prefer: "count=exact" },
  });
  const copies: { status: string; age_group: string; bin_id: string | null }[] = await res.json();

  const summary = {
    total: copies.length,
    in_house: 0,
    in_transit: 0,
    returned: 0,
    by_age: {} as Record<string, number>,
    by_bin: {} as Record<string, number>,
    low_bins: [] as string[],
  };

  for (const c of copies) {
    if (c.status === "in_house") summary.in_house++;
    else if (c.status === "in_transit") summary.in_transit++;
    else if (c.status === "returned") summary.returned++;

    if (c.age_group) {
      summary.by_age[c.age_group] = (summary.by_age[c.age_group] ?? 0) + 1;
    }
    if (c.bin_id) {
      summary.by_bin[c.bin_id] = (summary.by_bin[c.bin_id] ?? 0) + 1;
    }
  }

  // Flag bins with < 3 copies
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
  let qs = `?limit=${limit}&order=created_at.desc`;
  if (params?.status) qs += `&status=eq.${params.status}`;
  const res = await sbFetch(`/shipments${qs}`, {
    headers: { Prefer: "count=exact" },
  });
  const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
  const data: Shipment[] = await res.json();
  return { data, total };
}

export async function getShipmentById(id: string): Promise<Shipment | null> {
  const res = await sbFetch(`/shipments?id=eq.${id}&limit=1`);
  const data: Shipment[] = await res.json();
  return data[0] ?? null;
}

export async function updateShipmentStatus(id: string, status: string, extra?: Partial<Shipment>): Promise<void> {
  await sbFetch(`/shipments?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, updated_at: new Date().toISOString(), ...extra }),
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

export async function getShipmentBooks(shipment_id: string): Promise<ShipmentBook[]> {
  const res = await sbFetch(`/shipment_books?shipment_id=eq.${shipment_id}&limit=20`);
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

export async function getMemberAddress(member_id: string): Promise<MemberAddress | null> {
  const res = await sbFetch(`/member_addresses?member_id=eq.${member_id}&is_default=eq.true&limit=1`);
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
  const res = await sbFetch("/bin_floor_config?active=eq.true&order=bin_code.asc&limit=100");
  return res.json();
}

// ─── Book Titles with Copy Counts ───────────────────────────────────────────

export interface BookTitleWithCopies extends BookTitle {
  copy_count: number;
  in_house_count: number;
  bin_id: string | null;
}

export async function getBookTitlesWithCopies(params?: {
  limit?: number;
  offset?: number;
  search?: string;
  age_group?: string;
}): Promise<{ data: BookTitleWithCopies[]; total: number }> {
  // Fetch book titles
  const titlesResult = await getBookTitles({ ...params, limit: params?.limit ?? 500 });

  if (titlesResult.data.length === 0) {
    return { data: [], total: 0 };
  }

  // Fetch all copies for these titles
  const titleIds = titlesResult.data.map((t) => t.id);
  const copiesRes = await sbFetch(
    `/book_copies?book_title_id=in.(${titleIds.join(",")})&select=book_title_id,status,bin_id&limit=2000`
  );
  const copies: { book_title_id: string; status: string; bin_id: string | null }[] = await copiesRes.json();

  // Build a map of title_id -> copy counts
  const copyMap: Record<string, { total: number; in_house: number; bin_id: string | null }> = {};
  for (const copy of copies) {
    if (!copyMap[copy.book_title_id]) {
      copyMap[copy.book_title_id] = { total: 0, in_house: 0, bin_id: null };
    }
    copyMap[copy.book_title_id].total++;
    if (copy.status === "in_house") {
      copyMap[copy.book_title_id].in_house++;
    }
    if (copy.bin_id && !copyMap[copy.book_title_id].bin_id) {
      copyMap[copy.book_title_id].bin_id = copy.bin_id;
    }
  }

  const data: BookTitleWithCopies[] = titlesResult.data.map((title) => ({
    ...title,
    copy_count: copyMap[title.id]?.total ?? 0,
    in_house_count: copyMap[title.id]?.in_house ?? 0,
    bin_id: copyMap[title.id]?.bin_id ?? null,
  }));

  return { data, total: titlesResult.total };
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const [membersRes, shipmentsRes, inventoryRes] = await Promise.all([
    sbFetch("/members?select=id,subscription_status&limit=500"),
    sbFetch("/shipments?select=id,status,scheduled_ship_date&limit=500"),
    getInventorySummary(),
  ]);

  const members: { id: string; subscription_status: string }[] = await membersRes.json();
  const shipments: { id: string; status: string; scheduled_ship_date: string | null }[] = await shipmentsRes.json();

  const today = new Date().toISOString().split("T")[0];

  const activeMembers = members.filter((m) => m.subscription_status === "active").length;
  const waitlistMembers = members.filter((m) => m.subscription_status === "waitlist").length;

  const toPick = shipments.filter((s) => s.status === "picking" || s.status === "pending").length;
  const toShip = shipments.filter((s) => s.status === "shipping" || s.status === "packed").length;
  const overdueShipments = shipments.filter(
    (s) =>
      (s.status === "shipping" || s.status === "pending" || s.status === "picking") &&
      s.scheduled_ship_date &&
      s.scheduled_ship_date < today
  ).length;
  const shippedToday = shipments.filter((s) => s.status === "shipped" && s.scheduled_ship_date === today).length;

  return {
    activeMembers,
    waitlistMembers,
    toPick,
    toShip,
    overdueShipments,
    shippedToday,
    inventory: inventoryRes,
  };
}
