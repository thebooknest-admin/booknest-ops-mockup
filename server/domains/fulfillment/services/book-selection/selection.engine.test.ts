import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../supabase", () => ({
  sbFetch: vi.fn(),
  sbJson: vi.fn(),
}));

import { sbFetch, sbJson } from "../../../../supabase";
import { DEFAULT_BOOK_SELECTION_POLICY } from "./selection.policy";
import { DEFAULT_SELECTION_ENGINE_CONFIG } from "./selection.config";
import { selectBooksForPickingOrder, suggestBooksForMember } from "./selection.engine";

const mockedSbFetch = vi.mocked(sbFetch);
const mockedSbJson = vi.mocked(sbJson);

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

beforeEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("book selection policy", () => {
  it("documents defaults that preserve current behavior and v2 weights", () => {
    expect(DEFAULT_BOOK_SELECTION_POLICY).toEqual({
      allowPreviouslySentInSuggestions: true,
      excludePreviouslySentFromBundleCreation: true,
      excludeActiveAssignedCopies: true,
      seasonalFiltering: true,
      seasonalFilteringInSuggestions: false,
      themeVariety: true,
    });
    expect(DEFAULT_SELECTION_ENGINE_CONFIG.score).toMatchObject({
      base: 40,
      interestMatch: 30,
      inventoryHealthy: 6,
      seriesContinuation: 24,
      readingProgression: 5,
    });
    expect(DEFAULT_SELECTION_ENGINE_CONFIG.diversity).toMatchObject({
      repeatedAuthorPenalty: 12,
      repeatedThemePenalty: 24,
      sameSeriesPenalty: 100,
    });
    expect(DEFAULT_SELECTION_ENGINE_CONFIG.curation).toMatchObject({
      discoveryPicksPerShipment: 1,
      interestMatchTargetPercentage: 85,
      maximumSameSeriesPerShipment: 1,
    });
  });
});

describe("suggestBooksForMember", () => {
  it("preserves suggestion scoring, age matching, sent-title flagging, and additive explanations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00.000Z"));

    mockedSbFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/members?")) {
        return jsonResponse([{ id: "member-1", name: "Mina", tier: "cozy-nest", age_group: "Sky Readers", topics_to_avoid: [], notes: null, books_per_box: null }]);
      }
      if (path.startsWith("/member_interests?")) return jsonResponse([{ interest_category: "Adventure" }]);
      if (path.startsWith("/shipments?member_id=")) return jsonResponse([{ id: "shipment-old" }]);
      if (path.startsWith("/shipment_books?shipment_id=")) return jsonResponse([{ book_title_id: "already-title" }]);
      if (path.startsWith("/book_copies?")) {
        expect(path).toContain("age_group=eq.sky_readers");
        return jsonResponse([
          suggestionCopy("copy-best", "best-title", "Quest Club", "Adventure", { cover_url: "cover.jpg" }),
          suggestionCopy("copy-variety", "variety-title", "Forest Friends", "Wild & Wonderful"),
          suggestionCopy("copy-sent", "already-title", "Old Quest", "Adventure"),
          suggestionCopy("copy-seasonal", "seasonal-title", "Christmas Story", "Wild & Wonderful"),
        ]);
      }
      throw new Error(`Unexpected sbFetch path ${path}`);
    });
    mockedSbJson.mockResolvedValue([]);

    const result = await suggestBooksForMember({ member_id: "member-1", count: 2 });

    expect(result).toMatchObject({
      member_id: "member-1",
      member_name: "Mina",
      tier: "cozy-nest",
      age_group: "Sky Readers",
      books_needed: 2,
      fallback_start_index: 4,
    });
    expect(result.recommended).toHaveLength(2);
    expect(result.recommended[0]).toMatchObject({
      book_title_id: "best-title",
      copy_id: "copy-best",
      sku: "SKU-copy-best",
      bin_id: "SKY-ADV-01",
      score: 70,
      already_sent: false,
      match_reason: "Matches: Adventure",
      selection_reason_codes: ["age_match", "interest_match", "seasonal_allowed"],
    });
    expect(result.all_suggestions.find(book => book.book_title_id === "already-title")).toMatchObject({
      already_sent: true,
      score: 20,
selection_reason_codes: ["age_match", "interest_match", "seasonal_allowed", "prior_title_penalty"],
    });
    expect(result.all_suggestions.find(book => book.book_title_id === "seasonal-title")).toMatchObject({
      already_sent: false,
      selection_reason_codes: ["age_match", "seasonal_blocked", "theme_variety"],
    });
  });

  it("can isolate future prior-title filtering behind policy without changing defaults", async () => {
    mockedSbFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/members?")) return jsonResponse([{ id: "member-1", name: "Mina", tier: "cozy-nest", age_group: "Sky Readers", topics_to_avoid: [], notes: null, books_per_box: null }]);
      if (path.startsWith("/member_interests?")) return jsonResponse([]);
      if (path.startsWith("/shipments?member_id=")) return jsonResponse([{ id: "shipment-old" }]);
      if (path.startsWith("/shipment_books?shipment_id=")) return jsonResponse([{ book_title_id: "already-title" }]);
      if (path.startsWith("/book_copies?")) return jsonResponse([
        suggestionCopy("copy-sent", "already-title", "Old Quest", "Adventure"),
        suggestionCopy("copy-new", "new-title", "New Quest", "Adventure"),
      ]);
      throw new Error(`Unexpected sbFetch path ${path}`);
    });
    mockedSbJson.mockResolvedValue([]);

    const defaultResult = await suggestBooksForMember({ member_id: "member-1", count: 2 });
    expect(defaultResult.all_suggestions.map(book => book.book_title_id)).toContain("already-title");

    const futurePolicyResult = await suggestBooksForMember({
      member_id: "member-1",
      count: 2,
      policy: { allowPreviouslySentInSuggestions: false },
    });
    expect(futurePolicyResult.all_suggestions.map(book => book.book_title_id)).not.toContain("already-title");
  });
});

describe("selectBooksForPickingOrder", () => {
  it("preserves core exclusions and selected count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00.000Z"));

    mockPickingSelection({
      interests: [{ interest_category: "Adventure" }],
      topicsToAvoid: ["Scary Stories"],
      priorHistory: [{ book_title_id: "prior-title" }],
      priorShipments: [{ id: "prior-shipment" }],
      activeShipments: [{ id: "active-shipment" }],
      activeAssignments: [{ book_copy_id: "active-copy" }],
      priorShipmentBooks: [{ book_title_id: "prior-shipment-title" }],
      copies: [
        copy("active-copy", "active-title", "Active Book", "Adventure", "SKY-ADV-01"),
        copy("prior-copy", "prior-title", "Already History", "Adventure", "SKY-ADV-01"),
        copy("prior-shipment-copy", "prior-shipment-title", "Already Shipped", "Adventure", "SKY-ADV-01"),
        copy("holiday-copy", "holiday-title", "Christmas Story", "Adventure", "SKY-ADV-01"),
        copy("avoid-copy", "avoid-title", "Scary Cave", "horror", "SKY-HORROR-01"),
        copy("copy-1", "title-1", "Adventure One", "Adventure", "SKY-ADV-01"),
        copy("copy-2", "title-2", "Wild One", "Wild & Wonderful", "SKY-WILD-01", "Author Two"),
        copy("copy-3", "title-3", "Adventure Two", "Adventure", "SKY-ADV-02", "Author Three"),
      ],
    });

    const result = await runPickingSelection(2, ["Scary Stories"]);

    expect(result.booksNeeded).toBe(2);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["copy-1", "copy-3"]);
    expect(result.selectedCopies.map(copy => copy.id)).not.toContain("active-copy");
    expect(result.selectedCopies.map(copy => copy.id)).not.toContain("prior-copy");
    expect(result.selectedCopies.map(copy => copy.id)).not.toContain("prior-shipment-copy");
    expect(result.selectedCopies.map(copy => copy.id)).not.toContain("holiday-copy");
    expect(result.noteMatchByCopyId.get("copy-1")).toEqual({ score: 0, reasons: [] });
    expect(result.explanationsByCopyId.get("copy-1")?.map(reason => reason.code)).toEqual([
      "age_match",
      "interest_match",
      "seasonal_allowed",
    ]);
    expect(result.explanationsByCopyId.get("copy-3")?.map(reason => reason.code)).toEqual([
      "age_match",
      "interest_match",
      "seasonal_allowed",
    ]);
    expect(result.exclusions.map(exclusion => exclusion.code)).toEqual([
      "active_copy_excluded",
      "duplicate_title_excluded",
      "duplicate_title_excluded",
      "seasonal_blocked",
      "avoided_topic_excluded",
    ]);
  });

  it("uses author diversity to avoid repeated authors when alternatives exist", async () => {
    mockPickingSelection({
      copies: [
        copy("same-1", "same-title-1", "Same One", "Adventure", "BIN", "Same Author"),
        copy("same-2", "same-title-2", "Same Two", "Wild & Wonderful", "BIN", "Same Author"),
        copy("other-1", "other-title", "Other One", "Discovery Den", "BIN", "Other Author"),
      ],
    });

    const result = await runPickingSelection(2);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["same-1", "other-1"]);
    expect(result.explanationsByCopyId.get("other-1")?.map(reason => reason.code)).toContain("author_diversity");
  });

  it("uses theme diversity to avoid repeated themes when good alternatives exist", async () => {
    mockPickingSelection({
      copies: [
        copy("adv-1", "adv-title-1", "Adventure One", "Adventure", "BIN", "Author One"),
        copy("adv-2", "adv-title-2", "Adventure Two", "Adventure", "BIN", "Author Two"),
        copy("wild-1", "wild-title", "Wild One", "Wild & Wonderful", "BIN", "Author Three"),
      ],
    });

    const result = await runPickingSelection(2);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["adv-1", "wild-1"]);
    expect(result.explanationsByCopyId.get("wild-1")?.map(reason => reason.code)).toContain("theme_diversity");
  });

  it("prefers continuing an obvious series already in member history", async () => {
    mockPickingSelection({
      priorHistory: [{ book_title_id: "mth-1" }],
      priorTitles: [{ id: "mth-1", title: "Magic Tree House #1", author: "Mary", page_count: 80 }],
      copies: [
        copy("other", "other-title", "Strong Standalone", "Adventure", "BIN", "Other Author"),
        copy("mth-2", "mth-2-title", "Magic Tree House #2: The Knight", "Adventure", "BIN", "Mary"),
      ],
    });

    const result = await runPickingSelection(1);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["mth-2"]);
    expect(result.explanationsByCopyId.get("mth-2")?.map(reason => reason.code)).toContain("series_continue");
  });

  it("blocks obvious later series books before earlier books", async () => {
    mockPickingSelection({
      copies: [
        copy("mth-2", "mth-2-title", "Magic Tree House #2: The Knight", "Adventure", "BIN", "Mary"),
        copy("mth-1", "mth-1-title", "Magic Tree House #1", "Adventure", "BIN", "Mary"),
      ],
    });

    const result = await runPickingSelection(1);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["mth-1"]);
    expect(result.exclusions.find(exclusion => exclusion.copy_id === "mth-2")?.code).toBe("series_order_blocked");
  });

  it("slightly favors healthy inventory without overpowering a much better recommendation", async () => {
    mockPickingSelection({
      interests: [],
      copies: [
        copy("healthy-1", "healthy-title", "Healthy One", "Adventure", "BIN", "Author A"),
        copy("healthy-2", "healthy-title", "Healthy One", "Adventure", "BIN", "Author A"),
        copy("healthy-3", "healthy-title", "Healthy One", "Adventure", "BIN", "Author A"),
        copy("thin", "thin-title", "Thin One", "Wild & Wonderful", "BIN", "Author B"),
      ],
    });
    await expect(runPickingSelection(1)).resolves.toMatchObject({ selectedCopies: [{ id: "healthy-1" }] });

    mockPickingSelection({
      interests: [{ interest_category: "Adventure" }],
      copies: [
        copy("healthy-1", "healthy-title", "Healthy One", "Wild & Wonderful", "BIN", "Author A"),
        copy("healthy-2", "healthy-title", "Healthy One", "Wild & Wonderful", "BIN", "Author A"),
        copy("healthy-3", "healthy-title", "Healthy One", "Wild & Wonderful", "BIN", "Author A"),
        copy("interest", "interest-title", "Interest One", "Adventure", "BIN", "Author B"),
      ],
    });
    await expect(runPickingSelection(1)).resolves.toMatchObject({ selectedCopies: [{ id: "interest" }] });
  });

  it("favors gentle reading progression within the same age tier", async () => {
    mockPickingSelection({
      interests: [],
      priorHistory: [{ book_title_id: "prior-title" }],
      priorTitles: [{ id: "prior-title", title: "Prior Book", author: "Prior", page_count: 90 }],
      copies: [
        copy("flat", "flat-title", "Flat Read", "Adventure", "BIN", "Author A", { page_count: 80 }),
        copy("progress", "progress-title", "Progress Read", "Wild & Wonderful", "BIN", "Author B", { page_count: 130 }),
      ],
    });

    const result = await runPickingSelection(1);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["progress"]);
    expect(result.explanationsByCopyId.get("progress")?.map(reason => reason.code)).toContain("reading_progression");
  });

  it("uses loaded settings to disable Pippa's Surprise", async () => {
    mockPickingSelection({
      settingsRows: [{
        id: "settings-1",
        active: true,
        config: { discoveryPicksPerShipment: 0, interestMatchTargetPercentage: 100 },
      }],
      interests: [{ interest_category: "Adventure" }],
      copies: [
        copy("interest-1", "interest-title-1", "Interest One", "Adventure", "BIN", "Author A"),
        copy("interest-2", "interest-title-2", "Interest Two", "Adventure", "BIN", "Author B"),
        copy("interest-3", "interest-title-3", "Interest Three", "Adventure", "BIN", "Author C"),
        copy("interest-4", "interest-title-4", "Interest Four", "Adventure", "BIN", "Author D"),
        copy("interest-5", "interest-title-5", "Interest Five", "Adventure", "BIN", "Author E"),
        copy("interest-6", "interest-title-6", "Interest Six", "Adventure", "BIN", "Author F"),
        copy("surprise", "surprise-title", "Surprise One", "Discovery Den", "BIN", "Author G"),
      ],
    });

    const result = await runPickingSelection(6);
    expect(result.selectedCopies.map(copy => copy.id)).not.toContain("surprise");
  });

  it("persists Pippa's Surprise when inventory allows one discovery pick", async () => {
    mockPickingSelection({
      interests: [{ interest_category: "Adventure" }],
      copies: [
        copy("interest-1", "interest-title-1", "Interest One", "Adventure", "BIN", "Author A"),
        copy("interest-2", "interest-title-2", "Interest Two", "Adventure", "BIN", "Author B"),
        copy("interest-3", "interest-title-3", "Interest Three", "Adventure", "BIN", "Author C"),
        copy("interest-4", "interest-title-4", "Interest Four", "Adventure", "BIN", "Author D"),
        copy("interest-5", "interest-title-5", "Interest Five", "Adventure", "BIN", "Author E"),
        copy("interest-6", "interest-title-6", "Interest Six", "Adventure", "BIN", "Author F"),
        copy("surprise", "surprise-title", "Surprise One", "Discovery Den", "BIN", "Author G"),
      ],
    });

    const result = await runPickingSelection(6);
    expect(result.selectedCopies.map(copy => copy.id)).toContain("surprise");
    expect(result.explanationsByCopyId.get("surprise")?.map(reason => reason.code)).toContain("pippas_surprise");
    expect(result.selectionMetadataByCopyId.get("surprise")).toMatchObject({
      engine_version: "book-selection-v2",
      policy_version: "2026-06-selection-v2",
      pippas_surprise: true,
      explanation_codes: expect.arrayContaining(["pippas_surprise"]),
      explanation_labels: expect.arrayContaining(["Pippa's Surprise"]),
    });
  });
});

function suggestionCopy(
  id: string,
  titleId: string,
  title: string,
  theme: string,
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    sku: `SKU-${id}`,
    bin_id: "SKY-ADV-01",
    section: "A",
    book_title_id: titleId,
    age_group: "sky_readers",
    book_titles: {
      id: titleId,
      title,
      author: "Author",
      cover_url: null,
      bin_theme: theme,
      tag_ids: [],
      ...extra,
    },
  };
}

function copy(
  id: string,
  titleId: string,
  title: string,
  theme: string,
  binId: string | null,
  author = "Author",
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    sku: `SKU-${id}`,
    bin_id: binId,
    section: "A",
    book_title_id: titleId,
    book_titles: {
      id: titleId,
      title,
      author,
      bin_theme: theme,
      tag_ids: [],
      ...extra,
    },
  };
}

type PickingFixture = {
  interests?: Array<{ interest_category: string | null }>;
  topicsToAvoid?: string[];
  priorHistory?: Array<{ book_title_id: string | null }>;
  priorShipments?: Array<{ id: string }>;
  activeShipments?: Array<{ id: string }>;
  activeAssignments?: Array<{ book_copy_id: string | null }>;
  priorShipmentBooks?: Array<{ book_title_id: string | null }>;
  priorTitles?: Array<{ id: string; title: string | null; author: string | null; page_count?: number | null }>;
  settingsRows?: Array<{ id: string; active: boolean; config: Record<string, unknown>; updated_at?: string | null }>;
  copies: ReturnType<typeof copy>[];
};

let currentTopicsToAvoid: string[] = [];

function mockPickingSelection(fixture: PickingFixture) {
  currentTopicsToAvoid = fixture.topicsToAvoid ?? [];
  mockedSbJson.mockImplementation(async (path: string) => {
    if (path.startsWith("/selection_engine_settings?")) return fixture.settingsRows ?? [];
    if (path.startsWith("/member_interests?")) return fixture.interests ?? [];
    if (path.startsWith("/member_book_history?")) return fixture.priorHistory ?? [];
    if (path.startsWith("/shipments?member_id=")) return fixture.priorShipments ?? [];
    if (path === "/shipments?shipment_type=eq.outbound&status=in.(picking,packing,packed)&select=id&limit=1000") return fixture.activeShipments ?? [];
    if (path.includes("&book_copy_id=not.is.null&select=book_copy_id")) return fixture.activeAssignments ?? [];
    if (path.includes("/shipment_books?shipment_id=in.") && path.includes("&select=book_title_id")) return fixture.priorShipmentBooks ?? [];
    if (path.startsWith("/book_titles?id=in.")) return fixture.priorTitles ?? [];
    if (path.startsWith("/book_copies?")) return fixture.copies;
    if (path.startsWith("/book_sorting_tags?")) return [];
    throw new Error(`Unexpected sbJson path ${path}`);
  });
}

function runPickingSelection(count: number, topicsToAvoid = currentTopicsToAvoid) {
  return selectBooksForPickingOrder({
    member: {
      id: "member-1",
      name: "Mina",
      tier: "cozy-nest",
      age_group: "Sky Readers",
      books_per_box: count,
      topics_to_avoid: topicsToAvoid,
      notes: null,
    },
  });
}