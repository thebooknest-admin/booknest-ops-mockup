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
  SelectionExclusion,
  SelectionMetadata,
  SelectionReason,
  SuggestBooksResult,
  SuggestedBook,
} from "./selection.types";
import type { BookSelectionPolicy } from "./selection.policy";
import type { SelectionEngineConfig } from "./selection.config";
import { resolveBookSelectionPolicy } from "./selection.policy";
import { resolveSelectionEngineConfig } from "./selection.config";
import { createSelectionReason, selectionReasonCodes } from "./selection.explanations";
import { getSelectionAgeGroup } from "./scoring/age-score";
import { buildPriorTitleSet } from "./scoring/duplicate-score";
import {
  buildAvoidThemeSet,
  buildInterestThemeSet,
  getMatchedInterestCategories,
} from "./scoring/interest-score";
import { isSeasonalBookAllowed } from "./scoring/seasonal-score";

const TIER_BOOK_COUNT: Record<string, number> = {
  "little-nest": 4,
  "cozy-nest": 6,
  "story-nest": 8,
};
const DEFAULT_BOOK_COUNT = 4;

const SELECTION_ENGINE_VERSION = "book-selection-v2";
const SELECTION_POLICY_VERSION = "2026-06-selection-v2";

const BOOK_TITLE_SELECTION_FIELDS =
  "id,title,author,cover_url,bin_theme,tag_ids,suggested_age_tier,page_count";

type PriorTitleMetadata = {
  id: string;
  title: string | null;
  author: string | null;
  age_group?: string | null;
  suggested_age_tier?: string | null;
  page_count?: number | null;
};

type SeriesInfo = {
  key: string;
  label: string;
  number: number | null;
};

type Candidate = {
  copy: AvailableCopyWithTitle;
  tags: string[];
  theme: string;
  authorKey: string;
  series: SeriesInfo | null;
  isInterestMatch: boolean;
  isSeriesContinuation: boolean;
  inventoryBonus: number;
  readingProgressionBonus: number;
  noteMatch: { score: number; reasons: string[] };
  baseScore: number;
  finalScore: number;
  scoreBreakdown: Record<string, number>;
  authorDiversityAdjustment: number;
  themeDiversityAdjustment: number;
  reasons: SelectionReason[];
};

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

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthor(author: string | null | undefined): string {
  return normalizeText(author) || "unknown-author";
}

function normalizeTheme(theme: string | null | undefined): string {
  return normalizeText(theme) || "uncategorized";
}

function analyzeSeries(title: string | null | undefined): SeriesInfo | null {
  const raw = String(title ?? "").trim();
  if (!raw) return null;

  const patterns: RegExp[] = [
    /^(.*?)\s*(?:\(|\[)?\s*(?:#|book\s+|volume\s+|vol\.?\s+)(\d{1,2})(?:\)|\])?(?:\s*[:\-–—].*)?$/i,
    /^(.*?)\s+\((?:book\s+)?(\d{1,2})\)$/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (!match) continue;
    const label = match[1].replace(/[\s:,-]+$/g, "").trim();
    const number = Number(match[2]);
    if (!label || !Number.isFinite(number)) continue;
    return { key: normalizeText(label), label, number };
  }

  return null;
}

function addExclusion(
  exclusions: SelectionExclusion[],
  code: SelectionExclusion["code"],
  copy: AvailableCopyWithTitle,
  detail?: string
) {
  exclusions.push({
    code,
    copy_id: copy.id,
    book_title_id: copy.book_title_id,
    title: copy.book_titles?.title ?? null,
    detail,
  });
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

async function fetchPriorTitleMetadata(titleIds: Set<string>): Promise<PriorTitleMetadata[]> {
  const ids = Array.from(titleIds).filter(Boolean);
  if (ids.length === 0) return [];

  const rows: PriorTitleMetadata[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    rows.push(...await sbJson<PriorTitleMetadata[]>(
      `/book_titles?id=in.(${batch.join(",")})&select=id,title,author,age_group,suggested_age_tier,page_count&limit=1000`
    ));
  }
  return rows;
}

function buildPriorSeriesProgress(priorTitles: PriorTitleMetadata[]): Map<string, number> {
  const progress = new Map<string, number>();
  for (const title of priorTitles) {
    const series = analyzeSeries(title.title);
    if (!series?.number) continue;
    progress.set(series.key, Math.max(progress.get(series.key) ?? 0, series.number));
  }
  return progress;
}

function getAveragePriorPageCount(priorTitles: PriorTitleMetadata[]): number | null {
  const counts = priorTitles
    .map(title => title.page_count)
    .filter((count): count is number => typeof count === "number" && Number.isFinite(count) && count > 0);
  if (counts.length === 0) return null;
  return Math.round(counts.reduce((sum, count) => sum + count, 0) / counts.length);
}

function getInventoryHealthBonus(count: number, config: SelectionEngineConfig): number {
  if (count >= config.thresholds.veryHealthyInventoryCount) {
    return config.score.inventoryHealthy + config.score.inventoryVeryHealthy;
  }
  if (count >= config.thresholds.healthyInventoryCount) return config.score.inventoryHealthy;
  return 0;
}

function buildVisibleReasons(input: {
  ageMatched: boolean;
  themeMatch: boolean;
  matchedCategories?: string[];
  noteReasons: string[];
  alreadySent?: boolean;
  seasonalAllowed?: boolean;
  seasonalFilteringActive?: boolean;
  varietyPick?: boolean;
  inventoryHealth?: boolean;
  readingProgression?: boolean;
  seriesContinuation?: boolean;
}): SelectionReason[] {
  const reasons: SelectionReason[] = [];
  if (input.ageMatched) reasons.push(createSelectionReason("age_match"));
  if (input.themeMatch) {
    reasons.push(createSelectionReason(
      "interest_match",
      input.matchedCategories?.length ? input.matchedCategories.join(", ") : undefined
    ));
  }
  if (input.noteReasons.length > 0) {
    reasons.push(createSelectionReason("note_match", input.noteReasons.join("; ")));
  }
  if (input.seasonalFilteringActive) {
    reasons.push(createSelectionReason(
      input.seasonalAllowed ? "seasonal_allowed" : "seasonal_blocked"
    ));
  }
  if (input.inventoryHealth) reasons.push(createSelectionReason("inventory_health"));
  if (input.readingProgression) reasons.push(createSelectionReason("reading_progression"));
  if (input.seriesContinuation) reasons.push(createSelectionReason("series_continue"));
  if (input.alreadySent) reasons.push(createSelectionReason("prior_title_penalty"));
  if (input.varietyPick) reasons.push(createSelectionReason("theme_variety"));
  return reasons;
}

export async function suggestBooksForMember(input: {
  member_id: string;
  count?: number;
  policy?: Partial<BookSelectionPolicy>;
  config?: Partial<SelectionEngineConfig>;
}): Promise<SuggestBooksResult> {
  const policy = resolveBookSelectionPolicy(input.policy);
  const config = resolveSelectionEngineConfig(input.config);
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
    `/book_copies?status=eq.in_house&age_group=eq.${encodeURIComponent(String(memberAgeGroup))}&select=id,sku,bin_id,section,book_title_id,age_group,book_titles(${BOOK_TITLE_SELECTION_FIELDS})&limit=1000&order=received_at.asc`
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
    .filter((b) => {
      if (!policy.seasonalFilteringInSuggestions) return true;
      return isSeasonalBookAllowed({ title: b.title, tags: b.tags });
    })
    .filter((b) => policy.allowPreviouslySentInSuggestions || !sentBookTitleIds.has(b.book_title_id))
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
      const seasonalAllowed = isSeasonalBookAllowed({ title: b.title, tags: b.tags });
      const inventoryBonus = getInventoryHealthBonus(inHouseCount, config);

      let score = config.score.base;
      if (themeMatch) score += config.score.interestMatch;
      if (alreadySent) score -= 50;
      score += inventoryBonus;
      score += noteMatch.score;

      const reasons: string[] = [];
      const matchedCats = themeMatch
        ? getMatchedInterestCategories({
          interests: memberInterests,
          theme: b.bin_theme,
        })
        : [];
      if (matchedCats.length > 0) reasons.push(`Matches: ${matchedCats.join(", ")}`);
      reasons.push(...noteMatch.reasons);
      if (inventoryBonus > 0) reasons.push("Healthy inventory");
      if (alreadySent) reasons.push("Already sent");
      if (!themeMatch && !alreadySent) reasons.push("Variety pick");

      const selectionReasons = buildVisibleReasons({
        ageMatched: true,
        themeMatch,
        matchedCategories: matchedCats,
        noteReasons: noteMatch.reasons,
        alreadySent,
        seasonalAllowed,
        seasonalFilteringActive: true,
        inventoryHealth: inventoryBonus > 0,
        varietyPick: !themeMatch && !alreadySent,
      });

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
        selection_reasons: selectionReasons,
        selection_reason_codes: selectionReasonCodes(selectionReasons),
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

function markPippasSurprise(selected: Candidate[], candidates: Candidate[], config: SelectionEngineConfig) {
  if (selected.length < 3 || selected.some(candidate => !candidate.isInterestMatch)) return;
  const selectedIds = new Set(selected.map(candidate => candidate.copy.id));
  const bestDiscovery = candidates
    .filter(candidate => !selectedIds.has(candidate.copy.id) && !candidate.isInterestMatch)
    .sort((a, b) => b.baseScore - a.baseScore)[0];
  if (!bestDiscovery) return;

  const replaceIndex = selected
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.isInterestMatch && !candidate.isSeriesContinuation)
    .sort((a, b) => a.candidate.finalScore - b.candidate.finalScore)[0]?.index;
  if (replaceIndex === undefined) return;

  const replaced = selected[replaceIndex];
  if (replaced.finalScore - bestDiscovery.baseScore > config.diversity.pippasSurpriseMaxScoreGap) return;

  bestDiscovery.finalScore = bestDiscovery.baseScore;
  bestDiscovery.reasons = bestDiscovery.reasons.filter(reason => reason.code !== "theme_variety");
  bestDiscovery.reasons.push(createSelectionReason("pippas_surprise"));
  selected[replaceIndex] = bestDiscovery;
}

function selectCuratedCandidates(
  candidates: Candidate[],
  count: number,
  config: SelectionEngineConfig,
  useDiversity: boolean
): Candidate[] {
  if (!useDiversity) {
    const selected = candidates.slice(0, count);
    markPippasSurprise(selected, candidates, config);
    return selected;
  }

  const selected: Candidate[] = [];
  const selectedIds = new Set<string>();
  const selectedAuthors = new Set<string>();
  const selectedThemes = new Set<string>();
  const selectedSeries = new Set<string>();

  while (selected.length < count && selected.length < candidates.length) {
    const remaining = candidates.filter(candidate => !selectedIds.has(candidate.copy.id));

    const ranked = remaining
      .map(candidate => {
        let adjustedScore = candidate.baseScore;
        let authorDiversityAdjustment = 0;
        let themeDiversityAdjustment = 0;

        if (
          selectedAuthors.has(candidate.authorKey) &&
          remaining.some(other => other.authorKey !== candidate.authorKey)
        ) {
          authorDiversityAdjustment = -config.diversity.repeatedAuthorPenalty;
          adjustedScore += authorDiversityAdjustment;
        }
        if (
          selectedThemes.has(normalizeTheme(candidate.theme)) &&
          remaining.some(other => normalizeTheme(other.theme) !== normalizeTheme(candidate.theme))
        ) {
          themeDiversityAdjustment = -config.diversity.repeatedThemePenalty;
          adjustedScore += themeDiversityAdjustment;
        }
        if (
          candidate.series?.key &&
          selectedSeries.has(candidate.series.key) &&
          remaining.some(other => other.series?.key !== candidate.series?.key)
        ) {
          adjustedScore -= config.diversity.sameSeriesPenalty;
        }

        return { candidate, adjustedScore, authorDiversityAdjustment, themeDiversityAdjustment };
      })
      .sort((a, b) => b.adjustedScore - a.adjustedScore || b.candidate.baseScore - a.candidate.baseScore);

    const rankedChoice = ranked[0];
    const chosen = rankedChoice?.candidate;
    if (!chosen || !rankedChoice) break;

    const hadRepeatedAuthorOption = remaining.some(candidate =>
      selectedAuthors.has(candidate.authorKey) && candidate.copy.id !== chosen.copy.id
    );
    const hadRepeatedThemeOption = remaining.some(candidate =>
      selectedThemes.has(normalizeTheme(candidate.theme)) && candidate.copy.id !== chosen.copy.id
    );

    chosen.finalScore = rankedChoice.adjustedScore;
    chosen.authorDiversityAdjustment = rankedChoice.authorDiversityAdjustment;
    chosen.themeDiversityAdjustment = rankedChoice.themeDiversityAdjustment;

    if (selected.length > 0 && !selectedAuthors.has(chosen.authorKey) && hadRepeatedAuthorOption) {
      chosen.reasons.push(createSelectionReason("author_diversity", chosen.copy.book_titles?.author ?? undefined));
    }
    if (selected.length > 0 && !selectedThemes.has(normalizeTheme(chosen.theme)) && hadRepeatedThemeOption) {
      chosen.reasons.push(createSelectionReason("theme_diversity", chosen.theme || undefined));
    }

    selected.push(chosen);
    selectedIds.add(chosen.copy.id);
    selectedAuthors.add(chosen.authorKey);
    selectedThemes.add(normalizeTheme(chosen.theme));
    if (chosen.series?.key) selectedSeries.add(chosen.series.key);
  }

  markPippasSurprise(selected, candidates, config);
  return selected;
}

function buildSelectionMetadata(candidate: Candidate): SelectionMetadata {
  const explanationCodes = selectionReasonCodes(candidate.reasons);
  const seriesNumber = candidate.series?.number ?? null;
  return {
    engine_version: SELECTION_ENGINE_VERSION,
    policy_version: SELECTION_POLICY_VERSION,
    selected_at: new Date().toISOString(),
    final_score: candidate.finalScore,
    score_breakdown: {
      ...candidate.scoreBreakdown,
      author_diversity: candidate.authorDiversityAdjustment,
      theme_diversity: candidate.themeDiversityAdjustment,
    },
    explanation_codes: explanationCodes,
    explanation_labels: candidate.reasons.map(reason => reason.label),
    explanations: candidate.reasons,
    author_diversity_adjustment: candidate.authorDiversityAdjustment,
    theme_diversity_adjustment: candidate.themeDiversityAdjustment,
    series_continuation: {
      series_key: candidate.series?.key ?? null,
      series_label: candidate.series?.label ?? null,
      book_number: seriesNumber,
      continued_existing_series: candidate.isSeriesContinuation,
    },
    series_order_validation: {
      checked: Boolean(seriesNumber),
      valid: true,
      detail: seriesNumber ? "Series order validated for book " + seriesNumber + "." : null,
    },
    reading_progression_adjustment: candidate.readingProgressionBonus,
    inventory_health_adjustment: candidate.inventoryBonus,
    pippas_surprise: explanationCodes.includes("pippas_surprise"),
  };
}

export async function selectBooksForPickingOrder(input: {
  member: BookSelectionMember;
  policy?: Partial<BookSelectionPolicy>;
  config?: Partial<SelectionEngineConfig>;
}): Promise<PickingSelectionResult> {
  const policy = resolveBookSelectionPolicy(input.policy);
  const config = resolveSelectionEngineConfig(input.config);
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

  const priorTitleMetadata = await fetchPriorTitleMetadata(priorTitleIds);
  const priorSeriesProgress = buildPriorSeriesProgress(priorTitleMetadata);
  const averagePriorPages = getAveragePriorPageCount(priorTitleMetadata);

  const memberInterests = interests
    .map(row => row.interest_category)
    .filter(Boolean) as string[];
  const matchThemes = buildInterestThemeSet(memberInterests);
  const avoidThemes = buildAvoidThemeSet(member.topics_to_avoid);
  const noteProfile = buildNoteProfile(member.notes);

  const availableCopies = await sbJson<AvailableCopyWithTitle[]>(
    `/book_copies?status=eq.in_house&age_group=eq.${encodeURIComponent(memberAgeGroup)}&select=id,sku,bin_id,section,book_title_id,book_titles(${BOOK_TITLE_SELECTION_FIELDS})&limit=1000&order=received_at.asc`
  );

  const tagMap = await fetchTagMap(availableCopies);
  const inHouseCounts: Record<string, number> = {};
  for (const copy of availableCopies) {
    if (!copy.book_title_id) continue;
    inHouseCounts[copy.book_title_id] = (inHouseCounts[copy.book_title_id] ?? 0) + 1;
  }

  const bestCopyByTitle = new Map<string, Candidate>();
  const exclusions: SelectionExclusion[] = [];

  for (const copy of availableCopies) {
    const tags = getCopyTags(copy, tagMap);
    const theme = copy.book_titles?.bin_theme ?? "";
    const series = analyzeSeries(copy.book_titles?.title);
    const seasonalAllowed = isSeasonalBookAllowed({
      title: copy.book_titles?.title,
      tags,
      referenceDate: new Date(),
    });

    if (policy.excludeActiveAssignedCopies && activeAssignedCopyIds.has(copy.id)) {
      addExclusion(exclusions, "active_copy_excluded", copy, "Copy is already assigned to an active picking/packing/packed shipment.");
      continue;
    }
    if (
      policy.excludePreviouslySentFromBundleCreation &&
      (!copy.book_title_id || priorTitleIds.has(copy.book_title_id))
    ) {
      addExclusion(exclusions, "duplicate_title_excluded", copy, "Title already appears in this member's history or prior shipments.");
      continue;
    }
    if (series?.number && series.number > 1) {
      const priorSeriesNumber = priorSeriesProgress.get(series.key) ?? 0;
      if (priorSeriesNumber < series.number - 1) {
        addExclusion(exclusions, "series_order_blocked", copy, `Avoiding ${series.label} book ${series.number} before earlier books.`);
        continue;
      }
    }
    if (avoidThemes.has(theme)) {
      addExclusion(exclusions, "avoided_topic_excluded", copy, "Theme matched an avoided topic.");
      continue;
    }
    const avoidMatches = getAvoidMatches(member.topics_to_avoid, {
      title: copy.book_titles?.title,
      author: copy.book_titles?.author,
      theme,
      tags,
    });
    if (avoidMatches.length > 0) {
      addExclusion(exclusions, "avoided_topic_excluded", copy, avoidMatches.join(", "));
      continue;
    }
    const noteMatch = scoreNoteMatch({
      profile: noteProfile,
      title: copy.book_titles?.title,
      author: copy.book_titles?.author,
      theme,
      tags,
    });
    if (noteMatch.excluded) {
      addExclusion(exclusions, "avoided_topic_excluded", copy, noteMatch.reasons.join("; "));
      continue;
    }
    if (policy.seasonalFiltering && !seasonalAllowed) {
      addExclusion(exclusions, "seasonal_blocked", copy, "Holiday/seasonal title is outside its picking window.");
      continue;
    }

    const themeMatch = matchThemes.has(theme);
    const matchedCats = themeMatch
      ? getMatchedInterestCategories({ interests: memberInterests, theme })
      : [];
    const inHouseCount = inHouseCounts[copy.book_title_id] ?? 0;
    const inventoryBonus = getInventoryHealthBonus(inHouseCount, config);
    const isSeriesContinuation = Boolean(
      series?.number && (priorSeriesProgress.get(series.key) ?? 0) === series.number - 1
    );
    const pageCount = copy.book_titles?.page_count;
    const isReadingProgression = Boolean(
      averagePriorPages &&
      typeof pageCount === "number" &&
      pageCount > averagePriorPages &&
      pageCount - averagePriorPages <= config.thresholds.readingProgressionMaxPageDelta
    );

    const reasons = buildVisibleReasons({
      ageMatched: true,
      themeMatch,
      matchedCategories: matchedCats,
      noteReasons: noteMatch.reasons,
      seasonalAllowed,
      seasonalFilteringActive: policy.seasonalFiltering,
      inventoryHealth: inventoryBonus > 0,
      readingProgression: isReadingProgression,
      seriesContinuation: isSeriesContinuation,
      varietyPick: !themeMatch && noteMatch.reasons.length === 0,
    });

    let baseScore = config.score.base;
    if (themeMatch) baseScore += config.score.interestMatch;
    if (copy.bin_id) baseScore += config.score.locatedCopy;
    baseScore += noteMatch.score;
    baseScore += inventoryBonus;
    if (isSeriesContinuation) baseScore += config.score.seriesContinuation;
    if (isReadingProgression) baseScore += config.score.readingProgression;

    const candidate: Candidate = {
      copy,
      tags,
      theme,
      authorKey: normalizeAuthor(copy.book_titles?.author),
      series,
      isInterestMatch: themeMatch || noteMatch.reasons.length > 0,
      isSeriesContinuation,
      inventoryBonus,
      readingProgressionBonus: isReadingProgression ? config.score.readingProgression : 0,
      noteMatch,
      baseScore,
      finalScore: baseScore,
      scoreBreakdown: {
        base: config.score.base,
        interest_match: themeMatch ? config.score.interestMatch : 0,
        note_match: noteMatch.score,
        located_copy: copy.bin_id ? config.score.locatedCopy : 0,
        inventory_health: inventoryBonus,
        series_continuation: isSeriesContinuation ? config.score.seriesContinuation : 0,
        reading_progression: isReadingProgression ? config.score.readingProgression : 0,
      },
      authorDiversityAdjustment: 0,
      themeDiversityAdjustment: 0,
      reasons,
    };

    const existing = bestCopyByTitle.get(copy.book_title_id);
    if (!existing || candidate.baseScore > existing.baseScore) {
      bestCopyByTitle.set(copy.book_title_id, candidate);
    }
  }

  const candidates = Array.from(bestCopyByTitle.values())
    .sort((a, b) => b.baseScore - a.baseScore);
  const selectedCandidates = selectCuratedCandidates(
    candidates,
    booksNeeded,
    config,
    policy.themeVariety
  );
  const selectedCopies = selectedCandidates.map(candidate => candidate.copy);

  const noteMatchByCopyId = new Map<string, { score: number; reasons: string[] }>();
  for (const candidate of candidates) {
    noteMatchByCopyId.set(candidate.copy.id, {
      score: candidate.noteMatch.score,
      reasons: candidate.noteMatch.reasons,
    });
  }

  return {
    selectedCopies,
    noteMatchByCopyId,
    explanationsByCopyId: new Map(
      selectedCandidates.map(candidate => [candidate.copy.id, candidate.reasons])
    ),
    selectionMetadataByCopyId: new Map(
      selectedCandidates.map(candidate => [candidate.copy.id, buildSelectionMetadata(candidate)])
    ),
    exclusions,
    booksNeeded,
  };
}