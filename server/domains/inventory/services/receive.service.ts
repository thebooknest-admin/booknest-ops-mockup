import {
  BOOK_TAG_TO_THEME,
  BOOK_COPY_STATUSES,
  LABEL_STATUSES,
  formatInventoryLocation,
  getBinCodeForAgeGroupAndTheme,
  getSectionCapacity,
  getThemeFromBookSignals,
  getSkuPrefixForAgeGroup,
  normalizeAgeGroup,
  normalizeShelvingSection,
  requiresShelvingSection,
  sanitizeBookTags,
  sectionIndexToLabel,
} from "@shared/booknest";
import { sbJson, sbVoid } from "../../../supabase";

function getThemeFromBinId(binId: string | null | undefined) {
  const value = (binId ?? "").toUpperCase();
  if (value.includes("-ADV-")) return "Adventure";
  if (value.includes("-HUM-") || value.includes("-LCH-")) return "Laughs & Chaos";
  if (value.includes("-HRT-") || value.includes("HEARTHOME")) return "Heart & Home";
  if (value.includes("-WON-") || value.includes("-WND-")) return "Wonder & Imagination";
  if (value.includes("-WLD-")) return "Wild & Wonderful";
  if (value.includes("-DSC-")) return "Discovery Den";
  if (value.includes("-LEG-")) return "Legends & Long Ago";
  if (value.includes("-SEA-")) return "Seasons & Celebrations";
  return null;
}

async function pickNextShelvingSection(input: { ageGroup: string | null | undefined; theme: string | null | undefined; binId?: string | null }) {
  if (!requiresShelvingSection(input.ageGroup)) return null;
  if (!input.theme) return null;
  const capacity = getSectionCapacity(input.ageGroup);
  const ageKey = normalizeAgeGroup(input.ageGroup);
  if (!capacity || !ageKey) return null;
  const binId = input.binId ?? getBinCodeForAgeGroupAndTheme(ageKey, input.theme);
  if (!binId) return null;
  const rows = await sbJson<{ section: string | null }[]>(
    `/book_copies?status=eq.in_house&age_group=eq.${encodeURIComponent(ageKey)}&bin_id=eq.${encodeURIComponent(binId)}&section=not.is.null&select=section&limit=10000`
  );
  const counts = new Map<string, number>();
  for (const row of rows) {
    const section = normalizeShelvingSection(row.section);
    if (!section) continue;
    counts.set(section, (counts.get(section) ?? 0) + 1);
  }
  for (let index = 0; ; index++) {
    const candidate = sectionIndexToLabel(index);
    if ((counts.get(candidate) ?? 0) < capacity) return candidate;
  }
}

export async function receiveBook(input: any) {
  const derivedBinTheme = getThemeFromBinId(input.bin_id);
  const ageGroupKey = normalizeAgeGroup(input.age_group);
  if (!ageGroupKey) throw new Error(`Unsupported age group: ${input.age_group}`);

  const sanitizedTags = sanitizeBookTags(input.tags);
  const requestedBinTheme = input.bin_theme ?? derivedBinTheme;
  const classificationText = [input.title, input.author, input.description ?? "", ...(input.subjects ?? [])].join(" ");
  const binTheme = getThemeFromBookSignals(sanitizedTags, classificationText, requestedBinTheme) ?? requestedBinTheme;
  let tagRows = sanitizedTags.length > 0
    ? await sbJson<{ id: string; tag: string; bin_theme: string }[]>("/book_sorting_tags?select=id,tag,bin_theme&limit=1000")
    : [];
  const selectedTagSet = new Set(sanitizedTags);
  const existingTagSet = new Set(tagRows.map(row => row.tag));
  const missingTags = sanitizedTags.filter(tag => !existingTagSet.has(tag));
  if (missingTags.length > 0) {
    const createdTags = await sbJson<{ id: string; tag: string; bin_theme: string }[]>("/book_sorting_tags", {
      method: "POST",
      body: JSON.stringify(missingTags.map(tag => ({ tag, bin_theme: BOOK_TAG_TO_THEME[tag] }))),
    });
    tagRows = [...tagRows, ...createdTags];
  }
  const tagIds = tagRows.filter(row => selectedTagSet.has(row.tag)).map(row => row.id);

  let existing: any[] = [];
  let createdTitleForThisCopy = false;
  if (input.isbn?.trim()) {
    existing = await sbJson<any[]>(`/book_titles?isbn=eq.${encodeURIComponent(input.isbn)}&limit=1`);
  }
  if (existing.length === 0) {
    existing = await sbJson<any[]>(`/book_titles?title=ilike.${encodeURIComponent(input.title)}&author=ilike.${encodeURIComponent(input.author)}&limit=1`);
  }

  let titleId: string;
  let copyAgeGroup = ageGroupKey;
  if (existing.length > 0) {
    titleId = existing[0].id;
    const existingCopies = await sbJson<{ id: string }[]>(`/book_copies?book_title_id=eq.${titleId}&select=id&limit=1`);
    const titleAgeGroup = existingCopies.length === 0 ? ageGroupKey : (normalizeAgeGroup(existing[0].age_group) ?? ageGroupKey);
    copyAgeGroup = titleAgeGroup;
    await sbVoid(`/book_titles?id=eq.${titleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        cover_url: input.cover_url ?? existing[0].cover_url,
        publisher: input.publisher ?? existing[0].publisher,
        published_date: input.published_date ?? existing[0].published_date,
        page_count: input.page_count ?? existing[0].page_count,
        description: input.description ?? existing[0].description,
        subjects: input.subjects ?? existing[0].subjects,
        age_group: titleAgeGroup,
        bin_theme: binTheme ?? existing[0].bin_theme ?? null,
        tag_ids: tagIds.length > 0 ? tagIds : (existing[0].tag_ids ?? null),
        updated_at: new Date().toISOString(),
      }),
      headers: { Prefer: "return=minimal" },
    });
  } else {
    const newTitle = await sbJson<any[]>("/book_titles", {
      method: "POST",
      body: JSON.stringify({
        isbn: input.isbn,
        title: input.title,
        author: input.author,
        cover_url: input.cover_url ?? null,
        age_group: copyAgeGroup,
        bin_theme: binTheme,
        tag_ids: tagIds,
        publisher: input.publisher ?? null,
        published_date: input.published_date ?? null,
        page_count: input.page_count ?? null,
        description: input.description ?? null,
        subjects: input.subjects ?? null,
      }),
    });
    titleId = newTitle[0].id;
    createdTitleForThisCopy = true;
  }

  const canonicalBinId = getBinCodeForAgeGroupAndTheme(copyAgeGroup, binTheme) ?? input.bin_id;
  let section = normalizeShelvingSection(input.section);
  if (requiresShelvingSection(copyAgeGroup)) {
    if (!binTheme) throw new Error("Choose a theme before assigning a section for Soarers or Sky Readers.");
    if (input.auto_pick_section) {
      section = await pickNextShelvingSection({ ageGroup: copyAgeGroup, theme: binTheme, binId: canonicalBinId });
    }
    if (!section) throw new Error("Section is required for Soarers and Sky Readers.");
  } else {
    section = null;
  }
  const agePrefix = getSkuPrefixForAgeGroup(copyAgeGroup);
  const allSkuData = await sbJson<{ sku: string }[]>(`/book_copies?age_group=eq.${copyAgeGroup}&select=sku&order=sku.asc&limit=10000`);
  const usedNumbers = new Set(allSkuData.map(r => {
    const m = r.sku.match(/(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  }).filter((n): n is number => n !== null));
  let nextNum = 1;
  while (usedNumbers.has(nextNum)) nextNum++;
  const sku = `BN-${agePrefix}-${String(nextNum).padStart(6, "0")}`;

  let copy: any[] = [];
  try {
    copy = await sbJson<any[]>("/book_copies", {
      method: "POST",
      body: JSON.stringify({
        sku,
        book_title_id: titleId,
        isbn: input.isbn,
        age_group: copyAgeGroup,
        bin_id: canonicalBinId,
        section,
        status: BOOK_COPY_STATUSES.pendingQc,
        condition: input.condition,
        label_status: LABEL_STATUSES.pending,
        received_at: new Date().toISOString(),
      }),
    });
  } catch (error) {
    if (createdTitleForThisCopy) {
      await sbVoid(`/book_titles?id=eq.${titleId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined);
    }
    throw error;
  }
  if (!copy[0]?.id) {
    if (createdTitleForThisCopy) {
      await sbVoid(`/book_titles?id=eq.${titleId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => undefined);
    }
    throw new Error("Book title saved, but no physical copy was created.");
  }
  return { success: true, sku, copy_id: copy[0].id, title_id: titleId, location: formatInventoryLocation(canonicalBinId, section) };
}