/**
 * Picking Router — Scan-based picking engine
 *
 * Status flow:
 * picking → packing → shipped
 *
 * 1. picking.dailyOrders  → list all shipments in 'picking' status
 * 2. picking.suggestBooks → ranked book suggestions with SKU + bin location
 * 3. picking.confirmPicks → scan confirmed, move shipment to 'packing'
 */

import { z } from "zod";
import { formatInventoryLocation, normalizeAgeGroup } from "@shared/booknest";
import { operatorProcedure, router } from "../../_core/trpc";
import { sbFetch, sbJson, sbVoid } from "../../supabase";
import { ensureMemberDefaultAddressFromShopify } from "../../shopify-address";
import {
  AVOID_TO_THEMES,
  INTEREST_TO_THEMES,
  buildNoteProfile,
  getAvoidMatches,
  scoreNoteMatch,
} from "../../book-matching";

const TIER_BOOK_COUNT: Record<string, number> = {
  "little-nest": 4,
  "cozy-nest": 6,
  "story-nest": 8,
};
const DEFAULT_BOOK_COUNT = 4;

// ✅ FIXED: normalize tier string (handles "Cozy Nest", "cozy-nest", etc.)
// Also accepts books_per_box from DB as the source of truth when available
type HolidayWindow = {
  keywords: string[];
  month: number;
  day: number;
  beforeDays: number;
  afterDays: number;
};

const HOLIDAY_WINDOWS: HolidayWindow[] = [
  { keywords: ["christmas", "santa", "reindeer", "nativity", "noel"], month: 12, day: 25, beforeDays: 45, afterDays: 7 },
  { keywords: ["halloween", "trick", "pumpkin", "ghost", "spooky"], month: 10, day: 31, beforeDays: 45, afterDays: 3 },
  { keywords: ["thanksgiving", "turkey", "pilgrim"], month: 11, day: 26, beforeDays: 28, afterDays: 3 },
  { keywords: ["easter", "bunny", "egg hunt"], month: 4, day: 5, beforeDays: 35, afterDays: 7 },
  { keywords: ["valentine", "valentine's day"], month: 2, day: 14, beforeDays: 28, afterDays: 3 },
];

function daysBetweenDates(a: Date, b: Date): number {
  const aUtc = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUtc = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((aUtc - bUtc) / 86_400_000);
}

function isDateInHolidayWindow(date: Date, window: HolidayWindow): boolean {
  for (const year of [date.getFullYear() - 1, date.getFullYear(), date.getFullYear() + 1]) {
    const holiday = new Date(year, window.month - 1, window.day);
    const delta = daysBetweenDates(date, holiday);
    if (delta >= -window.beforeDays && delta <= window.afterDays) return true;
  }
  return false;
}

function isSeasonalBookAllowed(title: string | null | undefined): boolean {
  const normalizedTitle = String(title ?? "").toLowerCase();
  const matchedWindow = HOLIDAY_WINDOWS.find(window =>
    window.keywords.some(keyword => normalizedTitle.includes(keyword))
  );
  if (!matchedWindow) return true;
  return isDateInHolidayWindow(new Date(), matchedWindow);
}

function getBookCount(tier: string | null, booksPerBox?: number | null): number {
  if (booksPerBox) return booksPerBox;
  if (!tier) return DEFAULT_BOOK_COUNT;
  const normalized = tier.toLowerCase().replace(/\s+/g, "-");
  return TIER_BOOK_COUNT[normalized] ?? DEFAULT_BOOK_COUNT;
}

function getBirthdayBoxInfo(birthday: string | null, shipmentDate: string | null) {
  if (!birthday || !shipmentDate) return null;

  const birthDate = new Date(birthday);
  const shipDate = new Date(shipmentDate);

  const birthdayThisYear = new Date(
    shipDate.getFullYear(),
    birthDate.getMonth(),
    birthDate.getDate()
  );

  const windowStart = new Date(shipDate);
  windowStart.setDate(shipDate.getDate() - 7);

  const windowEnd = new Date(shipDate);
  windowEnd.setDate(shipDate.getDate() + 7);

  if (birthdayThisYear >= windowStart && birthdayThisYear <= windowEnd) {
    return {
      is_birthday_box: true,
      birthday: birthdayThisYear.toISOString().split("T")[0],
      message: "Add birthday book if available + birthday gift",
    };
  }

  return null;
}

export const pickingRouter = router({
  /**
   * Returns all shipments in 'picking' status.
   */
  dailyOrders: operatorProcedure
    .input(
      z.object({
        date: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const today = input?.date ?? new Date().toISOString().split("T")[0];

      // Get all shipments in picking status
      const shipmentsRes = await sbFetch(
  `/shipments?status=eq.picking&shipment_type=eq.outbound&select=id,member_id,scheduled_ship_date&order=scheduled_ship_date.asc&limit=200`
);
      const pendingShipments: any[] = await shipmentsRes.json();

      if (!pendingShipments.length) return { orders: [], date: today };

      const memberIds = [...new Set(pendingShipments.map((s) => s.member_id))];

      // ✅ FIXED: added books_per_box to select
      const membersRes = await sbFetch(
        `/members?id=in.(${memberIds.join(",")})&welcome_form_completed=eq.true&select=id,name,tier,age_group,birthday,next_ship_date,topics_to_avoid,notes,email,subscription_status,books_per_box&limit=200`
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
          const birthdayBox = getBirthdayBoxInfo(
  m.birthday ?? null,
  s.scheduled_ship_date ?? null
);
          return {
            member_id: m.id,
            member_name: m.name,
            tier: m.tier,
            age_group: m.age_group,
            next_ship_date: s.scheduled_ship_date,
            topics_to_avoid: m.topics_to_avoid ?? [],
            interests: interestsByMember[m.id] ?? [],
            notes: m.notes ?? null,
            address: addressByMember[m.id] ?? null,
            books_needed: getBookCount(m.tier, m.books_per_box), // ✅ FIXED
            shipment_id: s.id,
            birthday_box: birthdayBox,
            is_overdue: isOverdue,
          };
        });

      return { orders, date: today };
    }),

  /**
   * Suggests ranked books for a specific member with SKU + bin location.
   */
  suggestBooks: operatorProcedure
    .input(
      z.object({
        member_id: z.string(),
        count: z.number().min(1).max(20).optional(),
      })
    )
    .query(async ({ input }) => {
      // ✅ FIXED: added books_per_box to select
      const memberRes = await sbFetch(
        `/members?id=eq.${input.member_id}&select=id,name,tier,age_group,topics_to_avoid,notes,books_per_box&limit=1`
      );
      const [member] = await memberRes.json();
      if (!member) throw new Error("Member not found");

      // ✅ FIXED: pass books_per_box as source of truth
      const booksNeeded = input.count ?? getBookCount(member.tier, member.books_per_box);
      const memberAgeGroup =
        normalizeAgeGroup(member.age_group) ?? member.age_group;

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
      const noteProfile = buildNoteProfile(member.notes);

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

      // Get available copies for this age group. Copies are the source of truth
      // because different editions of the same title can belong to different ages.
      const copiesRes = await sbFetch(
        `/book_copies?status=eq.in_house&age_group=eq.${encodeURIComponent(memberAgeGroup)}&select=id,sku,bin_id,section,book_title_id,age_group,book_titles(id,title,author,cover_url,bin_theme,tag_ids)&limit=1000&order=received_at.asc`
      );
      const availableCopies: any[] = await copiesRes.json();
      const tagIds = Array.from(
        new Set(availableCopies.flatMap(copy => copy.book_titles?.tag_ids ?? []))
      );
      const tagMap: Record<string, string> = {};
      if (tagIds.length > 0) {
        for (let i = 0; i < tagIds.length; i += 50) {
          const batch = tagIds.slice(i, i + 50);
          const tags = await sbJson<{ id: string; tag: string }[]>(
            `/book_sorting_tags?id=in.(${batch.join(",")})&select=id,tag&limit=1000`
          );
          for (const tag of tags) tagMap[tag.id] = tag.tag;
        }
      }

      // Get in-house copy counts by title for this age group only.
      const inHouseCounts: Record<string, number> = {};
      const copyByTitle = new Map<string, any>();
      for (const copy of availableCopies) {
        if (!copy.book_title_id || !copy.book_titles) continue;
        inHouseCounts[copy.book_title_id] =
          (inHouseCounts[copy.book_title_id] ?? 0) + 1;
        if (!copyByTitle.has(copy.book_title_id)) {
          copyByTitle.set(copy.book_title_id, copy);
        }
      }
      const allBooks = Array.from(copyByTitle.values()).map(copy => ({
        book_title_id: copy.book_title_id,
        title: copy.book_titles.title,
        author: copy.book_titles.author,
        cover_url: copy.book_titles.cover_url,
        bin_theme: copy.book_titles.bin_theme,
        tags: (copy.book_titles.tag_ids ?? [])
          .map((tagId: string) => tagMap[tagId])
          .filter(Boolean),
        age_group: copy.age_group,
        copy_id: copy.id,
        sku: copy.sku,
        bin_id: copy.bin_id,
        section: copy.section,
        location: formatInventoryLocation(copy.bin_id, copy.section),
      }));

      // Score and rank books
      const scored = allBooks
        .filter((b) => !avoidThemes.has(b.bin_theme ?? ""))
        .filter((b) => {
          const avoidMatches = getAvoidMatches(member.topics_to_avoid, {
            title: b.title,
            author: b.author,
            theme: b.bin_theme,
            tags: b.tags,
          });
          return avoidMatches.length === 0;
        })
        .filter((b) => {
          const noteMatch = scoreNoteMatch({
            profile: noteProfile,
            title: b.title,
            author: b.author,
            theme: b.bin_theme,
            tags: b.tags,
          });
          return !noteMatch.excluded;
        })
        .map((b) => {
          const alreadySent = sentBookTitleIds.has(b.book_title_id);
          const themeMatch = matchThemes.has(b.bin_theme ?? "");
          const inHouseCount = inHouseCounts[b.book_title_id] ?? 0;
          const noteMatch = scoreNoteMatch({
            profile: noteProfile,
            title: b.title,
            author: b.author,
            theme: b.bin_theme,
            tags: b.tags,
          });

          let score = 40;
          if (themeMatch) score += 30;
          if (alreadySent) score -= 50;
          if (inHouseCount > 2) score += 10;
          score += noteMatch.score;

          const reasons: string[] = [];
          if (themeMatch) {
            const matchedCats = memberInterests.filter((cat) =>
              (INTEREST_TO_THEMES[cat] ?? []).includes(b.bin_theme ?? "")
            );
            if (matchedCats.length > 0) reasons.push(`Matches: ${matchedCats.join(", ")}`);
          }
          reasons.push(...noteMatch.reasons);
          if (alreadySent) reasons.push("Already sent");
          if (!themeMatch && !alreadySent) reasons.push("Variety pick");

          return {
            book_title_id: b.book_title_id,
            title: b.title,
            author: b.author,
            cover_url: b.cover_url,
            bin_theme: b.bin_theme,
            age_group: b.age_group,
            copy_id: b.copy_id,
            sku: b.sku,
            bin_id: b.bin_id,
            in_house_count: inHouseCount,
            score,
            already_sent: alreadySent,
            match_reason: reasons.join(" · "),
          };
        })
        .sort((a, b) => b.score - a.score);

      // Primary pool — all ranked books in age group
      const primaryPool = scored;

      // Fallback pool — books from other age-adjacent groups
      // when primary pool is small (future-proofing for low inventory)
      const allSuggestions = primaryPool;
      const fallbackStartIndex = primaryPool.length;

      const allSuggestionsWithCopies = allSuggestions;

      return {
        member_id: input.member_id,
        member_name: member.name,
        tier: member.tier,
        age_group: member.age_group,
        books_needed: booksNeeded,
        recommended: allSuggestionsWithCopies.slice(0, booksNeeded),
        all_suggestions: allSuggestionsWithCopies,
        fallback_start_index: fallbackStartIndex,
      };
    }),

      /**
   * Returns the existing assigned pick list for a shipment.
   */
  getShipmentPickList: operatorProcedure
    .input(
      z.object({
        shipment_id: z.string(),
      })
    )
    .query(async ({ input }) => {
      const res = await sbFetch(
        `/rpc/get_shipment_pick_list`,
        {
          method: "POST",
          body: JSON.stringify({
            p_shipment_id: input.shipment_id,
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`Failed to get shipment pick list: ${await res.text()}`);
      }

      const rows: any[] = await res.json();
      const copyIds = Array.from(
        new Set(rows.map(row => row.book_copy_id).filter(Boolean))
      );
      if (copyIds.length === 0) return rows;

      const copyRows = await sbJson<
        { id: string; bin_id: string | null; section: string | null }[]
      >(
        `/book_copies?id=in.(${copyIds.join(",")})&select=id,bin_id,section&limit=200`
      );
      const copyMap = new Map(copyRows.map(copy => [copy.id, copy]));

      return rows.map(row => {
        const copy = copyMap.get(row.book_copy_id);
        const location = formatInventoryLocation(
          copy?.bin_id ?? row.bin_id,
          copy?.section
        );
        return {
          ...row,
          bin_id: location ?? row.bin_id,
          section: copy?.section ?? null,
          location,
        };
      });
    }),


  /**
   * Swaps one assigned shipment book for a new alternate.
   */
  swapShipmentBook: operatorProcedure
    .input(
      z.object({
        shipment_id: z.string(),
        member_id: z.string(),
        old_book_copy_id: z.string(),
        books_needed: z.number().min(1).max(50).default(30),
      })
    )
    .mutation(async ({ input }) => {
      const assignedRows = await sbJson<
        { id: string; book_copy_id: string | null; book_title_id: string | null }[]
      >(
        `/shipment_books?shipment_id=eq.${input.shipment_id}&select=id,book_copy_id,book_title_id&limit=100`
      );
      const assignedCopyIds = new Set(
        assignedRows.map((row) => row.book_copy_id).filter(Boolean)
      );
      const oldShipmentBook = assignedRows.find(
        (row) => row.book_copy_id === input.old_book_copy_id
      );

      if (!oldShipmentBook) {
        throw new Error("The selected book is no longer assigned to this shipment.");
      }

      const candidateRes = await sbFetch(`/rpc/select_books_for_shipment`, {
        method: "POST",
        body: JSON.stringify({
          p_member_id: input.member_id,
          p_shipment_id: input.shipment_id,
          p_books_needed: input.books_needed,
        }),
      });

      if (!candidateRes.ok) {
        throw new Error(`Failed to select alternate book: ${await candidateRes.text()}`);
      }

      const candidates: any[] = await candidateRes.json();

      const replacement = candidates.find((book) => {
        return (
          book.book_copy_id &&
          !assignedCopyIds.has(book.book_copy_id) &&
          isSeasonalBookAllowed(book.title)
        );
      });

      if (!replacement) {
        throw new Error("No alternate book found.");
      }

      const patchRes = await sbFetch(
        `/shipment_books?id=eq.${oldShipmentBook.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            book_copy_id: replacement.book_copy_id,
            book_title_id: replacement.book_title_id,
            status: "ready_for_picking",
            match_score: replacement.match_score,
            picked_at: null,
            scanned_at: null,
          }),
          headers: { Prefer: "return=representation" },
        }
      );

      if (!patchRes.ok) {
        throw new Error(`Failed to swap shipment book: ${await patchRes.text()}`);
      }

      const [updated] = await patchRes.json();

//
// Release old copy back to inventory
//
await sbVoid(
  `/book_copies?id=eq.${input.old_book_copy_id}`,
  {
    method: "PATCH",
    body: JSON.stringify({
      status: "in_house",
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  }
);

//
// Reserve new copy
//
await sbVoid(
  `/book_copies?id=eq.${replacement.book_copy_id}`,
  {
    method: "PATCH",
    body: JSON.stringify({
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=minimal" },
  }
);

//
// Audit trail
//
await sbVoid(`/shipment_book_swaps`, {
  method: "POST",
  body: JSON.stringify({
    shipment_id: input.shipment_id,
    old_book_copy_id: input.old_book_copy_id,
    old_book_title_id: oldShipmentBook.book_title_id,
    new_book_copy_id: replacement.book_copy_id,
    new_book_title_id: replacement.book_title_id,
    reason: "Manual picker swap",
  }),
  headers: { Prefer: "return=minimal" },
});

return updated;
    }),

  /**
   * Confirms scanned picks — moves shipment to 'packing' status.
   */
  confirmPicks: operatorProcedure
    .input(
      z.object({
        picks: z.array(
          z.object({
            member_id: z.string(),
            shipment_id: z.string(),
            book_title_ids: z.array(z.string()),
            copy_ids: z.array(z.string()),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const results: { member_id: string; shipment_id: string; shipment_number: string }[] = [];

      for (const pick of input.picks) {
        const { member_id, shipment_id, book_title_ids, copy_ids } = pick;
        const now = new Date().toISOString();

        if (book_title_ids.length !== copy_ids.length) {
          throw new Error("Each scanned copy must have a matching title.");
        }

        const uniqueCopyIds = Array.from(new Set(copy_ids.filter(Boolean)));
        if (uniqueCopyIds.length !== copy_ids.length) {
          throw new Error("A copy was scanned more than once for this shipment.");
        }

        // Get the existing shipment
        const [shipment] = await sbJson<
          { id: string; shipment_number: string; member_id: string; status: string }[]
        >(
          `/shipments?id=eq.${shipment_id}&select=id,shipment_number,member_id,status&limit=1`
        );
        if (!shipment) throw new Error("Shipment not found.");
        if (shipment.member_id !== member_id) {
          throw new Error("Shipment does not belong to the selected member.");
        }
        if (shipment.status !== "picking") {
          throw new Error(`Shipment is already ${shipment.status}; refresh the queue.`);
        }

        const assignedRows = await sbJson<
          {
            id: string;
            book_title_id: string | null;
            book_copy_id: string | null;
            status: string | null;
          }[]
        >(
          `/shipment_books?shipment_id=eq.${shipment_id}&select=id,book_title_id,book_copy_id,status&limit=200`
        );

        if (assignedRows.length === 0) {
          throw new Error("Shipment has no assigned books to pick.");
        }

        if (uniqueCopyIds.length !== assignedRows.length) {
          throw new Error("Scan every assigned book before completing the order.");
        }

        const copies = await sbJson<
          { id: string; book_title_id: string; status: string }[]
        >(
          `/book_copies?id=in.(${uniqueCopyIds.join(",")})&select=id,book_title_id,status&limit=200`
        );
        const copyMap = new Map(copies.map((copy) => [copy.id, copy]));

        if (copies.length !== uniqueCopyIds.length) {
          throw new Error("One or more scanned copies no longer exists.");
        }

        let address: { id: string } | null = null;
        try {
          address = await ensureMemberDefaultAddressFromShopify(member_id);
        } catch (error) {
          console.warn(
            `[picking.confirmPicks] Could not sync Shopify address for member ${member_id}:`,
            error
          );
        }

        const usedShipmentBookIds = new Set<string>();
        for (let i = 0; i < book_title_ids.length; i++) {
          const titleId = book_title_ids[i];
          const copyId = copy_ids[i];
          if (!titleId || !copyId) continue;

          const copy = copyMap.get(copyId);
          if (!copy) throw new Error(`Scanned copy ${copyId} was not found.`);
          if (copy.book_title_id !== titleId) {
            throw new Error("A scanned copy does not match its assigned title.");
          }
          if (!["in_house", "reserved"].includes(copy.status)) {
            throw new Error("A scanned copy is not available for picking. Refresh and try again.");
          }

          const shipmentBook = assignedRows.find(
            (row) =>
              !usedShipmentBookIds.has(row.id) &&
              (row.book_copy_id === copyId ||
                (!row.book_copy_id && row.book_title_id === titleId))
          );

          if (!shipmentBook) {
            throw new Error("A scanned copy is not assigned to this shipment.");
          }

          usedShipmentBookIds.add(shipmentBook.id);

          await sbVoid(`/shipment_books?id=eq.${shipmentBook.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              book_copy_id: copyId,
              book_title_id: titleId,
              status: "picked",
              picked_at: now,
              scanned_at: now,
            }),
            headers: { Prefer: "return=minimal" },
          });
        }

        await sbVoid(`/shipments?id=eq.${shipment_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "packing",
            address_id: address?.id ?? null,
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });

        // Update member's next_ship_date (advance by ~4 weeks)
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 28);
        await sbVoid(`/members?id=eq.${member_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            next_ship_date: nextDate.toISOString().split("T")[0],
            updated_at: now,
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
   * Returns a master pick list for confirmed shipments grouped by bin.
   */
  batchPickList: operatorProcedure
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
            `/book_titles?id=in.(${batch.join(",")})&select=id,title,author,cover_url&limit=200`
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
            `/book_copies?id=in.(${batch.join(",")})&select=id,sku,bin_id,section&limit=200`
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
        const binId =
          formatInventoryLocation(
            copyMap[sb.book_copy_id]?.bin_id,
            copyMap[sb.book_copy_id]?.section
          ) ?? "UNKNOWN";
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
