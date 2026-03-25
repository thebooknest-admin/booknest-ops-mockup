/**
 * Picking Router — Batch pharmacy-style picking engine
 *
 * Workflow:
 * 1. picking.dailyOrders  → list all members due to ship today (or overdue)
 * 2. picking.suggestBooks → for a given member, return ranked book suggestions
 * 3. picking.confirmPicks → lock in book assignments (creates shipment + shipment_books rows)
 */

import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

async function sbFetch(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: { ...sbHeaders, ...(options.headers ?? {}) },
  });
}

/** How many books each tier gets per shipment */
const TIER_BOOK_COUNT: Record<string, number> = {
  "little-nest": 4,
  "story-nest": 8,
  "cozy-nest": 6,
};
const DEFAULT_BOOK_COUNT = 4;

/**
 * Maps interest_category names to bin_theme values used on book_titles.
 * A member's interest category is matched against a book's bin_theme.
 */
const INTEREST_TO_THEMES: Record<string, string[]> = {
  "Adventure & Exploration": ["adventure"],
  "Animals": ["animals", "nature"],
  "Space & Science": ["space", "science", "learn"],
  "Fantasy & Magic": ["fantasy", "magic"],
  "Feel-Good Stories": ["life", "feel-good", "home"],
  "Humor & Silly": ["humor", "silly"],
  "Nature & Earth": ["nature", "learn"],
  "Vehicles & Machines": ["vehicles", "machines", "learn"],
  "Arts & Creativity": ["arts", "creativity"],
  "Home & Family": ["life", "home", "family"],
};

/**
 * Maps topics_to_avoid values to bin_theme values that should be excluded.
 */
const AVOID_TO_THEMES: Record<string, string[]> = {
  "violence": ["violence", "war", "conflict"],
  "death": ["death", "grief"],
  "scary-monsters": ["horror", "scary", "monsters"],
  "loud-noises": [],
  "scary": ["horror", "scary"],
  "war": ["war", "conflict"],
  "grief": ["grief", "death"],
};

function getBookCount(tier: string | null): number {
  if (!tier) return DEFAULT_BOOK_COUNT;
  return TIER_BOOK_COUNT[tier] ?? DEFAULT_BOOK_COUNT;
}

function normalizeAgeGroup(ag: string | null): string {
  if (!ag) return "";
  return ag.toLowerCase().replace(/\s+/g, "_");
}

export const pickingRouter = router({
  /**
   * Returns all members due to ship today or overdue, with their profile info.
   * Excludes members who already have a shipment created for today.
   */
  dailyOrders: publicProcedure
    .input(
      z.object({
        date: z.string().optional(), // ISO date string YYYY-MM-DD, defaults to today
      }).optional()
    )
    .query(async ({ input }) => {
      const today = input?.date ?? new Date().toISOString().split("T")[0];

      // Get active members with next_ship_date <= today
      const membersRes = await sbFetch(
        `/members?subscription_status=eq.active&next_ship_date=lte.${today}&select=id,name,tier,age_group,next_ship_date,topics_to_avoid,email,shopify_customer_id&order=next_ship_date.asc&limit=200`
      );
      const members: any[] = await membersRes.json();

      if (!members.length) return { orders: [], date: today };

      // Get shipments already created today (to exclude members already processed)
      const todayStart = `${today}T00:00:00.000Z`;
      const todayEnd = `${today}T23:59:59.999Z`;
      const existingRes = await sbFetch(
        `/shipments?created_at=gte.${todayStart}&created_at=lte.${todayEnd}&select=member_id,status&limit=500`
      );
      const existingShipments: any[] = await existingRes.json();
      const alreadyShippedMemberIds = new Set(
        existingShipments
          .filter((s) => ["picking", "packing", "shipping", "shipped"].includes(s.status))
          .map((s) => s.member_id)
      );

      // Get member interests
      const memberIds = members.map((m) => m.id);
      const interestsRes = await sbFetch(
        `/member_interests?member_id=in.(${memberIds.join(",")})&select=member_id,interest_category&limit=500`
      );
      const interests: any[] = await interestsRes.json();
      const interestsByMember: Record<string, string[]> = {};
      for (const i of interests) {
        if (!interestsByMember[i.member_id]) interestsByMember[i.member_id] = [];
        interestsByMember[i.member_id].push(i.interest_category);
      }

      // Get member addresses
      const addressRes = await sbFetch(
        `/member_addresses?member_id=in.(${memberIds.join(",")})&is_primary=eq.true&select=member_id,street,street2,city,state,zip&limit=500`
      );
      const addresses: any[] = await addressRes.json();
      const addressByMember: Record<string, any> = {};
      for (const a of addresses) {
        addressByMember[a.member_id] = a;
      }

      const orders = members
        .filter((m) => !alreadyShippedMemberIds.has(m.id))
        .map((m) => ({
          member_id: m.id,
          member_name: m.name,
          tier: m.tier,
          age_group: m.age_group,
          next_ship_date: m.next_ship_date,
          topics_to_avoid: m.topics_to_avoid ?? [],
          interests: interestsByMember[m.id] ?? [],
          address: addressByMember[m.id] ?? null,
          books_needed: getBookCount(m.tier),
        }));

      return { orders, date: today };
    }),

  /**
   * Suggests ranked books for a specific member.
   * Scoring:
   *   +40 pts: age group match (required — all results are same age group)
   *   +30 pts per interest category match (bin_theme)
   *   -100 pts: excluded topic match (removes from results)
   *   -50 pts: already sent to this member before
   *   +10 pts: in_house_count > 2 (prefer books with more copies available)
   */
  suggestBooks: publicProcedure
    .input(
      z.object({
        member_id: z.string(),
        count: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ input }) => {
      // Load member profile
      const memberRes = await sbFetch(
        `/members?id=eq.${input.member_id}&select=id,name,tier,age_group,topics_to_avoid&limit=1`
      );
      const [member] = await memberRes.json();
      if (!member) throw new Error("Member not found");

      const booksNeeded = input.count ?? getBookCount(member.tier);
      const ageGroupNorm = normalizeAgeGroup(member.age_group);

      // Load member interests
      const interestsRes = await sbFetch(
        `/member_interests?member_id=eq.${input.member_id}&select=interest_category&limit=50`
      );
      const interests: any[] = await interestsRes.json();
      const memberInterests = interests.map((i) => i.interest_category);

      // Build set of themes to match and themes to avoid
      const matchThemes = new Set<string>();
      for (const cat of memberInterests) {
        for (const theme of INTEREST_TO_THEMES[cat] ?? []) {
          matchThemes.add(theme);
        }
      }

      const avoidThemes = new Set<string>();
      for (const topic of (member.topics_to_avoid ?? [])) {
        for (const theme of AVOID_TO_THEMES[topic] ?? []) {
          avoidThemes.add(theme);
        }
      }

      // Get books already sent to this member (via shipment_books → shipments)
      const sentRes = await sbFetch(
        `/shipments?member_id=eq.${input.member_id}&select=id&limit=200`
      );
      const sentShipments: any[] = await sentRes.json();
      const sentBookTitleIds = new Set<string>();
      if (sentShipments.length > 0) {
        const shipmentIds = sentShipments.map((s) => s.id);
        // Fetch in batches of 50
        for (let i = 0; i < shipmentIds.length; i += 50) {
          const batch = shipmentIds.slice(i, i + 50);
          const sbRes = await sbFetch(
            `/shipment_books?shipment_id=in.(${batch.join(",")})&select=book_title_id&limit=500`
          );
          const sbBooks: any[] = await sbRes.json();
          for (const b of sbBooks) sentBookTitleIds.add(b.book_title_id);
        }
      }

      // Get available in-house books for this age group
      // We fetch book_titles with in_house_count > 0 for the matching age group
      // Supabase doesn't support computed column filters directly, so we fetch all and filter
      const booksRes = await sbFetch(
        `/book_titles?age_group=ilike.${encodeURIComponent(member.age_group)}&select=id,title,author,cover_url,bin_theme,bin_id,age_group&limit=500`
      );
      const allBooks: any[] = await booksRes.json();

      // Get in-house copy counts for these books
      const titleIds = allBooks.map((b) => b.id);
      const inHouseCounts: Record<string, number> = {};
      if (titleIds.length > 0) {
        for (let i = 0; i < titleIds.length; i += 50) {
          const batch = titleIds.slice(i, i + 50);
          const copiesRes = await sbFetch(
            `/book_copies?book_title_id=in.(${batch.join(",")})&status=eq.in_house&select=book_title_id&limit=1000`
          );
          const copies: any[] = await copiesRes.json();
          for (const c of copies) {
            inHouseCounts[c.book_title_id] = (inHouseCounts[c.book_title_id] ?? 0) + 1;
          }
        }
      }

      // Score and rank books
      const scored = allBooks
        .filter((b) => (inHouseCounts[b.id] ?? 0) > 0) // must have in-house copies
        .filter((b) => !avoidThemes.has(b.bin_theme ?? "")) // exclude avoided themes
        .map((b) => {
          const alreadySent = sentBookTitleIds.has(b.id);
          const themeMatch = matchThemes.has(b.bin_theme ?? "");
          const inHouseCount = inHouseCounts[b.id] ?? 0;

          let score = 40; // base: age group already filtered
          if (themeMatch) score += 30;
          if (alreadySent) score -= 50;
          if (inHouseCount > 2) score += 10;

          // Build match reason string
          const reasons: string[] = [];
          if (themeMatch) {
            const matchedCats = memberInterests.filter((cat) =>
              (INTEREST_TO_THEMES[cat] ?? []).includes(b.bin_theme ?? "")
            );
            if (matchedCats.length > 0) reasons.push(`Matches: ${matchedCats.join(", ")}`);
          }
          if (alreadySent) reasons.push("Already sent");
          if (!themeMatch && !alreadySent) reasons.push("Variety pick");

          return {
            book_title_id: b.id,
            title: b.title,
            author: b.author,
            cover_url: b.cover_url,
            bin_theme: b.bin_theme,
            bin_id: b.bin_id,
            age_group: b.age_group,
            in_house_count: inHouseCount,
            score,
            already_sent: alreadySent,
            match_reason: reasons.join(" · "),
          };
        })
        .sort((a, b) => b.score - a.score);

      // Return top suggestions (2x requested count so user can swap)
      const suggestions = scored.slice(0, booksNeeded * 2);
      const recommended = scored.slice(0, booksNeeded);

      return {
        member_id: input.member_id,
        member_name: member.name,
        tier: member.tier,
        age_group: member.age_group,
        books_needed: booksNeeded,
        recommended,
        all_suggestions: suggestions,
      };
    }),

  /**
   * Confirms picks for all orders in a batch.
   * Creates a shipment + shipment_books rows for each member.
   * Returns the created shipment IDs.
   */
  confirmPicks: publicProcedure
    .input(
      z.object({
        picks: z.array(
          z.object({
            member_id: z.string(),
            book_title_ids: z.array(z.string()),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const results: { member_id: string; shipment_id: string; shipment_number: string }[] = [];

      for (const pick of input.picks) {
        const { member_id, book_title_ids } = pick;

        // Get member info
        const memberRes = await sbFetch(
          `/members?id=eq.${member_id}&select=id,name,tier,age_group&limit=1`
        );
        const [member] = await memberRes.json();
        if (!member) continue;

        // Get member's primary address
        const addrRes = await sbFetch(
          `/member_addresses?member_id=eq.${member_id}&is_primary=eq.true&select=id&limit=1`
        );
        const [address] = await addrRes.json();

        // Generate shipment number
        const countRes = await sbFetch(
          `/shipments?select=id&limit=1&order=created_at.desc`
        );
        const allShipments: any[] = await countRes.json();
        const shipNum = `SHP-${String(allShipments.length + 1).padStart(6, "0")}`;

        // Create shipment
        const shipmentRes = await sbFetch("/shipments", {
          method: "POST",
          body: JSON.stringify({
            member_id,
            status: "picking",
            shipment_number: shipNum,
            address_id: address?.id ?? null,
            scheduled_ship_date: new Date().toISOString().split("T")[0],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
        });
        const [shipment] = await shipmentRes.json();
        if (!shipment?.id) continue;

        // For each book title, find an in-house copy and assign it
        for (const titleId of book_title_ids) {
          // Find an available in-house copy
          const copyRes = await sbFetch(
            `/book_copies?book_title_id=eq.${titleId}&status=eq.in_house&select=id&limit=1&order=received_at.asc`
          );
          const [copy] = await copyRes.json();
          if (!copy) continue;

          // Reserve the copy (mark as in_transit)
          await sbFetch(`/book_copies?id=eq.${copy.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "in_transit",
              updated_at: new Date().toISOString(),
            }),
            headers: { Prefer: "return=minimal" },
          });

          // Create shipment_books record
          await sbFetch("/shipment_books", {
            method: "POST",
            body: JSON.stringify({
              shipment_id: shipment.id,
              book_title_id: titleId,
              book_copy_id: copy.id,
              status: "selected",
              selection_reason: "Batch pick",
              created_at: new Date().toISOString(),
            }),
            headers: { Prefer: "return=minimal" },
          });
        }

        // Update member's next_ship_date (advance by ~4 weeks)
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 28);
        await sbFetch(`/members?id=eq.${member_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            next_ship_date: nextDate.toISOString().split("T")[0],
            updated_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });

        results.push({
          member_id,
          shipment_id: shipment.id,
          shipment_number: shipNum,
        });
      }

      return { success: true, shipments: results };
    }),

  /**
   * Returns a master pick list for all confirmed picks in a batch.
   * Groups books by bin location for efficient warehouse walking.
   */
  batchPickList: publicProcedure
    .input(z.object({ shipment_ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.shipment_ids.length) return { bins: [], total_books: 0 };

      // Get all shipment_books for these shipments
      const sbRes = await sbFetch(
        `/shipment_books?shipment_id=in.(${input.shipment_ids.join(",")})&select=shipment_id,book_title_id,book_copy_id&limit=500`
      );
      const sbBooks: any[] = await sbRes.json();

      // Get book title details
      const titleIds = Array.from(new Set(sbBooks.map((b) => b.book_title_id)));
      const titleMap: Record<string, any> = {};
      if (titleIds.length > 0) {
        for (let i = 0; i < titleIds.length; i += 50) {
          const batch = titleIds.slice(i, i + 50);
          const tr = await sbFetch(
            `/book_titles?id=in.(${batch.join(",")})&select=id,title,author,bin_id&limit=200`
          );
          const titles: any[] = await tr.json();
          for (const t of titles) titleMap[t.id] = t;
        }
      }

      // Get copy SKUs
      const copyIds = Array.from(new Set(sbBooks.map((b) => b.book_copy_id).filter(Boolean)));
      const copyMap: Record<string, any> = {};
      if (copyIds.length > 0) {
        for (let i = 0; i < copyIds.length; i += 50) {
          const batch = copyIds.slice(i, i + 50);
          const cr = await sbFetch(
            `/book_copies?id=in.(${batch.join(",")})&select=id,sku&limit=200`
          );
          const copies: any[] = await cr.json();
          for (const c of copies) copyMap[c.id] = c;
        }
      }

      // Get shipment → member mapping
      const shipRes = await sbFetch(
        `/shipments?id=in.(${input.shipment_ids.join(",")})&select=id,member_id&limit=200`
      );
      const shipments: any[] = await shipRes.json();
      const memberIds = Array.from(new Set(shipments.map((s) => s.member_id)));
      const memberMap: Record<string, string> = {};
      if (memberIds.length > 0) {
        const mr = await sbFetch(
          `/members?id=in.(${memberIds.join(",")})&select=id,name&limit=200`
        );
        const members: any[] = await mr.json();
        for (const m of members) memberMap[m.id] = m.name;
      }
      const shipmentMemberMap: Record<string, string> = {};
      for (const s of shipments) {
        shipmentMemberMap[s.id] = memberMap[s.member_id] ?? "Unknown";
      }

      // Group by bin
      const binMap: Record<string, { bin_id: string; items: any[] }> = {};
      for (const sb of sbBooks) {
        const title = titleMap[sb.book_title_id];
        if (!title) continue;
        const binId = title.bin_id ?? "UNKNOWN";
        if (!binMap[binId]) binMap[binId] = { bin_id: binId, items: [] };
        binMap[binId].items.push({
          book_title_id: sb.book_title_id,
          book_copy_id: sb.book_copy_id,
          sku: copyMap[sb.book_copy_id]?.sku ?? null,
          title: title.title,
          author: title.author,
          shipment_id: sb.shipment_id,
          member_name: shipmentMemberMap[sb.shipment_id] ?? "Unknown",
        });
      }

      const bins = Object.values(binMap).sort((a, b) => a.bin_id.localeCompare(b.bin_id));
      return { bins, total_books: sbBooks.length };
    }),
});
