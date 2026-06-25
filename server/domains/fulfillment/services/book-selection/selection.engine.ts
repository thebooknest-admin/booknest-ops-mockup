import { formatInventoryLocation } from "@shared/booknest";
import { sbFetch, sbJson } from "../../../../supabase";
import {
  buildNoteProfile,
  getAvoidMatches,
  scoreNoteMatch,
} from "../../../../book-matching";
import type {
  AvailableCopyWithTitle,
  BookSelectionMember,
  PickingSelectionResult,
  SuggestBooksResult,
  SuggestedBook,
} from "./selection.types";
import { getSelectionAgeGroup } from "./scoring/age-score";
import { buildPriorTitleSet } from "./scoring/duplicate-score";
import {
  buildAvoidThemeSet,
  buildInterestThemeSet,
  getMatchedInterestCategories,
} from "./scoring/interest-score";
import { selectWithThemeVariety } from "./scoring/randomness-score";
import { isSeasonalBookAllowed } from "./scoring/seasonal-score";

const TIER_BOOK_COUNT: Record<string, number> = {
  "little-nest": 4,
  "cozy-nest": 6,
  "story-nest": 8,
};
const DEFAULT_BOOK_COUNT = 4;

export function getBookCount(tier: string | null, booksPerBox?: number | null): number {
  if (booksPerBox) return booksPerBox;
  if (!tier) return DEFAULT_BOOK_COUNT;
  const normalized = tier.toLowerCase().replace(/\s+/g, "-");
  return TIER_BOOK_COUNT[normalized] ?? DEFAULT_BOOK_COUNT;
}

async function fetchTagMap(copies: AvailableCopyWithTitle[]): Promise<Record<string, string>> {
  const tagIds = Array.from(
    new Set(copies.flatMap(copy => copy.book_titles?.tag_ids ?? []))
  );
  const tagMap: Record<string, string> = {};
  if (tagIds.length === 0) return tagMap;

  for (let i = 0; i < tagIds.length; i += 50) {
    const batch = tagIds.slice(i, i + 50);
    const tags = await sbJson<{ id: string; tag: string }[]>(
      `/book_sorting_tags?id=in.(${batch.join(",")})&select=id,tag&limit=1000`
    );
    for (const tag of tags) tagMap[tag.id] = tag.tag;
  }

  return tagMap;
}

function getCopyTags(copy: AvailableCopyWithTitle, tagMap: Record<string, string>): string[] {
  return (copy.book_titles?.tag_ids ?? [])
    .map(tagId => tagMap[tagId])
    .filter(Boolean);
}

async function getSentTitleIdsFromShipments(memberId: string): Promise<Set<string>> {
  const sentRes = await sbFetch(
    `/shipments?member_id=eq.${memberId}&select=id&limit=200`
  );
  const sentShipments: any[] = await sentRes.json();
  const sentBookTitleIds = new Set<string>();
  if (sentShipments.length === 0) return sentBookTitleIds;

  const shipmentIds = sentShipments.map((s) => s.id);
  for (let i = 0; i < shipmentIds.length; i += 50) {
    const batch = shipmentIds.slice(i, i + 50);
    const sbRes = await sbFetch(
      `/shipment_books?shipment_id=in.(${batch.join(",")})&select=book_title_id&limit=500`
    );
    const sbBooks: any[] = await sbRes.json();
    for (const b of sbBooks) sentBookTitleIds.add(b.book_title_id);
  }

  return sentBookTitleIds;
}

export async function suggestBooksForMember(input: {
  member_id: string;
  count?: number;
}): Promise<SuggestBooksResult> {
  const memberRes = await sbFetch(
    `/members?id=eq.${input.member_id}&select=id,name,tier,age_group,topics_to_avoid,notes,books_per_box&limit=1`
  );
  const [member] = await memberRes.json();
  if (!member) throw new Error("Member not found");

  const booksNeeded = input.count ?? getBookCount(member.tier, member.books_per_box);
  const memberAgeGroup = getSelectionAgeGroup(member.age_group);

  const interestsRes = await sbFetch(
    `/member_interests?member_id=eq.${input.member_id}&select=interest_category&limit=50`
  );
  const interests: any[] = await interestsRes.json();
  const memberInterests = interests.map((i) => i.interest_category);

  const matchThemes = buildInterestThemeSet(memberInterests);
  const avoidThemes = buildAvoidThemeSet(member.topics_to_avoid);
  const noteProfile = buildNoteProfile(member.notes);
  const sentBookTitleIds = await getSentTitleIdsFromShipments(input.member_id);

  const copiesRes = await sbFetch(
    `/book_copies?status=eq.in_house&age_group=eq.${encodeURIComponent(String(memberAgeGroup))}&select=id,sku,bin_id,section,book_title_id,age_group,book_titles(id,title,author,cover_url,bin_theme,tag_ids)&limit=1000&order=received_at.asc`
  );
  const availableCopies: AvailableCopyWithTitle[] = await copiesRes.json();
  const tagMap = await fetchTagMap(availableCopies);

  const inHouseCounts: Record<string, number> = {};
  const copyByTitle = new Map<string, AvailableCopyWithTitle>();
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
    title: copy.book_titles?.title ?? null,
    author: copy.book_titles?.author ?? null,
    cover_url: copy.book_titles?.cover_url ?? null,
    bin_theme: copy.book_titles?.bin_theme ?? null,
    tags: getCopyTags(copy, tagMap),
    age_group: copy.age_group,
    copy_id: copy.id,
    sku: copy.sku,
    bin_id: copy.bin_id,
    section: copy.section,
    location: formatInventoryLocation(copy.bin_id, copy.section),
  }));

  const scored: SuggestedBook[] = allBooks
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
        const matchedCats = getMatchedInterestCategories({
          interests: memberInterests,
          theme: b.bin_theme,
        });
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

  const primaryPool = scored;
  const allSuggestionsWithCopies = primaryPool;
  const fallbackStartIndex = primaryPool.length;

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
}

export async function selectBooksForPickingOrder(input: {
  member: BookSelectionMember;
}): Promise<PickingSelectionResult> {
  const member = input.member;
  const booksNeeded = getBookCount(member.tier, member.books_per_box);
  const memberAgeGroup = getSelectionAgeGroup(member.age_group);
  if (!memberAgeGroup) {
    throw new Error("Member needs an age group before creating a new bundle.");
  }

  const [interests, priorHistory, priorShipments] = await Promise.all([
    sbJson<{ interest_category: string | null }[]>(
      `/member_interests?member_id=eq.${member.id}&select=interest_category&limit=100`
    ),
    sbJson<{ book_title_id: string | null }[]>(
      `/member_book_history?member_id=eq.${member.id}&select=book_title_id&limit=1000`
    ),
    sbJson<{ id: string }[]>(
      `/shipments?member_id=eq.${member.id}&select=id&limit=500`
    ),
  ]);

  const activeShipments = await sbJson<{ id: string }[]>(
    "/shipments?shipment_type=eq.outbound&status=in.(picking,packing,packed)&select=id&limit=1000"
  );
  const activeAssignedCopyIds = new Set<string>();
  if (activeShipments.length > 0) {
    for (let i = 0; i < activeShipments.length; i += 50) {
      const batch = activeShipments.slice(i, i + 50);
      const rows = await sbJson<{ book_copy_id: string | null }[]>(
        `/shipment_books?shipment_id=in.(${batch.map(s => s.id).join(",")})&book_copy_id=not.is.null&select=book_copy_id&limit=1000`
      );
      for (const row of rows) {
        if (row.book_copy_id) activeAssignedCopyIds.add(row.book_copy_id);
      }
    }
  }

  const priorTitleIds = buildPriorTitleSet(priorHistory);
  if (priorShipments.length > 0) {
    for (let i = 0; i < priorShipments.length; i += 50) {
      const batch = priorShipments.slice(i, i + 50);
      const rows = await sbJson<{ book_title_id: string | null }[]>(
        `/shipment_books?shipment_id=in.(${batch.map(s => s.id).join(",")})&select=book_title_id&limit=1000`
      );
      for (const row of rows) {
        if (row.book_title_id) priorTitleIds.add(row.book_title_id);
      }
    }
  }

  const memberInterests = interests
    .map(row => row.interest_category)
    .filter(Boolean) as string[];
  const matchThemes = buildInterestThemeSet(memberInterests);
  const avoidThemes = buildAvoidThemeSet(member.topics_to_avoid);
  const noteProfile = buildNoteProfile(member.notes);

  const availableCopies = await sbJson<AvailableCopyWithTitle[]>(
    `/book_copies?status=eq.in_house&age_group=eq.${encodeURIComponent(memberAgeGroup)}&select=id,sku,bin_id,section,book_title_id,book_titles(id,title,author,bin_theme,tag_ids)&limit=1000&order=received_at.asc`
  );

  const tagMap = await fetchTagMap(availableCopies);
  const bestCopyByTitle = new Map<string, AvailableCopyWithTitle>();
  for (const copy of availableCopies) {
    if (activeAssignedCopyIds.has(copy.id)) continue;
    if (!copy.book_title_id || priorTitleIds.has(copy.book_title_id)) continue;
    const theme = copy.book_titles?.bin_theme ?? "";
    if (avoidThemes.has(theme)) continue;
    const tags = getCopyTags(copy, tagMap);
    const avoidMatches = getAvoidMatches(member.topics_to_avoid, {
      title: copy.book_titles?.title,
      author: copy.book_titles?.author,
      theme,
      tags,
    });
    if (avoidMatches.length > 0) continue;
    const noteMatch = scoreNoteMatch({
      profile: noteProfile,
      title: copy.book_titles?.title,
      author: copy.book_titles?.author,
      theme,
      tags,
    });
    if (noteMatch.excluded) continue;
    if (
      !isSeasonalBookAllowed({
        title: copy.book_titles?.title,
        tags,
        referenceDate: new Date(),
      })
    ) {
      continue;
    }
    if (!bestCopyByTitle.has(copy.book_title_id)) {
      bestCopyByTitle.set(copy.book_title_id, copy);
    }
  }

  const noteMatchByCopyId = new Map<string, { score: number; reasons: string[] }>();
  const scoredCopies = Array.from(bestCopyByTitle.values())
    .map(copy => {
      const theme = copy.book_titles?.bin_theme ?? "";
      const tags = getCopyTags(copy, tagMap);
      const noteMatch = scoreNoteMatch({
        profile: noteProfile,
        title: copy.book_titles?.title,
        author: copy.book_titles?.author,
        theme,
        tags,
      });
      noteMatchByCopyId.set(copy.id, {
        score: noteMatch.score,
        reasons: noteMatch.reasons,
      });
      return {
        item: copy,
        theme: theme || "Uncategorized",
        score:
          40 +
          (matchThemes.has(theme) ? 30 : 0) +
          (copy.bin_id ? 5 : 0) +
          noteMatch.score,
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    selectedCopies: selectWithThemeVariety(scoredCopies, booksNeeded),
    noteMatchByCopyId,
    booksNeeded,
  };
}
