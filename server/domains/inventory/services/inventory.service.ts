import {
  BOOK_COPY_STATUSES,
  LABEL_STATUSES,
  TERMINAL_BOOK_COPY_STATUSES,
  formatInventoryLocation,
  normalizeShelvingSection,
  requiresShelvingSection,
} from "@shared/booknest";
import {
  getBinConfigs,
  getBookCopies,
  getBookTitlesWithCopies,
  getInventorySummary,
  sbFetch,
  sbJson,
} from "../../../supabase";

export async function getInventorySummaryService() {
  return getInventorySummary();
}

export async function getInventoryBookTitles(input: any) {
  return getBookTitlesWithCopies(input ?? {});
}

export async function getInventoryBookCopies(input: any) {
  return getBookCopies(input ?? {});
}

export async function getInventoryBins() {
  return getBinConfigs();
}

export async function getBookDetail(input: { id: string }) {
  const titleRes = await sbFetch(
    `/book_titles?id=eq.${input.id}&limit=1&select=id,title,author,isbn,age_group,suggested_age_tier,bin_theme,tag_ids,cover_url,publisher,published_date,page_count,description,subjects,metadata_source,classification_version,created_at,updated_at`
  );
  if (!titleRes.ok) {
    throw new Error("Failed to fetch book title: " + (await titleRes.text()));
  }
  const titles: any[] = await titleRes.json();
  if (!titles[0]) return null;
  const title = titles[0];

  const copiesRes = await sbFetch(
    `/book_copies?book_title_id=eq.${input.id}&order=sku.asc&limit=200&select=id,sku,isbn,age_group,bin_id,section,status,condition,label_status,received_at,created_at,updated_at`
  );
  const copies: any[] = copiesRes.ok ? await copiesRes.json() : [];

  let tags: any[] = [];
  if (Array.isArray(title.tag_ids) && title.tag_ids.length > 0) {
    const tagRes = await sbFetch(
      `/book_sorting_tags?id=in.(${title.tag_ids.join(",")})&select=id,bin_theme,tag`
    );
    tags = tagRes.ok ? await tagRes.json() : [];
  }

  return {
    ...title,
    tags,
    copies: copies.map(copy => ({
      ...copy,
      location: formatInventoryLocation(copy.bin_id, copy.section),
    })),
  };
}

export async function updateInventoryCopy(input: any) {
  const { id, ...fields } = input;
  const patch: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (fields.sku !== undefined) patch.sku = fields.sku;
  if (fields.bin_id !== undefined) patch.bin_id = fields.bin_id;
  if (fields.section !== undefined) {
    const [copy] = await sbJson<{ id: string; age_group: string | null }[]>(
      `/book_copies?id=eq.${id}&select=id,age_group&limit=1`
    );
    if (!copy) throw new Error("Book copy not found");
    const section = normalizeShelvingSection(fields.section);
    if (requiresShelvingSection(copy.age_group) && !section) {
      throw new Error("Section is required for Soarers and Sky Readers.");
    }
    patch.section = section;
  }
  if (fields.status !== undefined) {
    patch.status = fields.status;
    if (TERMINAL_BOOK_COPY_STATUSES.has(fields.status)) {
      patch.label_status = LABEL_STATUSES.notRequired;
    } else if (fields.status === BOOK_COPY_STATUSES.pendingLabel) {
      patch.label_status = LABEL_STATUSES.pending;
    }
  }
  if (fields.condition !== undefined) patch.condition = fields.condition;
  if (fields.notes !== undefined) patch.notes = fields.notes;
  if (fields.age_group !== undefined) patch.age_group = fields.age_group;
  const res = await sbFetch(`/book_copies?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    headers: { Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`Failed to update copy: ${await res.text()}`);
  return { success: true };
}