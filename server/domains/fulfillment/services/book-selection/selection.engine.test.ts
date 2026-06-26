import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../supabase", () => ({
  sbFetch: vi.fn(),
  sbJson: vi.fn(),
}));

import { sbFetch, sbJson } from "../../../../supabase";
import { DEFAULT_BOOK_SELECTION_POLICY } from "./selection.policy";
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
  it("documents defaults that preserve current behavior", () => {
    expect(DEFAULT_BOOK_SELECTION_POLICY).toEqual({
      allowPreviouslySentInSuggestions: true,
      excludePreviouslySentFromBundleCreation: true,
      excludeActiveAssignedCopies: true,
      seasonalFiltering: true,
      seasonalFilteringInSuggestions: false,
      themeVariety: true,
    });
  });
});

describe("suggestBooksForMember", () => {
  it("preserves suggestion scoring, age matching, sent-title flagging, and output shape", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00.000Z"));

    mockedSbFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/members?")) {
        return jsonResponse([
          {
            id: "member-1",
            name: "Mina",
            tier: "cozy-nest",
            age_group: "Sky Readers",
            topics_to_avoid: [],
            notes: null,
            books_per_box: null,
          },
        ]);
      }
      if (path.startsWith("/member_interests?")) {
        return jsonResponse([{ interest_category: "Adventure" }]);
      }
      if (path.startsWith("/shipments?member_id=")) {
        return jsonResponse([{ id: "shipment-old" }]);
      }
      if (path.startsWith("/shipment_books?shipment_id=")) {
        return jsonResponse([{ book_title_id: "already-title" }]);
      }
      if (path.startsWith("/book_copies?")) {
        expect(path).toContain("age_group=eq.sky_readers");
        return jsonResponse([
          {
            id: "copy-best",
            sku: "SKU-BEST",
            bin_id: "SKY-ADV-01",
            section: "A",
            book_title_id: "best-title",
            age_group: "sky_readers",
            book_titles: {
              id: "best-title",
              title: "Quest Club",
              author: "A. Writer",
              cover_url: "cover.jpg",
              bin_theme: "Adventure",
              tag_ids: [],
            },
          },
          {
            id: "copy-variety",
            sku: "SKU-VAR",
            bin_id: "SKY-WILD-01",
            section: "B",
            book_title_id: "variety-title",
            age_group: "sky_readers",
            book_titles: {
              id: "variety-title",
              title: "Forest Friends",
              author: "B. Writer",
              cover_url: null,
              bin_theme: "Wild & Wonderful",
              tag_ids: [],
            },
          },
          {
            id: "copy-sent",
            sku: "SKU-SENT",
            bin_id: "SKY-ADV-02",
            section: "C",
            book_title_id: "already-title",
            age_group: "sky_readers",
            book_titles: {
              id: "already-title",
              title: "Old Quest",
              author: "C. Writer",
              cover_url: null,
              bin_theme: "Adventure",
              tag_ids: [],
            },
          },
          {
            id: "copy-seasonal",
            sku: "SKU-SEASONAL",
            bin_id: "SKY-WILD-02",
            section: "D",
            book_title_id: "seasonal-title",
            age_group: "sky_readers",
            book_titles: {
              id: "seasonal-title",
              title: "Christmas Story",
              author: "D. Writer",
              cover_url: null,
              bin_theme: "Wild & Wonderful",
              tag_ids: [],
            },
          },
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
      sku: "SKU-BEST",
      bin_id: "SKY-ADV-01",
      score: 70,
      already_sent: false,
      match_reason: "Matches: Adventure",
      selection_reason_codes: ["age_match", "interest_match", "seasonal_allowed"],
    });
    expect(result.all_suggestions.find(book => book.book_title_id === "already-title")).toMatchObject({
      already_sent: true,
      score: 20,
      match_reason: "Matches: Adventure · Already sent",
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
  it("preserves bundle selection exclusions, seasonal filtering, scoring, and selected count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00.000Z"));

    mockedSbJson.mockImplementation(async (path: string) => {
      if (path.startsWith("/member_interests?")) return [{ interest_category: "Adventure" }];
      if (path.startsWith("/member_book_history?")) return [{ book_title_id: "prior-title" }];
      if (path.startsWith("/shipments?member_id=")) return [{ id: "prior-shipment" }];
      if (path === "/shipments?shipment_type=eq.outbound&status=in.(picking,packing,packed)&select=id&limit=1000") {
        return [{ id: "active-shipment" }];
      }
      if (path.startsWith("/shipment_books?shipment_id=in.(active-shipment)")) {
        return [{ book_copy_id: "active-copy" }];
      }
      if (path.startsWith("/shipment_books?shipment_id=in.(prior-shipment)")) {
        return [{ book_title_id: "prior-shipment-title" }];
      }
      if (path.startsWith("/book_copies?")) {
        expect(path).toContain("status=eq.in_house");
        expect(path).toContain("age_group=eq.sky_readers");
        return [
          copy("active-copy", "active-title", "Active Book", "Adventure", "SKY-ADV-01"),
          copy("prior-copy", "prior-title", "Already History", "Adventure", "SKY-ADV-01"),
          copy("prior-shipment-copy", "prior-shipment-title", "Already Shipped", "Adventure", "SKY-ADV-01"),
          copy("holiday-copy", "holiday-title", "Christmas Story", "Adventure", "SKY-ADV-01"),
          copy("avoid-copy", "avoid-title", "Scary Cave", "horror", "SKY-HORROR-01"),
          copy("copy-1", "title-1", "Adventure One", "Adventure", "SKY-ADV-01"),
          copy("copy-2", "title-2", "Wild One", "Wild & Wonderful", "SKY-WILD-01"),
          copy("copy-3", "title-3", "Adventure Two", "Adventure", "SKY-ADV-02"),
        ];
      }
      if (path.startsWith("/book_sorting_tags?")) return [];
      throw new Error(`Unexpected sbJson path ${path}`);
    });

    const result = await selectBooksForPickingOrder({
      member: {
        id: "member-1",
        name: "Mina",
        tier: "cozy-nest",
        age_group: "Sky Readers",
        books_per_box: 2,
        topics_to_avoid: ["Scary Stories"],
        notes: null,
      },
    });

    expect(result.booksNeeded).toBe(2);
    expect(result.selectedCopies.map(copy => copy.id)).toEqual(["copy-1", "copy-2"]);
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
    expect(result.explanationsByCopyId.get("copy-2")?.map(reason => reason.code)).toEqual([
      "age_match",
      "seasonal_allowed",
      "theme_variety",
    ]);
    expect(result.exclusions.map(exclusion => exclusion.code)).toEqual([
      "active_copy_excluded",
      "duplicate_title_excluded",
      "duplicate_title_excluded",
      "seasonal_blocked",
      "avoided_topic_excluded",
    ]);
  });
});

function suggestionCopy(
  id: string,
  titleId: string,
  title: string,
  theme: string
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
    },
  };
}

function copy(
  id: string,
  titleId: string,
  title: string,
  theme: string,
  binId: string | null
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
      author: "Author",
      bin_theme: theme,
      tag_ids: [],
    },
  };
}