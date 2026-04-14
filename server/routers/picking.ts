/**
 * Picking Router — Batch pharmacy-style picking engine
 *
 * Workflow:
 * 1. picking.dailyOrders  → list all members with pending shipments due today or earlier
 * 2. picking.suggestBooks → for a given member, return ranked book suggestions
 * 3. picking.confirmPicks → lock in book assignments (updates existing shipment + creates shipment_books rows)
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
 */
const INTEREST_TO_THEMES: Record<string, string[]> = {
  "Brave & Bold": ["adventure"],
  "Heart & Home": ["life"],
  "Curious Minds": ["learn"],
  "Wild Things": ["nature"],
  "All About Me": ["identity"],
  "Old Favorites": ["classics"],
  "Celebrate!": ["seasonal"],
  "Giggle Worthy": ["humor"],
};

/**
 * Maps topics_to_avoid values to bin_theme values that should be excluded.
 */
const AVOID_TO_THEMES: Record<string, string[]> = {
  "Scary / Horror": ["horror", "scary"],
  "Violence": ["violence", "war", "conflict"],
  "Death & Grief": ["death", "grief"],
  "Divorce": ["divorce"],
  "Bathroom Humor": ["bathroom-humor"],
  "War": ["war", "conflict"],
  "Bullying": ["bullying"],
  "Religious Content": ["religious"],
  "LGBTQ+ themes": ["lgbtq"],
  "Romance": ["romance"],
  "Scary Animals": ["scary-animals"],
  "Clowns": ["clowns"],
  "Spiders / Bugs": ["bugs", "spiders"],
  "Ghosts / Supernatural": ["supernatural", "ghosts"],
  "Peer Pressure": ["peer-pressure"],
  "Illness": ["illness"],
  "Political Topics": ["political"],
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
   * Returns all members with pending shipments due today or earlier.
   */
  dailyOrders: publicProcedure
    .input(
      z.object({
        date: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const today = input?.date ?? new Date().toISOString().split("T")[0];

      // Get all pending shipments scheduled for today or earlier
     const shipmentsRes = await sbFetch(
  `/shipments?status=eq.pending&shipment_type=eq.outbound&select=id,member_id,scheduled_ship_date&order=scheduled_ship_date.asc&limit=200`
);
      const pendingShipments: any[] = await shipmentsRes.json();

      if (!pendingShipments.length) return { orders: [], date: today };

      const memberIds = [...new Set(pendingShipments.map((s) => s.member_id))];

      // Get member profiles
      const membersRes = await sbFetch(
        `/members?id=in.(${memberIds.join(",")})&welcome_form_completed=eq.true&select=id,name,tier,age_group,next_ship_date,topics_to_avoid,email,subscription_status&limit=200`
      );
      const members: any[] = await membersRes.json();
      const memberMap: Record<string, any> = {};
      for (const m of members) memberMap[m.id] = m;

      // Get member interests
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
        `/member_addresses?member_id=in.(${memberIds.join(",")})&is_default=eq.true&select=member_id,street,street2,city,state,zip&limit=500`
      );
      const addresses: any[] = await addressRes.json();
      const addressByMember: Record<string, any> = {};
      for (const a of addresses) addressByMember[a.member_id] = a;

      const orders = pendingShipments
        .filter((s) => memberMap[s.member_id])
        .map((s) => {
          const m = memberMap[s.member_id];
          const isOverdue = s.scheduled_ship_date < today;
          return {
            member_id: m.id,
            member_name: m.name,
            tier: m.tier,
            age_group: m.age_group,
            next_ship_date: s.scheduled_ship_date,
            topics_to_avoid: m.topics_to_avoid ?? [],
            interests: interestsByMember[m.id] ?? [],
            address: addressByMember[m.id] ?? null,
            books_needed: getBookCount(m.tier),
            shipment_id: s.id,
            is_overdue: isOverdue,
          };
        });

      return { orders, date: today };
    }),

  /**
   * Suggests ranked books for a specific member.
   */
  suggestBooks: publicProcedure
    .input(
      z.object({
        member_id: z.string(),
        count: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ input }) => {
      const memberRes = await sbFetch(
        `/members?id=eq.${input.member_id}&select=id,name,tier,age_group,topics_to_avoid&limit=1`
      );
      const [member] = await memberRes.json();
      if (!member) throw new Error("Member not found");

      const booksNeeded = input.count ?? getBookCount(member.tier);

      const interestsRes = await sbFetch(
        `/member_interests?member_id=eq.${input.member_id}&select=interest_category&limit=50`
      );
      const interests: any[] = await interestsRes.json();
      const memberInterests = interests.map((i) => i.interest_category);

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

      // Get books already sent to this member
      const sentRes = await sbFetch(
        `/shipments?member_id=eq.${input.member_id}&select=id&limit=200`
      );
      const sentShipments: any[] = await sentRes.json();
      const sentBookTitleIds = new Set<string>();
      if (sentShipments.length > 0) {
        const shipmentIds = sentShipments.map((s) => s.id);
        for (let i = 0; i < shipmentIds.length; i += 50) {
          const batch = shipmentIds.slice(i, i + 50);
          const sbRes = await sbFetch(
            `/shipment_books?shipment_id=in.(${batch.join(",")})&select=book_title_id&limit=500`
          );
          const sbBooks: any[] = await sbRes.json();
          for (const b of sbBooks) sentBookTitleIds.add(b.book_title_id);
        }
      }

      // Get available books for this age group
      const booksRes = await sbFetch(
        `/book_titles?age_group=eq.${encodeURIComponent(member.age_group)}&select=id,title,author,cover_url,bin_theme,age_group&limit=500`
      );
      const allBooks: any[] = await booksRes.json();

      // Get in-house copy counts
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
        .filter((b) => (inHouseCounts[b.id] ?? 0) > 0)
        .filter((b) => !avoidThemes.has(b.bin_theme ?? ""))
        .map((b) => {
          const alreadySent = sentBookTitleIds.has(b.id);
          const themeMatch = matchThemes.has(b.bin_theme ?? "");
          const inHouseCount = inHouseCounts[b.id] ?? 0;

          let score = 40;
          if (themeMatch) score += 30;
          if (alreadySent) score -= 50;
          if (inHouseCount > 2) score += 10;

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
            age_group: b.age_group,
            in_house_count: inHouseCount,
            score,
            already_sent: alreadySent,
            match_reason: reasons.join(" · "),
          };
        })
        .sort((a, b) => b.score - a.score);

      const recommended = scored.slice(0, booksNeeded);
      const allSuggestions = scored.slice(0, booksNeeded * 2);

      // For each recommended book, fetch one specific in-house copy (SKU + bin)
      const recommendedWithCopies = await Promise.all(
        recommended.map(async (book) => {
          const copyRes = await sbFetch(
            `/book_copies?book_title_id=eq.${book.book_title_id}&status=eq.in_house&select=id,sku,bin_id&limit=1&order=received_at.asc`
          );
          const [copy] = await copyRes.json();
          return {
            ...book,
            copy_id: copy?.id ?? null,
            sku: copy?.sku ?? null,
            bin_id: copy?.bin_id ?? null,
          };
        })
      );

      // Also fetch copy info for all suggestions (for swap dropdown)
      const allSuggestionsWithCopies = await Promise.all(
        allSuggestions.map(async (book) => {
          const copyRes = await sbFetch(
            `/book_copies?book_title_id=eq.${book.book_title_id}&status=eq.in_house&select=id,sku,bin_id&limit=1&order=received_at.asc`
          );
          const [copy] = await copyRes.json();
          return {
            ...book,
            copy_id: copy?.id ?? null,
            sku: copy?.sku ?? null,
            bin_id: copy?.bin_id ?? null,
          };
        })
      );

      return {
        member_id: input.member_id,
        member_name: member.name,
        tier: member.tier,
        age_group: member.age_group,
        books_needed: booksNeeded,
        recommended: recommendedWithCopies,
        all_suggestions: allSuggestionsWithCopies,
      };
    }),

  /**
   * Confirms picks — updates existing pending shipment instead of creating a new one.
   */
  confirmPicks: publicProcedure
    .input(
      z.object({
        picks: z.array(
          z.object({
            member_id: z.string(),
            shipment_id: z.string(),
            book_title_ids: z.array(z.string()),
            copy_ids: z.array(z.string()), // specific copy IDs from scan confirmation
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const results: { member_id: string; shipment_id: string; shipment_number: string }[] = [];

      for (const pick of input.picks) {
        const { member_id, shipment_id, book_title_ids, copy_ids } = pick;

        const shipmentRes = await sbFetch(
          `/shipments?id=eq.${shipment_id}&select=id,shipment_number,member_id&limit=1`
        );
        const [shipment] = await shipmentRes.json();
        if (!shipment) continue;

        const addrRes = await sbFetch(
          `/member_addresses?member_id=eq.${member_id}&is_default=eq.true&select=id&limit=1`
        );
        const [address] = await addrRes.json();

        await sbFetch(`/shipments?id=eq.${shipment_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "picking",
            address_id: address?.id ?? null,
            updated_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });

        for (let i = 0; i < book_title_ids.length; i++) {
          const titleId = book_title_ids[i];
          const copyId = copy_ids[i];
          if (!titleId || !copyId) continue;

          await sbFetch(`/book_copies?id=eq.${copyId}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "in_transit",
              updated_at: new Date().toISOString(),
            }),
            headers: { Prefer: "return=minimal" },
          });

          await sbFetch("/shipment_books", {
            method: "POST",
            body: JSON.stringify({
              shipment_id: shipment_id,
              book_title_id: titleId,
              book_copy_id: copyId,
              status: "selected",
              selection_reason: "Batch pick",
              created_at: new Date().toISOString(),
            }),
            headers: { Prefer: "return=minimal" },
          });
        }

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
          shipment_number: shipment.shipment_number,
        });
      }

      return { success: true, shipments: results };
    }),

  /**
   * Returns a master pick list for all confirmed picks in a batch.
   */
  batchPickList: publicProcedure
    .input(z.object({ shipment_ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.shipment_ids.length) return { bins: [], total_books: 0 };

      const sbRes = await sbFetch(
        `/shipment_books?shipment_id=in.(${input.shipment_ids.join(",")})&select=shipment_id,book_title_id,book_copy_id&limit=500`
      );
      const sbBooks: any[] = await sbRes.json();

      const titleIds = Array.from(new Set(sbBooks.map((b) => b.book_title_id)));
      const titleMap: Record<string, any> = {};
      if (titleIds.length > 0) {
        for (let i = 0; i < titleIds.length; i += 50) {
          const batch = titleIds.slice(i, i + 50);
          const tr = await sbFetch(
            `/book_titles?id=in.(${batch.join(",")})&select=id,title,author,bin_id,cover_url&limit=200`
          );
          const titles: any[] = await tr.json();
          for (const t of titles) titleMap[t.id] = t;
        }
      }

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
          cover_url: title.cover_url ?? null,
          shipment_id: sb.shipment_id,
          member_name: shipmentMemberMap[sb.shipment_id] ?? "Unknown",
        });
      }

      const bins = Object.values(binMap).sort((a, b) => a.bin_id.localeCompare(b.bin_id));
      return { bins, total_books: sbBooks.length };
    }),
});