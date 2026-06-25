import { COOKIE_NAME } from "@shared/const";
import {
  BOOK_TAG_TO_THEME,
  BOOK_COPY_STATUSES,
  LABEL_STATUSES,
  TERMINAL_BOOK_COPY_STATUSES,
  formatInventoryLocation,
  getAgeGroupLabel,
  getBinCodeForAgeGroupAndTheme,
  getSectionCapacity,
  getThemeFromBookSignals,
  getSkuPrefixForAgeGroup,
  normalizeAgeGroup,
  sanitizeBookTags,
  normalizeShelvingSection,
  requiresShelvingSection,
  sectionIndexToLabel,
} from "@shared/booknest";
import { z } from "zod";
import { getSessionCookieOptions } from "../../_core/cookies";
import { systemRouter } from "../../_core/systemRouter";
import { operatorProcedure, publicProcedure, router } from "../../_core/trpc";
import { pickingRouter } from "../fulfillment/picking.router";
import { shippingRouter } from "../fulfillment/shipping.router";
import { packingRouter } from "../fulfillment/packing.router";
import {
  ensureMemberDefaultAddressFromShopify,
  type MemberAddressRow,
} from "../../shopify-address";
import {
  getBinConfigs,
  getBookCopies,
  getBookTitlesWithCopies,
  getDashboardStats,
  getInventorySummary,
  getMemberAddress,
  getMemberById,
  getMembers,
  getShipmentBooks,
  getShipmentById,
  getShipments,
  updateShipmentStatus,
  sbFetch,
  sbJson,
  sbVoid,
} from "../../supabase";
import { isbnRouter } from "../inventory/isbn.router";
import { createReturnsService } from "../returns/services/returns.service";
import { getMemberCycleState } from "../returns/services/member-cycle.guard";
import {
  getShipmentDetail,
  listAllShipments,
  listShipments,
  updateShipmentStatusService,
  updateShipmentTracking,
} from "../fulfillment/services/shipments.service";
import {
  getBookDetail,
  getInventoryBins,
  getInventoryBookCopies,
  getInventoryBookTitles,
  getInventorySummaryService,
  updateInventoryCopy,
} from "../inventory/services/inventory.service";
import { getPendingLabels, markLabelsPrinted } from "../inventory/services/labels.service";
import { receiveBook } from "../inventory/services/receive.service";
import {
  confirmAllStockPlaced,
  confirmStockPlaced,
  failQc,
  getQcCount,
  getQcQueue,
  getStockBins,
  getStockCount,
  getStockQueue,
  passAllQc,
  passQc,
} from "../inventory/services/workflow.service";
import { selectBooksForPickingOrder } from "../fulfillment/services/book-selection";

type ReturnBookOutcome = "received" | "missing" | "issue";

function getNextShipDate(): string {
  const today = new Date();
  const dow = today.getDay();
  const daysUntilTue = (2 - dow + 7) % 7;
  const daysUntilFri = (5 - dow + 7) % 7;
  const daysUntilNext = Math.min(daysUntilTue, daysUntilFri);
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntilNext);
  return next.toISOString().split("T")[0];
}

function nextUnusedNumber(
  existingValues: Array<string | null>,
  prefix: string,
  start: number,
  width: number
): string {
  const used = new Set(existingValues.filter(Boolean));
  let next = start;
  let candidate = "";
  do {
    candidate = `${prefix}${String(next).padStart(width, "0")}`;
    next++;
  } while (used.has(candidate));
  return candidate;
}

function addLocation<T extends { bin_id?: string | null; section?: string | null }>(
  row: T
): T & { location: string | null } {
  return {
    ...row,
    location: formatInventoryLocation(row.bin_id, row.section),
  };
}

async function pickNextShelvingSection(input: {
  ageGroup: string | null | undefined;
  theme: string | null | undefined;
  binId?: string | null;
}): Promise<string | null> {
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

function sortSectionableBooks<T extends {
  title?: string | null;
  created_at?: string | null;
  id: string;
}>(books: T[]): T[] {
  return [...books].sort((a, b) => {
    const titleCompare = (a.title ?? "").localeCompare(b.title ?? "");
    if (titleCompare !== 0) return titleCompare;
    const createdCompare = (a.created_at ?? "").localeCompare(b.created_at ?? "");
    if (createdCompare !== 0) return createdCompare;
    return a.id.localeCompare(b.id);
  });
}

async function syncMemberInterests(
  memberId: string,
  interests: string[]
): Promise<void> {
  const uniqueInterests = Array.from(
    new Set(interests.map(interest => interest.trim()).filter(Boolean))
  );

  await sbVoid(`/member_interests?member_id=eq.${memberId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });

  if (!uniqueInterests.length) return;

  await sbVoid("/member_interests", {
    method: "POST",
    body: JSON.stringify(
      uniqueInterests.map(interest => ({
        member_id: memberId,
        interest_category: interest,
      }))
    ),
    headers: { Prefer: "return=minimal" },
  });
}

async function createPickingOrderForMember(input: {
  member_id: string;
  source?: "manual" | "return";
}) {
  const now = new Date().toISOString();

  const cycle = await getMemberCycleState(input.member_id);
  if (cycle.open) {
    return {
      created: false,
      shipment_id: cycle.shipment?.id ?? null,
      status: cycle.shipment?.status ?? cycle.returnRecord?.status ?? null,
      reason: "open_shipment_exists",
    };
  }

  const [member] = await sbJson<
    {
      id: string;
      name: string | null;
      tier: string | null;
      age_group: string | null;
      books_per_box: number | null;
      topics_to_avoid: string[] | null;
      notes: string | null;
      subscription_status: string | null;
      welcome_form_completed: boolean | null;
    }[]
  >(
    `/members?id=eq.${input.member_id}&select=id,name,tier,age_group,books_per_box,topics_to_avoid,notes,subscription_status,welcome_form_completed&limit=1`
  );

  if (!member) throw new Error("Member not found.");
  if (member.subscription_status !== "active") {
    throw new Error("Member must have an active subscription before creating a new bundle.");
  }
  if (!member.welcome_form_completed) {
    throw new Error("Member must complete the welcome form before creating a new bundle.");
  }

  const { selectedCopies, noteMatchByCopyId, booksNeeded } =
    await selectBooksForPickingOrder({ member });
  if (selectedCopies.length < booksNeeded) {
    throw new Error(
      `Not enough never-before-sent in-house books for ${member.name ?? "this member"} (${selectedCopies.length}/${booksNeeded}).`
    );
  }

  let defaultAddress: MemberAddressRow | null = null;
  try {
    defaultAddress = await ensureMemberDefaultAddressFromShopify(member.id);
  } catch (error) {
    console.warn(
      `[createPickingOrderForMember] Could not sync Shopify address for member ${member.id}:`,
      error
    );
  }

  const countRes = await sbFetch("/shipments?select=id", {
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const total = parseInt(
    countRes.headers.get("content-range")?.split("/")[1] ?? "0",
    10
  );
  const existingNumbers = await sbJson<
    { shipment_number: string | null; order_number: string | null }[]
  >("/shipments?select=shipment_number,order_number&limit=10000");
  const shipmentNumber = nextUnusedNumber(
    existingNumbers.map(row => row.shipment_number),
    "SHP-",
    total + 1,
    6
  );
  const orderNumber = nextUnusedNumber(
    existingNumbers.map(row => row.order_number),
    "BN-",
    total + 1001,
    4
  );

  const shipmentRows = await sbJson<{ id: string }[]>("/shipments", {
    method: "POST",
    body: JSON.stringify({
      member_id: member.id,
      status: "picking",
      shipment_type: "outbound",
      shipment_number: shipmentNumber,
      order_number: orderNumber,
      address_id: defaultAddress?.id ?? null,
      scheduled_ship_date: getNextShipDate(),
      created_at: now,
      updated_at: now,
    }),
  });
  const shipment = shipmentRows[0];
  if (!shipment?.id) throw new Error("Failed to create shipment.");

  try {
    await sbVoid("/shipment_books", {
      method: "POST",
      body: JSON.stringify(
        selectedCopies.map((copy, index) => ({
          shipment_id: shipment.id,
          book_title_id: copy.book_title_id,
          book_copy_id: copy.id,
          status: "ready_for_picking",
          selection_reason:
            noteMatchByCopyId.get(copy.id)?.reasons.join("; ") ||
            (index === 0 ? input.source ?? "manual" : "matched"),
          match_score: noteMatchByCopyId.get(copy.id)?.score ?? null,
          created_at: now,
        }))
      ),
      headers: { Prefer: "return=minimal" },
    });

  } catch (error) {
    await sbVoid(`/shipments?id=eq.${shipment.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "cancelled",
        updated_at: now,
      }),
      headers: { Prefer: "return=minimal" },
    }).catch(() => undefined);
    throw error;
  }

  return {
    created: true,
    shipment_id: shipment.id,
    shipment_number: shipmentNumber,
    order_number: orderNumber,
    books_assigned: selectedCopies.length,
  };
}

/**
 * Preserved Phase 1 implementation. Domain entry points re-export these
 * route namespaces while handler migration proceeds one domain at a time.
 */
const returnsService = createReturnsService(createPickingOrderForMember);

export const legacyAppRouter = router({
  system: systemRouter,
  picking: pickingRouter,
  packing: packingRouter,
  shipping: shippingRouter,
  isbn: isbnRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── Dashboard ──────────────────────────────────────────────────────────────
  dashboard: router({
    stats: operatorProcedure.query(async () => {
      return getDashboardStats();
    }),
  }),

  // ─── Members ────────────────────────────────────────────────────────────────
  members: router({
    list: operatorProcedure.query(async () => {
      return getMembers();
    }),

    byId: operatorProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const member = await getMemberById(input.id);
        if (!member) return null;

        const [address, shipmentsRes, keptBooksRes, creditsRes] =
          await Promise.all([
            getMemberAddress(input.id),
            sbFetch(
              `/shipments?member_id=eq.${input.id}&order=created_at.desc&limit=50&select=id,order_number,shipment_number,status,scheduled_ship_date,actual_ship_date,tracking_number,shipment_type`
            ),
            sbFetch(
              `/member_book_history?member_id=eq.${input.id}&kept=eq.true&select=id,book_title_id,shipment_id,received_date&limit=100`
            ),
            sbFetch(
              `/member_credits?member_id=eq.${input.id}&limit=1&select=credits_available,next_issue_at`
            ),
          ]);

        const shipments: any[] = await shipmentsRes.json();
        const keptBooks: any[] = await keptBooksRes.json();
        const credits: any[] = await creditsRes.json();

        // Fetch book titles for kept books
        let keptBooksWithTitles: any[] = [];
        if (keptBooks.length > 0) {
          const titleIds = [...new Set(keptBooks.map(b => b.book_title_id))];
          const titlesRes = await sbFetch(
            `/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author&limit=100`
          );
          const titles: any[] = await titlesRes.json();
          const titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
          keptBooksWithTitles = keptBooks.map(b => ({
            ...b,
            book_title: titleMap[b.book_title_id] ?? null,
          }));
        }

        return {
          ...member,
          address,
          shipments,
          keptBooks: keptBooksWithTitles,
          creditsAvailable: credits[0]?.credits_available ?? 0,
          nextCreditAt: credits[0]?.next_issue_at ?? null,
        };
      }),

    requestBundle: operatorProcedure
      .input(z.object({ member_id: z.string() }))
      .mutation(async ({ input }) => {
        return createPickingOrderForMember({
          member_id: input.member_id,
          source: "manual",
        });
      }),

    create: operatorProcedure
      .input(
        z.object({
          name: z.string(),
          email: z.string(),
          phone: z.string().optional(),
          tier: z.string(),
          age_group: z.string().optional(),
          subscription_status: z.string(),
          is_founding_flock: z.boolean().optional(),
          street: z.string().optional(),
          street2: z.string().optional(),
          city: z.string().optional(),
          state: z.string().optional(),
          zip: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { street, street2, city, state, zip, ...memberData } = input;
        const memberRes = await sbFetch("/members", {
          method: "POST",
          body: JSON.stringify({
            ...memberData,
            age_group: memberData.age_group
              ? getAgeGroupLabel(memberData.age_group)
              : null,
            welcome_form_completed: false,
            is_vip: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=representation" },
        });
        if (!memberRes.ok) throw new Error("Failed to create member");
        const [member] = await memberRes.json();
        const creditCount =
          input.tier === "Story Nest" ? 2 : input.tier === "Cozy Nest" ? 1 : 0;
        if (creditCount > 0) {
          const nextIssueAt = new Date();
          nextIssueAt.setFullYear(nextIssueAt.getFullYear() + 1);
          await sbFetch("/member_credits", {
            method: "POST",
            body: JSON.stringify({
              member_id: member.id,
              credits_available: creditCount,
              last_issued_at: new Date().toISOString(),
              next_issue_at: nextIssueAt.toISOString(),
            }),
          });
        }
        if (street && city && state && zip) {
          await sbFetch("/member_addresses", {
            method: "POST",
            body: JSON.stringify({
              member_id: member.id,
              address_type: "shipping",
              street,
              street2: street2 || null,
              city,
              state,
              zip,
              country: "US",
              is_default: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
          });
        }
        return { success: true, id: member.id };
      }),
  }), // ← closes members router

  // ─── Inventory ──────────────────────────────────────────────────────────────
  inventory: router({
    summary: operatorProcedure.query(async () => getInventorySummaryService()),
    bookTitles: operatorProcedure
      .input(
        z.object({ limit: z.number().optional(), offset: z.number().optional(), search: z.string().optional(), age_group: z.string().optional() }).optional()
      )
      .query(async ({ input }) => getInventoryBookTitles(input)),
    bookCopies: operatorProcedure
      .input(
        z.object({ status: z.string().optional(), bin_id: z.string().optional(), age_group: z.string().optional(), limit: z.number().optional() }).optional()
      )
      .query(async ({ input }) => getInventoryBookCopies(input)),
    bins: operatorProcedure.query(async () => getInventoryBins()),
    sectionBackfillPreview: operatorProcedure
      .input(z.object({ force: z.boolean().optional() }).optional())
      .query(async ({ input }) => {
        const force = input?.force ?? false;
        const sectionFilter = force ? "" : "&section=is.null";
        const rows = await sbJson<
          {
            id: string;
            age_group: string | null;
            bin_id: string | null;
            section: string | null;
            book_titles: { title: string | null; bin_theme: string | null } | null;
          }[]
        >(
          `/book_copies?or=(age_group.ilike.*soar*,age_group.ilike.*sky*)&bin_id=not.is.null${sectionFilter}&status=in.(in_house,pending_stock,pending_label,pending_qc,returned,restricted)&select=id,age_group,bin_id,section,book_titles(title,bin_theme)&limit=10000`
        );

        const groups = new Map<string, { age_group: string; theme: string | null; bin_id: string; count: number }>();
        for (const row of rows) {
          if (!requiresShelvingSection(row.age_group) || !row.bin_id) continue;
          const key = `${normalizeAgeGroup(row.age_group)}:${row.book_titles?.bin_theme ?? ""}:${row.bin_id}`;
          const existing = groups.get(key);
          if (existing) {
            existing.count++;
          } else {
            groups.set(key, {
              age_group: normalizeAgeGroup(row.age_group) ?? row.age_group ?? "",
              theme: row.book_titles?.bin_theme ?? null,
              bin_id: row.bin_id,
              count: 1,
            });
          }
        }

        return {
          force,
          total: rows.length,
          groups: Array.from(groups.values()).sort((a, b) =>
            `${a.age_group}-${a.bin_id}`.localeCompare(`${b.age_group}-${b.bin_id}`)
          ),
        };
      }),

    backfillSections: operatorProcedure
      .input(z.object({ force: z.boolean().optional() }).optional())
      .mutation(async ({ input }) => {
        const force = input?.force ?? false;
        const sectionFilter = force ? "" : "&section=is.null";
        const rows = await sbJson<
          {
            id: string;
            age_group: string | null;
            bin_id: string | null;
            section: string | null;
            created_at: string | null;
            book_titles: { title: string | null; bin_theme: string | null } | null;
          }[]
        >(
          `/book_copies?or=(age_group.ilike.*soar*,age_group.ilike.*sky*)&bin_id=not.is.null${sectionFilter}&status=in.(in_house,pending_stock,pending_label,pending_qc,returned,restricted)&select=id,age_group,bin_id,section,created_at,book_titles(title,bin_theme)&limit=10000`
        );

        const grouped = new Map<string, typeof rows>();
        for (const row of rows) {
          if (!requiresShelvingSection(row.age_group) || !row.bin_id) continue;
          const key = `${normalizeAgeGroup(row.age_group)}:${row.book_titles?.bin_theme ?? ""}:${row.bin_id}`;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(row);
        }

        let updated = 0;
        const now = new Date().toISOString();
        for (const groupRows of grouped.values()) {
          const first = groupRows[0];
          const capacity = getSectionCapacity(first.age_group) ?? 25;
          const counts = new Map<string, number>();

          if (!force) {
            const existing = await sbJson<{ section: string | null }[]>(
              `/book_copies?age_group=eq.${encodeURIComponent(normalizeAgeGroup(first.age_group) ?? first.age_group ?? "")}&bin_id=eq.${encodeURIComponent(first.bin_id ?? "")}&section=not.is.null&status=in.(in_house,pending_stock,pending_label,pending_qc,returned,restricted)&select=section&limit=10000`
            );
            for (const row of existing) {
              const section = normalizeShelvingSection(row.section);
              if (section) counts.set(section, (counts.get(section) ?? 0) + 1);
            }
          }

          for (const row of sortSectionableBooks(
            groupRows.map(groupRow => ({
              ...groupRow,
              title: groupRow.book_titles?.title ?? null,
            }))
          )) {
            let section = "A";
            for (let index = 0; ; index++) {
              const candidate = sectionIndexToLabel(index);
              if ((counts.get(candidate) ?? 0) < capacity) {
                section = candidate;
                break;
              }
            }

            await sbVoid(`/book_copies?id=eq.${row.id}`, {
              method: "PATCH",
              body: JSON.stringify({ section, updated_at: now }),
              headers: { Prefer: "return=minimal" },
            });
            counts.set(section, (counts.get(section) ?? 0) + 1);
            updated++;
          }
        }

        return { success: true, updated, force };
      }),

    getBookDetail: operatorProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => getBookDetail(input)),
    updateCopy: operatorProcedure
      .input(
        z.object({
          id: z.string(), sku: z.string().optional(), bin_id: z.string().optional(),
          section: z.string().nullable().optional(), status: z.string().optional(),
          condition: z.string().optional(), notes: z.string().optional(), age_group: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => updateInventoryCopy(input)),
    updateBookTitle: operatorProcedure
      .input(
        z.object({
          id: z.string(),
          title: z.string().optional(),
          author: z.string().optional(),
          age_group: z.string().optional(),
          bin_theme: z.string().optional(),
          isbn: z.string().optional(),
          cover_url: z.string().optional(),
          publisher: z.string().optional(),
          published_date: z.string().optional(),
          page_count: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...fields } = input;
        const now = new Date().toISOString();

        const existingTitleRes = await sbFetch(
          `/book_titles?id=eq.${id}&limit=1&select=id,age_group,bin_theme`
        );

        if (!existingTitleRes.ok) {
          throw new Error(
            `Failed to load existing book title: ${await existingTitleRes.text()}`
          );
        }

        const existingTitles: {
          id: string;
          age_group: string | null;
          bin_theme: string | null;
        }[] = await existingTitleRes.json();

        const existingTitle = existingTitles[0];

        if (!existingTitle) {
          throw new Error("Book title not found");
        }

        const oldAgeGroup =
          normalizeAgeGroup(existingTitle.age_group) ?? existingTitle.age_group;
        const newAgeGroup =
          fields.age_group !== undefined
            ? (normalizeAgeGroup(fields.age_group) ?? fields.age_group)
            : oldAgeGroup;

        const ageChanged =
          fields.age_group !== undefined && oldAgeGroup !== newAgeGroup;

        const updateFields: Record<string, any> = {};

        if (fields.title !== undefined) updateFields.title = fields.title;
        if (fields.author !== undefined) updateFields.author = fields.author;
        if (fields.age_group !== undefined)
          updateFields.age_group = newAgeGroup;
        if (fields.bin_theme !== undefined)
          updateFields.bin_theme = fields.bin_theme;
        if (fields.isbn !== undefined) updateFields.isbn = fields.isbn;
        if (fields.cover_url !== undefined)
          updateFields.cover_url = fields.cover_url;
        if (fields.publisher !== undefined)
          updateFields.publisher = fields.publisher;
        if (fields.published_date !== undefined)
          updateFields.published_date = fields.published_date;
        if (fields.page_count !== undefined) {
          updateFields.page_count =
            fields.page_count.trim() === "" ? null : Number(fields.page_count);
        }

        const res = await sbFetch(`/book_titles?id=eq.${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            ...updateFields,
            updated_at: now,
          }),
          headers: { Prefer: "return=representation" },
        });

        if (!res.ok) {
          throw new Error(`Failed to update book title: ${await res.text()}`);
        }

        const updatedTitles = await res.json();
        const updatedTitle = updatedTitles[0];

        if (fields.age_group !== undefined) {
          const copiesRes = await sbFetch(
            `/book_copies?book_title_id=eq.${id}&select=id,sku&order=sku.asc&limit=1000`
          );

          if (!copiesRes.ok) {
            throw new Error(
              `Failed to load copies for SKU sync: ${await copiesRes.text()}`
            );
          }

          const copies: { id: string; sku: string | null }[] =
            await copiesRes.json();

          const newPrefix = getSkuPrefixForAgeGroup(newAgeGroup);
          const copyBinId =
            getBinCodeForAgeGroupAndTheme(
              newAgeGroup,
              fields.bin_theme ?? existingTitle.bin_theme
            ) ?? undefined;

          const existingSkusRes = await sbFetch(
            `/book_copies?age_group=eq.${newAgeGroup}&select=sku&limit=10000`
          );

          if (!existingSkusRes.ok) {
            throw new Error(
              `Failed to load existing SKUs: ${await existingSkusRes.text()}`
            );
          }

          const existingSkus: { sku: string }[] = await existingSkusRes.json();

          const usedNumbers = new Set<number>();

          for (const row of existingSkus) {
            const match = row.sku?.match(/(\d+)$/);
            if (match) usedNumbers.add(Number(match[1]));
          }

          let nextNumber = 1;

          for (const copy of copies) {
            const alreadyCorrectPrefix = copy.sku?.startsWith(
              `BN-${newPrefix}-`
            );

            let newSku = copy.sku;

            if (!alreadyCorrectPrefix) {
              while (usedNumbers.has(nextNumber)) nextNumber++;

              newSku = `BN-${newPrefix}-${String(nextNumber).padStart(6, "0")}`;
              usedNumbers.add(nextNumber);
              nextNumber++;
            }

            const copyUpdateRes = await sbFetch(
              `/book_copies?id=eq.${copy.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  sku: newSku,
                  age_group: newAgeGroup,
                  ...(copyBinId ? { bin_id: copyBinId } : {}),
                  section: null,
                  updated_at: now,
                }),
                headers: { Prefer: "return=minimal" },
              }
            );

            if (!copyUpdateRes.ok) {
              throw new Error(
                `Failed to sync copy age/SKU: ${await copyUpdateRes.text()}`
              );
            }
          }
        } else if (fields.bin_theme !== undefined) {
          const copyBinId =
            getBinCodeForAgeGroupAndTheme(newAgeGroup, fields.bin_theme) ??
            undefined;
          if (copyBinId) {
            await sbVoid(`/book_copies?book_title_id=eq.${id}`, {
              method: "PATCH",
              body: JSON.stringify({
                bin_id: copyBinId,
                section: null,
                updated_at: now,
              }),
              headers: { Prefer: "return=minimal" },
            });
          }
        }

        return {
          success: true,
          book: updatedTitle,
          skuRegenerated: ageChanged,
        };
      }),

    // ── In Flight — books currently with members, grouped by member ─────────────
    inTransit: operatorProcedure.query(async () => {
      // 1. Get all in_transit copies with book title
      const res = await sbFetch(
        `/book_copies?status=eq.in_transit&select=id,sku,bin_id,section,book_title_id,book_titles(id,title,author)&limit=500&order=sku.asc`
      );
      if (!res.ok) return [];
      const copies: any[] = await res.json();
      if (!copies.length) return [];

      // 2. Find most recent shipment_books row per copy
      const copyIds = copies.map(c => c.id).join(",");
      const sbRes = await sbFetch(
        `/shipment_books?book_copy_id=in.(${copyIds})&select=book_copy_id,shipment_id&order=created_at.desc&limit=1000`
      );
      const shipmentBooks: any[] = sbRes.ok ? await sbRes.json() : [];

      const copyToShipment: Record<string, string> = {};
      for (const sb of shipmentBooks) {
        if (!copyToShipment[sb.book_copy_id]) {
          copyToShipment[sb.book_copy_id] = sb.shipment_id;
        }
      }

      // 3. Fetch members for those shipments
      const shipmentIds = [...new Set(Object.values(copyToShipment))];
      const copyToMemberId: Record<string, string> = {};
      const memberNameMap: Record<string, string> = {};

      if (shipmentIds.length > 0) {
        const shipmentsRes = await sbFetch(
          `/shipments?id=in.(${shipmentIds.join(",")})&select=id,member_id&limit=500`
        );
        const shipments: any[] = shipmentsRes.ok
          ? await shipmentsRes.json()
          : [];
        const shipmentToMember: Record<string, string> = Object.fromEntries(
          shipments.map(s => [s.id, s.member_id])
        );

        const memberIds = [...new Set(shipments.map(s => s.member_id))];
        if (memberIds.length > 0) {
          const membersRes = await sbFetch(
            `/members?id=in.(${memberIds.join(",")})&select=id,child_name,name&limit=500`
          );
          const members: any[] = membersRes.ok ? await membersRes.json() : [];
          for (const m of members) {
            memberNameMap[m.id] = m.child_name ?? m.name ?? "Unknown";
          }
          for (const [copyId, shipmentId] of Object.entries(copyToShipment)) {
            const memberId = shipmentToMember[shipmentId];
            if (memberId) copyToMemberId[copyId] = memberId;
          }
        }
      }

      // 4. Group copies by member
      const grouped: Record<
        string,
        { member_id: string; member_name: string; books: any[] }
      > = {};
      for (const c of copies) {
        const memberId = copyToMemberId[c.id] ?? "unknown";
        const memberName =
          memberId !== "unknown"
            ? (memberNameMap[memberId] ?? "Unknown")
            : "Unknown";
        if (!grouped[memberId]) {
          grouped[memberId] = {
            member_id: memberId,
            member_name: memberName,
            books: [],
          };
        }
        grouped[memberId].books.push({
          id: c.id,
          sku: c.sku,
          bin_id: c.bin_id,
          section: c.section,
          location: formatInventoryLocation(c.bin_id, c.section),
          book_title_id: c.book_title_id,
          title: c.book_titles?.title ?? "Unknown",
          author: c.book_titles?.author ?? "",
        });
      }

      return Object.values(grouped).sort((a, b) =>
        a.member_name.localeCompare(b.member_name)
      );
    }),
  }), // ← closes inventory router

  // ─── Shipments / Orders ─────────────────────────────────────────────────────
  shipments: router({
    list: operatorProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => listShipments(input)),
    byId: operatorProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => getShipmentDetail(input)),
    updateTracking: operatorProcedure
      .input(z.object({ id: z.string(), tracking_number: z.string(), carrier: z.string().optional() }))
      .mutation(async ({ input }) => updateShipmentTracking(input)),
    updateStatus: operatorProcedure
      .input(z.object({ id: z.string(), status: z.string(), tracking_number: z.string().optional(), carrier: z.string().optional(), actual_ship_date: z.string().optional() }))
      .mutation(async ({ input }) => updateShipmentStatusService(input)),
    listAll: operatorProcedure.query(async () => listAllShipments()),
  }),
  labels: router({
    pending: operatorProcedure.query(async () => getPendingLabels()),
    markPrinted: operatorProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(async ({ input }) => markLabelsPrinted(input)),
  }),
  receive: router({
    addBook: operatorProcedure
      .input(
        z.object({
          isbn: z.string(), title: z.string(), author: z.string(),
          cover_url: z.string().nullable().optional(), publisher: z.string().nullable().optional(),
          published_date: z.string().nullable().optional(), page_count: z.number().nullable().optional(),
          description: z.string().nullable().optional(), subjects: z.array(z.string()).optional(),
          age_group: z.string(), bin_id: z.string(), bin_theme: z.string().optional(),
          section: z.string().nullable().optional(), auto_pick_section: z.boolean().optional(),
          condition: z.string().default("good"), tags: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => receiveBook(input)),
  }),
  qc: router({
    queue: operatorProcedure.query(async () => getQcQueue()),
    count: operatorProcedure.query(async () => getQcCount()),
    pass: operatorProcedure
      .input(z.object({ copy_id: z.string(), condition: z.string(), notes: z.string().optional(), reprint_label: z.boolean().optional() }))
      .mutation(async ({ input }) => passQc(input)),
    fail: operatorProcedure
      .input(z.object({ copy_id: z.string(), notes: z.string().optional() }))
      .mutation(async ({ input }) => failQc(input)),
    passAll: operatorProcedure
      .input(z.object({ copy_ids: z.array(z.string()) }))
      .mutation(async ({ input }) => passAllQc(input)),
  }),
  stock: router({
    queue: operatorProcedure.query(async () => getStockQueue()),
    count: operatorProcedure.query(async () => getStockCount()),
    bins: operatorProcedure.query(async () => getStockBins()),
    confirmPlaced: operatorProcedure
      .input(z.object({ copy_id: z.string(), bin_id: z.string().optional(), section: z.string().nullable().optional() }))
      .mutation(async ({ input }) => confirmStockPlaced(input)),
    confirmAll: operatorProcedure
      .input(z.object({ copy_ids: z.array(z.string()) }))
      .mutation(async ({ input }) => confirmAllStockPlaced(input)),
  }),
  donations: router({
    list: operatorProcedure.query(async () => {
      const res = await sbFetch("/donations?order=created_at.desc&limit=200", {
        headers: { Prefer: "count=exact" },
      });
      if (!res.ok) return { data: [], total: 0 };
      const total = parseInt(
        res.headers.get("content-range")?.split("/")[1] ?? "0",
        10
      );
      const data = await res.json();
      return { data, total };
    }),

    add: operatorProcedure
      .input(
        z.object({
          donor_name: z.string().nullable().optional(),
          donor_email: z.string().nullable().optional(),
          isbn: z.string().nullable().optional(),
          title: z.string(),
          author: z.string(),
          condition: z.string(),
          age_group: z.string().nullable().optional(),
          bin_id: z.string().nullable().optional(),
          tags: z.array(z.string()).optional(),
          notes: z.string().nullable().optional(),
          status: z.string().default("received"),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch("/donations", {
          method: "POST",
          body: JSON.stringify({
            ...input,
            tags: input.tags ?? [],
            created_at: new Date().toISOString(),
          }),
        });
        if (!res.ok)
          throw new Error(`Failed to save donation: ${await res.text()}`);
        const data = await res.json();
        return { success: true, id: data[0]?.id };
      }),
  }),

  // ─── Welcome Form ─────────────────────────────────────────────────────────
  welcome: router({
    // Load household by token — returns all children needing profiles
    load: publicProcedure
      .input(z.object({ token: z.string() }))
      .query(async ({ input }) => {
        // Look up household by token
        const householdRes = await sbFetch(
          `/households?welcome_token=eq.${input.token}&limit=1`
        );
        const households: any[] = await householdRes.json();
        if (!households[0]) return null;
        const household = households[0];

        // Check token expiry
        if (household.welcome_token_expires_at) {
          const expires = new Date(household.welcome_token_expires_at);
          if (expires < new Date()) {
            return { expired: true };
          }
        }

        // Already completed?
        if (household.welcome_form_completed) {
          return { already_completed: true };
        }

        // Get all members in this household ordered by sibling_order
        const membersRes = await sbFetch(
          `/members?household_id=eq.${household.id}&order=sibling_order.asc&limit=10`
        );
        const members: any[] = await membersRes.json();

        return {
          household_id: household.id,
          children: members.map(m => ({
            member_id: m.id,
            is_primary: m.is_primary,
            sibling_order: m.sibling_order,
            books_per_box: m.books_per_box,
            tier: m.tier,
            // Pre-fill if already partially filled
            child_name: m.child_name ?? "",
            age_group: m.age_group ?? "",
            interests: m.interests ?? [],
            topics_to_avoid: m.topics_to_avoid ?? [],
            birthday: m.birthday ?? "",
            notes: m.notes ?? "",
            welcome_form_completed: m.welcome_form_completed,
          })),
          // Parent info from primary member
          parent_name: members.find(m => m.is_primary)?.name ?? "",
          parent_email: members.find(m => m.is_primary)?.email ?? "",
        };
      }),

    // Submit all child profiles at once
    submit: publicProcedure
      .input(
        z.object({
          token: z.string(),
          parent_name: z.string(),
          parent_email: z.string().email(),
          children: z.array(
            z.object({
              member_id: z.string(),
              child_name: z.string(),
              birthday: z.string().nullish(),
              age_group: z.string(),
              favorite_themes: z.array(z.string()).default([]),
              interests: z.array(z.string()),
              topics_to_avoid: z.array(z.string()),
              notes: z.string().nullish(),
            })
          ),
        })
      )
      .mutation(async ({ input }) => {
        // Verify token still valid
        const householdRes = await sbFetch(
          `/households?welcome_token=eq.${input.token}&limit=1`
        );
        const households: any[] = await householdRes.json();
        if (!households[0]) throw new Error("Invalid or expired token");
        const household = households[0];

        if (household.welcome_form_completed) {
          throw new Error("Welcome form already completed");
        }

        const now = new Date().toISOString();

        // Update each child member row and sync the queue-facing interest table.
        await Promise.all(
          input.children.map(async child => {
            const res = await sbFetch(`/members?id=eq.${child.member_id}`, {
              method: "PATCH",
              body: JSON.stringify({
                child_name: child.child_name,
                age_group: getAgeGroupLabel(child.age_group) || child.age_group,
                favorite_themes: child.favorite_themes,
                interests: child.interests,
                topics_to_avoid: child.topics_to_avoid,
                birthday: child.birthday ?? null,
                notes: child.notes ?? null,
                welcome_form_completed: true,
                updated_at: now,
              }),
              headers: { Prefer: "return=minimal" },
            });
            if (!res.ok) {
              throw new Error(`Failed to update child profile: ${await res.text()}`);
            }

            await syncMemberInterests(child.member_id, [
              ...child.favorite_themes,
              ...child.interests,
            ]);
          })
        );

        // Update primary member name + email
        await sbFetch(
          `/members?household_id=eq.${household.id}&is_primary=eq.true`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: input.parent_name,
              email: input.parent_email,
              updated_at: now,
            }),
            headers: { Prefer: "return=minimal" },
          }
        );

        // Mark household complete
        const householdUpdateRes = await sbFetch(`/households?id=eq.${household.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            welcome_form_completed: true,
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });
        if (!householdUpdateRes.ok) {
          throw new Error(
            `Failed to mark welcome form complete: ${await householdUpdateRes.text()}`
          );
        }

        const firstShipments = await Promise.all(
          input.children.map(async child => {
            try {
              const shipment = await createPickingOrderForMember({
                member_id: child.member_id,
                source: "manual",
              });
              return { member_id: child.member_id, shipment, error: null };
            } catch (error) {
              return {
                member_id: child.member_id,
                shipment: null,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not create first order.",
              };
            }
          })
        );

        return { success: true, first_shipments: firstShipments };
      }),
  }),

  // ─── Returns ────────────────────────────────────────────────────────────────
  returns: router({
    bundles: operatorProcedure
      .input(z.object({ search: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const inTransitCopies = await sbJson<{ id: string }[]>(
          "/book_copies?status=eq.in_transit&select=id&limit=1000"
        );
        if (!inTransitCopies.length) return [];

        const inTransitCopyIds = inTransitCopies.map(copy => copy.id).join(",");
        const activeShipmentBooks = await sbJson<
          {
            id: string;
            shipment_id: string;
            book_copy_id: string | null;
            created_at: string | null;
          }[]
        >(
          `/shipment_books?book_copy_id=in.(${inTransitCopyIds})&select=id,shipment_id,book_copy_id,created_at&order=created_at.desc&limit=1000`
        );

        const copyToShipmentBook: Record<
          string,
          { id: string; shipment_id: string }
        > = {};
        for (const row of activeShipmentBooks) {
          if (row.book_copy_id && !copyToShipmentBook[row.book_copy_id]) {
            copyToShipmentBook[row.book_copy_id] = {
              id: row.id,
              shipment_id: row.shipment_id,
            };
          }
        }

        const shipmentIds = Array.from(
          new Set(Object.values(copyToShipmentBook).map(row => row.shipment_id))
        );
        if (!shipmentIds.length) return [];

        const [shipments, shipmentBooks] = await Promise.all([
          sbJson<
            {
              id: string;
              member_id: string;
              order_number: string | null;
              shipment_number: string | null;
              status: string;
              scheduled_ship_date: string | null;
              actual_ship_date: string | null;
              tracking_number: string | null;
              carrier: string | null;
            }[]
          >(
            `/shipments?id=in.(${shipmentIds.join(",")})&shipment_type=eq.outbound&select=id,member_id,order_number,shipment_number,status,scheduled_ship_date,actual_ship_date,tracking_number,carrier&limit=500`
          ),
          sbJson<
            {
              id: string;
              shipment_id: string;
              book_copy_id: string | null;
              book_copies: {
                id: string;
                sku: string | null;
                bin_id: string | null;
                section: string | null;
                status: string | null;
                book_titles: {
                  title: string | null;
                  author: string | null;
                } | null;
              } | null;
            }[]
          >(
            `/shipment_books?shipment_id=in.(${shipmentIds.join(",")})&book_copy_id=not.is.null&select=id,shipment_id,book_copy_id,book_copies(id,sku,bin_id,section,status,book_titles(title,author))&limit=1000`
          ),
        ]);

        const memberIds = Array.from(new Set(shipments.map(s => s.member_id)));
        const members = memberIds.length
          ? await sbJson<{ id: string; name: string | null; email: string | null }[]>(
              `/members?id=in.(${memberIds.join(",")})&select=id,name,email&limit=500`
            )
          : [];
        const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

        const returns = await sbJson<
          {
            id: string;
            original_shipment_id: string | null;
            return_number: string | null;
            status: string;
          }[]
        >(
          `/returns?original_shipment_id=in.(${shipmentIds.join(",")})&select=id,original_shipment_id,return_number,status&limit=500`
        );
        const latestReturnByShipment: Record<string, any> = {};
        for (const returnRecord of returns) {
          if (
            returnRecord.original_shipment_id &&
            !latestReturnByShipment[returnRecord.original_shipment_id]
          ) {
            latestReturnByShipment[returnRecord.original_shipment_id] =
              returnRecord;
          }
        }

        const returnIds = returns.map(returnRecord => returnRecord.id);
        const returnBooks = returnIds.length
          ? await sbJson<
              {
                return_id: string;
                book_copy_id: string | null;
                received: boolean | null;
                condition_notes: string | null;
                processed_at: string | null;
              }[]
            >(
              `/return_books?return_id=in.(${returnIds.join(",")})&select=return_id,book_copy_id,received,condition_notes,processed_at&limit=1000`
            )
          : [];
        const returnBookByReturnAndCopy: Record<string, any> = {};
        for (const book of returnBooks) {
          if (book.book_copy_id) {
            returnBookByReturnAndCopy[`${book.return_id}:${book.book_copy_id}`] =
              book;
          }
        }

        const booksByShipment: Record<string, any[]> = {};
        for (const book of shipmentBooks) {
          if (!booksByShipment[book.shipment_id]) {
            booksByShipment[book.shipment_id] = [];
          }
          const returnRecord = latestReturnByShipment[book.shipment_id];
          const returnBook =
            returnRecord && book.book_copy_id
              ? returnBookByReturnAndCopy[
                  `${returnRecord.id}:${book.book_copy_id}`
                ]
              : null;
          const notes = returnBook?.condition_notes ?? "";
          const normalizedNotes = notes.toLowerCase();
          booksByShipment[book.shipment_id].push({
            shipment_book_id: book.id,
            copy_id: book.book_copy_id,
            sku: book.book_copies?.sku ?? null,
            title: book.book_copies?.book_titles?.title ?? "Unknown title",
            author: book.book_copies?.book_titles?.author ?? null,
            bin_id: book.book_copies?.bin_id ?? null,
            section: book.book_copies?.section ?? null,
            location: formatInventoryLocation(
              book.book_copies?.bin_id,
              book.book_copies?.section
            ),
            copy_status: book.book_copies?.status ?? null,
            return_state: returnBook
              ? returnBook.received
                ? normalizedNotes.includes("issue")
                  ? "issue"
                  : "received"
                : normalizedNotes.includes("kept/paid")
                  ? "kept"
                  : "missing"
              : book.book_copies?.status === "in_house"
                ? "received"
                : "out",
            return_notes: returnBook?.condition_notes ?? null,
            processed_at: returnBook?.processed_at ?? null,
          });
        }

        const search = input?.search?.trim().toLowerCase() ?? "";
        return shipments
          .map(shipment => {
            const member = memberMap[shipment.member_id];
            const books = booksByShipment[shipment.id] ?? [];
            const receivedCount = books.filter(
              book => book.return_state === "received" || book.return_state === "issue"
            ).length;
            const missingCount = books.filter(
              book => book.return_state === "missing"
            ).length;
            const keptCount = books.filter(
              book => book.return_state === "kept"
            ).length;
            const issueCount = books.filter(
              book => book.return_state === "issue"
            ).length;
            const outCount = books.filter(book => book.return_state === "out")
              .length;

            return {
              id: shipment.id,
              shipment_number: shipment.shipment_number,
              order_number: shipment.order_number,
              status: shipment.status,
              member_id: shipment.member_id,
              member_name: member?.name ?? member?.email ?? "Unknown member",
              actual_ship_date: shipment.actual_ship_date,
              scheduled_ship_date: shipment.scheduled_ship_date,
              tracking_number: shipment.tracking_number,
              carrier: shipment.carrier,
              return_id: latestReturnByShipment[shipment.id]?.id ?? null,
              return_number:
                latestReturnByShipment[shipment.id]?.return_number ?? null,
              return_status:
                latestReturnByShipment[shipment.id]?.status ?? "not_started",
              total_count: books.length,
              received_count: receivedCount,
              missing_count: missingCount,
              kept_count: keptCount,
              issue_count: issueCount,
              out_count: outCount,
              books,
            };
          })
          .filter(bundle => {
            if (!search) return true;
            const haystack = [
              bundle.id,
              bundle.shipment_number,
              bundle.order_number,
              bundle.member_name,
              bundle.tracking_number,
              ...bundle.books.map(book => book.sku),
              ...bundle.books.map(book => book.title),
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            return haystack.includes(search);
          })
          .sort((a, b) => a.member_name.localeCompare(b.member_name));
      }),

    openRequests: operatorProcedure.query(async () => returnsService.openRequests()),
    lookupBySku: operatorProcedure
      .input(z.object({ sku: z.string() }))
      .query(async ({ input }) => returnsService.lookupBySku(input)),
    processReturn: operatorProcedure
      .input(z.object({ copy_id: z.string(), notes: z.string().optional(), last_shipment_id: z.string().nullable().optional(), last_shipment_book_id: z.string().nullable().optional(), sku: z.string().optional(), title: z.string().optional() }))
      .mutation(async ({ input }) => returnsService.processReturn(input)),
    processBundleBook: operatorProcedure
      .input(z.object({ shipment_id: z.string(), shipment_book_id: z.string(), copy_id: z.string(), outcome: z.enum(["received", "missing", "issue"]), notes: z.string().optional() }))
      .mutation(async ({ input }) => returnsService.processBundleBook(input)),
    processBundle: operatorProcedure
      .input(z.object({ shipment_id: z.string(), notes: z.string().optional() }))
      .mutation(async ({ input }) => returnsService.processBundle(input)),
    history: operatorProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => returnsService.history(input)),
  }),
  signups: router({
    list: operatorProcedure.query(async () => {
      const res = await sbFetch(
        "/event_signups?order=created_at.desc&limit=200",
        {
          headers: { Prefer: "count=exact" },
        }
      );
      if (!res.ok) return { data: [], total: 0 };
      const total = parseInt(
        res.headers.get("content-range")?.split("/")[1] ?? "0",
        10
      );
      const data = await res.json();
      return { data, total };
    }),

    add: publicProcedure
      .input(
        z.object({
          parent_name: z.string(),
          parent_email: z.string(),
          street: z.string(),
          street2: z.string().optional(),
          city: z.string(),
          state: z.string(),
          zip: z.string(),
          child_name: z.string(),
          child_birthday: z.string().optional(),
          reading_level: z.string(),
          interests: z.array(z.string()),
          favorite_themes: z.array(z.string()).default([]),
          topics_to_avoid: z.array(z.string()),
          subscription_tier: z.string(),
          how_heard: z.string().optional(),
          is_gift: z.boolean().optional(),
          gift_note: z.string().optional(),
          additional_notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch("/event_signups", {
          method: "POST",
          body: JSON.stringify({
            ...input,
            reading_level:
              normalizeAgeGroup(input.reading_level) ?? input.reading_level,
            created_at: new Date().toISOString(),
          }),
        });
        if (!res.ok)
          throw new Error(`Failed to save sign-up: ${await res.text()}`);
        const data = await res.json();
        return { success: true, id: data[0]?.id };
      }),

    convertToMember: operatorProcedure
      .input(z.object({ signup_id: z.string() }))
      .mutation(async ({ input }) => {
        const signupRes = await sbFetch(
          `/event_signups?id=eq.${input.signup_id}&limit=1`
        );
        if (!signupRes.ok) throw new Error("Signup not found");
        const signups: any[] = await signupRes.json();
        const s = signups[0];
        if (!s) throw new Error("Signup not found");

        const memberRes = await sbFetch("/members", {
          method: "POST",
          body: JSON.stringify({
            name: s.parent_name,
            email: s.parent_email,
            child_name: s.child_name,
            child_birthday: s.child_birthday ?? null,
            age_group: s.reading_level
              ? getAgeGroupLabel(s.reading_level)
              : null,
            tier: s.subscription_tier ?? null,
            subscription_status: "active",
            interests: s.interests ?? [],
            topics_to_avoid: s.topics_to_avoid ?? [],
            additional_notes: s.additional_notes ?? null,
            created_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=representation" },
        });
        if (!memberRes.ok)
          throw new Error(`Failed to create member: ${await memberRes.text()}`);
        const members: any[] = await memberRes.json();
        const member = members[0];

        if (s.street && s.city && s.state && s.zip) {
          await sbFetch("/member_addresses", {
            method: "POST",
            body: JSON.stringify({
              member_id: member.id,
              street: s.street,
              street2: s.street2 ?? null,
              city: s.city,
              state: s.state,
              zip: s.zip,
              is_primary: true,
              created_at: new Date().toISOString(),
            }),
            headers: { Prefer: "return=minimal" },
          });
        }

        await sbFetch(`/event_signups?id=eq.${input.signup_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            converted_to_member: true,
            member_id: member.id,
          }),
          headers: { Prefer: "return=minimal" },
        });

        return { success: true, member_id: member.id };
      }),
  }),
  // ─── Support ──────────────────────────────────────────────────────────────
  support: router({
    list: operatorProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const status = input?.status ?? "pending";
        const res = await sbFetch(
          `/damaged_book_reports?status=eq.${status}&order=created_at.desc&limit=100&select=id,created_at,member_id,book_copy_id,torn_pages,cover,writing_marks,water,missing_pages,other,photo1,photo2,photo3,notes,status,resolution_note,resolved_at`
        );
        if (!res.ok) return [];
        const reports: any[] = await res.json();
        if (!reports.length) return [];

        // Enrich with member names
        const memberIds = Array.from(
          new Set(reports.map(r => r.member_id).filter(Boolean))
        );
        let memberMap: Record<string, string> = {};
        if (memberIds.length > 0) {
          const mRes = await sbFetch(
            `/members?id=in.(${memberIds.join(",")})&select=id,name,email&limit=200`
          );
          const members: any[] = mRes.ok ? await mRes.json() : [];
          memberMap = Object.fromEntries(
            members.map(m => [m.id, m.name ?? m.email ?? "Unknown"])
          );
        }

        // Enrich with book titles
        const copyIds = Array.from(
          new Set(reports.map(r => r.book_copy_id).filter(Boolean))
        );
        let bookMap: Record<string, string> = {};
        if (copyIds.length > 0) {
          const cRes = await sbFetch(
            `/book_copies?id=in.(${copyIds.join(",")})&select=id,book_title_id,book_titles(title)&limit=200`
          );
          const copies: any[] = cRes.ok ? await cRes.json() : [];
          bookMap = Object.fromEntries(
            copies.map(c => [c.id, c.book_titles?.title ?? "Unknown Book"])
          );
        }

        return reports.map(r => ({
          ...r,
          member_name: memberMap[r.member_id] ?? "Unknown",
          book_title: bookMap[r.book_copy_id] ?? "Unknown Book",
        }));
      }),

    resolve: operatorProcedure
      .input(
        z.object({
          id: z.string(),
          resolution_note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch(`/damaged_book_reports?id=eq.${input.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "resolved",
            resolution_note: input.resolution_note ?? null,
            resolved_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
        if (!res.ok) throw new Error("Failed to resolve report");
        return { success: true };
      }),

    dismiss: operatorProcedure
      .input(
        z.object({
          id: z.string(),
          resolution_note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch(`/damaged_book_reports?id=eq.${input.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "dismissed",
            resolution_note: input.resolution_note ?? null,
            resolved_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
        if (!res.ok) throw new Error("Failed to dismiss report");
        return { success: true };
      }),
    listMissing: operatorProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const status = input?.status ?? "pending";
        const res = await sbFetch(
          `/missing_bundle_reports?status=eq.${status}&order=created_at.desc&limit=100&select=id,created_at,member_id,shipment_id,problem,notes,status,resolution_note,resolved_at`
        );
        if (!res.ok) return [];
        const reports: any[] = await res.json();
        if (!reports.length) return [];

        // Enrich with member names
        const memberIds = Array.from(
          new Set(reports.map(r => r.member_id).filter(Boolean))
        );
        let memberMap: Record<string, string> = {};
        if (memberIds.length > 0) {
          const mRes = await sbFetch(
            `/members?id=in.(${memberIds.join(",")})&select=id,name,email&limit=200`
          );
          const members: any[] = mRes.ok ? await mRes.json() : [];
          memberMap = Object.fromEntries(
            members.map(m => [m.id, m.name ?? m.email ?? "Unknown"])
          );
        }

        // Enrich with tracking numbers
        const shipmentIds = Array.from(
          new Set(reports.map(r => r.shipment_id).filter(Boolean))
        );
        let shipmentMap: Record<
          string,
          { tracking_number: string | null; carrier: string | null }
        > = {};
        if (shipmentIds.length > 0) {
          const sRes = await sbFetch(
            `/shipments?id=in.(${shipmentIds.join(",")})&select=id,tracking_number,carrier&limit=200`
          );
          const shipments: any[] = sRes.ok ? await sRes.json() : [];
          shipmentMap = Object.fromEntries(
            shipments.map(s => [
              s.id,
              { tracking_number: s.tracking_number, carrier: s.carrier },
            ])
          );
        }

        return reports.map(r => ({
          ...r,
          member_name: memberMap[r.member_id] ?? "Unknown",
          tracking_number: shipmentMap[r.shipment_id]?.tracking_number ?? null,
          carrier: shipmentMap[r.shipment_id]?.carrier ?? null,
        }));
      }),

    resolveMissing: operatorProcedure
      .input(
        z.object({
          id: z.string(),
          resolution_note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch(`/missing_bundle_reports?id=eq.${input.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "resolved",
            resolution_note: input.resolution_note ?? null,
            resolved_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
        if (!res.ok) throw new Error("Failed to resolve report");
        return { success: true };
      }),

    dismissMissing: operatorProcedure
      .input(
        z.object({
          id: z.string(),
          resolution_note: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch(`/missing_bundle_reports?id=eq.${input.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "dismissed",
            resolution_note: input.resolution_note ?? null,
            resolved_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
        if (!res.ok) throw new Error("Failed to dismiss report");
        return { success: true };
      }),
  }),
});


