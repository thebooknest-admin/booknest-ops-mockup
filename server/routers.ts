import { COOKIE_NAME } from "@shared/const";
import {
  BOOK_TAG_TO_THEME,
  BOOK_COPY_STATUSES,
  LABEL_STATUSES,
  TERMINAL_BOOK_COPY_STATUSES,
  getAgeGroupLabel,
  getBinCodeForAgeGroupAndTheme,
  getThemeFromBookSignals,
  getSkuPrefixForAgeGroup,
  normalizeAgeGroup,
  sanitizeBookTags,
} from "@shared/booknest";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { pickingRouter } from "./routers/picking";
import { shippingRouter } from "./routers/shipping";
import { packingRouter } from "./routers/packing";
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
} from "./supabase";
import { isbnRouter } from "./routers/isbn";

type ReturnBookOutcome = "received" | "missing" | "issue";

async function processReturnedBook(input: {
  copy_id: string;
  shipment_id?: string | null;
  shipment_book_id?: string | null;
  notes?: string | null;
  outcome?: ReturnBookOutcome;
}) {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const outcome = input.outcome ?? "received";
  const [copy] = await sbJson<
    {
      id: string;
      book_title_id: string;
      status: string;
    }[]
  >(
    `/book_copies?id=eq.${input.copy_id}&select=id,book_title_id,status&limit=1`
  );

  if (!copy) {
    throw new Error("Book copy not found");
  }

  let shipmentBookId = input.shipment_book_id ?? null;
  let shipmentId = input.shipment_id ?? null;
  let memberId: string | null = null;

  if (shipmentBookId || shipmentId) {
    const shipmentBookFilters = shipmentBookId
      ? `id=eq.${shipmentBookId}`
      : `shipment_id=eq.${shipmentId}&book_copy_id=eq.${input.copy_id}`;
    const shipmentBooks = await sbJson<
      {
        id: string;
        shipment_id: string;
        shipments: { member_id: string | null } | null;
      }[]
    >(
      `/shipment_books?${shipmentBookFilters}&order=created_at.desc&limit=1&select=id,shipment_id,shipments(member_id)`
    );
    const shipmentBook = shipmentBooks[0];
    shipmentBookId = shipmentBook?.id ?? shipmentBookId;
    shipmentId = shipmentBook?.shipment_id ?? shipmentId;
    memberId = shipmentBook?.shipments?.member_id ?? null;
  }

  if (!shipmentId || !shipmentBookId || !memberId) {
    const shipmentBooks = await sbJson<
      {
        id: string;
        shipment_id: string;
        shipments: { member_id: string | null } | null;
      }[]
    >(
      `/shipment_books?book_copy_id=eq.${input.copy_id}&order=created_at.desc&limit=1&select=id,shipment_id,shipments(member_id)`
    );
    const shipmentBook = shipmentBooks[0];
    shipmentBookId = shipmentBook?.id ?? shipmentBookId;
    shipmentId = shipmentBook?.shipment_id ?? shipmentId;
    memberId = shipmentBook?.shipments?.member_id ?? memberId;
  }

  const keptHistory =
    outcome === "missing" && memberId && shipmentId && copy.book_title_id
      ? await sbJson<{ id: string }[]>(
          `/member_book_history?member_id=eq.${memberId}&shipment_id=eq.${shipmentId}&book_title_id=eq.${copy.book_title_id}&kept=eq.true&select=id&limit=1`
        )
      : [];
  const missingWasKept = outcome === "missing" && keptHistory.length > 0;

  await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: missingWasKept
        ? "withdrawn"
        : outcome === "missing"
          ? "lost"
          : "in_house",
      updated_at: now,
    }),
    headers: { Prefer: "return=minimal" },
  });

  const datePart = now.slice(0, 10).replace(/-/g, "");
  const randPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  const returnNumber = `RET-${datePart}-${randPart}`;

  let returnRows: any[] = [];
  if (shipmentId) {
    returnRows = await sbJson<any[]>(
      `/returns?original_shipment_id=eq.${shipmentId}&status=in.(requested,in_transit,receiving)&order=created_at.desc&limit=1`
    );
  }
  if (!returnRows[0] && memberId) {
    returnRows = await sbJson<any[]>(
      `/returns?member_id=eq.${memberId}&status=in.(requested,in_transit,receiving)&order=created_at.desc&limit=1`
    );
  }

  let returnRecord = returnRows[0] ?? null;
  if (!returnRecord) {
    const created = await sbJson<any[]>("/returns", {
      method: "POST",
      body: JSON.stringify({
        member_id: memberId,
        return_number: returnNumber,
        original_shipment_id: shipmentId,
        status: shipmentId ? "receiving" : "received",
        return_type: "swap",
        actual_return_date: today,
        processed_at: now,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      }),
    });
    returnRecord = created[0] ?? null;
  }

  if (!returnRecord?.id) {
    throw new Error("Failed to create or locate return record");
  }

  const returnId = returnRecord.id as string;
  const notePrefix =
    outcome === "missing"
      ? missingWasKept
        ? "Kept/paid before return"
        : "Missing on return"
      : outcome === "issue"
        ? "Issue on return"
        : null;
  const conditionNotes = [notePrefix, input.notes].filter(Boolean).join(": ");
  const existingReturnBooks = await sbJson<{ id: string }[]>(
    `/return_books?return_id=eq.${returnId}&book_copy_id=eq.${input.copy_id}&select=id&limit=1`
  );

  const returnBookBody = {
    shipment_book_id: shipmentBookId,
    received: outcome !== "missing",
    condition_on_return: "good",
    condition_notes: conditionNotes || null,
    action: "restock",
    processed_at: now,
  };

  if (existingReturnBooks[0]) {
    await sbVoid(`/return_books?id=eq.${existingReturnBooks[0].id}`, {
      method: "PATCH",
      body: JSON.stringify(returnBookBody),
      headers: { Prefer: "return=minimal" },
    });
  } else {
    await sbVoid("/return_books", {
      method: "POST",
      body: JSON.stringify({
        return_id: returnId,
        book_copy_id: input.copy_id,
        ...returnBookBody,
        created_at: now,
      }),
      headers: { Prefer: "return=minimal" },
    });
  }

  if (memberId && shipmentId && copy.book_title_id && outcome !== "missing") {
    await sbVoid(
      `/member_book_history?member_id=eq.${memberId}&shipment_id=eq.${shipmentId}&book_title_id=eq.${copy.book_title_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          returned_date: today,
          kept: false,
          notes: input.notes ?? null,
        }),
        headers: { Prefer: "return=minimal" },
      }
    );
  }

  let nextReturnStatus = "received";
  if (shipmentId) {
    const [shipmentBooks, handledBooks] = await Promise.all([
      sbJson<{ id: string }[]>(
        `/shipment_books?shipment_id=eq.${shipmentId}&book_copy_id=not.is.null&select=id&limit=200`
      ),
      sbJson<{ id: string }[]>(
        `/return_books?return_id=eq.${returnId}&processed_at=not.is.null&select=id&limit=200`
      ),
    ]);
    nextReturnStatus =
      handledBooks.length >= shipmentBooks.length ? "received" : "receiving";
  }

  await sbVoid(`/returns?id=eq.${returnId}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: nextReturnStatus,
      actual_return_date: today,
      processed_at: now,
      notes: input.notes ?? returnRecord.notes ?? null,
      updated_at: now,
    }),
    headers: { Prefer: "return=minimal" },
  });

  return {
    success: true,
    return_number: returnRecord.return_number ?? returnNumber,
    return_id: returnId,
    status: nextReturnStatus,
  };
}

export const appRouter = router({
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
    stats: publicProcedure.query(async () => {
      return getDashboardStats();
    }),
  }),

  // ─── Members ────────────────────────────────────────────────────────────────
  members: router({
    list: publicProcedure.query(async () => {
      return getMembers();
    }),

    byId: publicProcedure
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
    create: publicProcedure
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
    summary: publicProcedure.query(async () => {
      return getInventorySummary();
    }),

    bookTitles: publicProcedure
      .input(
        z
          .object({
            limit: z.number().optional(),
            offset: z.number().optional(),
            search: z.string().optional(),
            age_group: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return getBookTitlesWithCopies(input ?? {});
      }),

    bookCopies: publicProcedure
      .input(
        z
          .object({
            status: z.string().optional(),
            bin_id: z.string().optional(),
            age_group: z.string().optional(),
            limit: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return getBookCopies(input ?? {});
      }),

    bins: publicProcedure.query(async () => {
      return getBinConfigs();
    }),

    getBookDetail: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const titleRes = await sbFetch(
          `/book_titles?id=eq.${input.id}&limit=1&select=id,title,author,isbn,age_group,suggested_age_tier,bin_theme,tag_ids,cover_url,publisher,published_date,page_count,description,subjects,metadata_source,classification_version,created_at,updated_at`
        );
        if (!titleRes.ok) {
          throw new Error(
            "Failed to fetch book title: " + (await titleRes.text())
          );
        }
        const titles: any[] = await titleRes.json();
        if (!titles[0]) return null;
        const title = titles[0];

        const copiesRes = await sbFetch(
          `/book_copies?book_title_id=eq.${input.id}&order=sku.asc&limit=200&select=id,sku,isbn,age_group,bin_id,status,condition,label_status,received_at,created_at,updated_at`
        );
        const copies: any[] = copiesRes.ok ? await copiesRes.json() : [];

        let tags: any[] = [];

        if (Array.isArray(title.tag_ids) && title.tag_ids.length > 0) {
          const tagRes = await sbFetch(
            `/book_sorting_tags?id=in.(${title.tag_ids.join(",")})&select=id,bin_theme,tag`
          );

          tags = tagRes.ok ? await tagRes.json() : [];
        }

        return { ...title, tags, copies };
      }),

    updateCopy: publicProcedure
      .input(
        z.object({
          id: z.string(),
          sku: z.string().optional(),
          bin_id: z.string().optional(),
          status: z.string().optional(),
          condition: z.string().optional(),
          notes: z.string().optional(),
          age_group: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...fields } = input;
        const patch: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (fields.sku !== undefined) patch.sku = fields.sku;
        if (fields.bin_id !== undefined) patch.bin_id = fields.bin_id;
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
        if (!res.ok)
          throw new Error(`Failed to update copy: ${await res.text()}`);
        return { success: true };
      }),

    updateBookTitle: publicProcedure
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
          `/book_titles?id=eq.${id}&limit=1&select=id,age_group`
        );

        if (!existingTitleRes.ok) {
          throw new Error(
            `Failed to load existing book title: ${await existingTitleRes.text()}`
          );
        }

        const existingTitles: { id: string; age_group: string | null }[] =
          await existingTitleRes.json();

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
        }

        return {
          success: true,
          book: updatedTitle,
          skuRegenerated: ageChanged,
        };
      }),

    // ── In Flight — books currently with members, grouped by member ─────────────
    inTransit: publicProcedure.query(async () => {
      // 1. Get all in_transit copies with book title
      const res = await sbFetch(
        `/book_copies?status=eq.in_transit&select=id,sku,bin_id,book_title_id,book_titles(id,title,author)&limit=500&order=sku.asc`
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
    list: publicProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const { data, total } = await getShipments({
          status: input?.status,
          limit: 100,
        });
        const memberIds = Array.from(new Set(data.map(s => s.member_id)));
        let memberMap: Record<string, string> = {};
        let memberTierMap: Record<string, string> = {};
        if (memberIds.length > 0) {
          const res = await sbFetch(
            `/members?id=in.(${memberIds.join(",")})&select=id,name,tier,age_group&limit=200`
          );
          const members: {
            id: string;
            name: string;
            tier: string;
            age_group: string;
          }[] = await res.json();
          memberMap = Object.fromEntries(members.map(m => [m.id, m.name]));
          memberTierMap = Object.fromEntries(members.map(m => [m.id, m.tier]));
        }
        return {
          data: data.map(s => ({
            ...s,
            member_name: memberMap[s.member_id] ?? "Unknown",
            member_tier: memberTierMap[s.member_id] ?? null,
          })),
          total,
        };
      }),

    byId: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const shipment = await getShipmentById(input.id);
        if (!shipment) return null;
        const [books, member, address] = await Promise.all([
          getShipmentBooks(input.id),
          getMemberById(shipment.member_id),
          shipment.address_id
            ? sbFetch(`/member_addresses?id=eq.${shipment.address_id}&limit=1`)
                .then(r => r.json())
                .then((d: any[]) => d[0] ?? null)
            : getMemberAddress(shipment.member_id),
        ]);
        const titleIds = Array.from(new Set(books.map(b => b.book_title_id)));
        let titleMap: Record<
          string,
          { title: string; author: string; cover_url: string | null }
        > = {};
        if (titleIds.length > 0) {
          const res = await sbFetch(
            `/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author,cover_url&limit=50`
          );
          const titles: {
            id: string;
            title: string;
            author: string;
            cover_url: string | null;
          }[] = await res.json();
          titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
        }
        return {
          ...shipment,
          member,
          address,
          books: books.map(b => ({
            ...b,
            book_title: titleMap[b.book_title_id] ?? null,
          })),
        };
      }),

    updateTracking: publicProcedure
      .input(
        z.object({
          id: z.string(),
          tracking_number: z.string(),
          carrier: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const res = await sbFetch(`/shipments?id=eq.${input.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            tracking_number: input.tracking_number,
            carrier: input.carrier ?? "USPS",
            updated_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
        if (!res.ok)
          throw new Error(`Failed to update tracking: ${await res.text()}`);
        return { success: true };
      }),

    updateStatus: publicProcedure
      .input(
        z.object({
          id: z.string(),
          status: z.string(),
          tracking_number: z.string().optional(),
          carrier: z.string().optional(),
          actual_ship_date: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, status, ...extra } = input;
        if (status === "shipped") {
          throw new Error(
            "Use shipping.markShipped so copies, shipment books, and member history stay in sync."
          );
        }
        await updateShipmentStatus(id, status, extra as any);
        return { success: true };
      }),
    listAll: publicProcedure.query(async () => {
      const { data } = await getShipments({ limit: 500 });
      const memberIds = Array.from(new Set(data.map(s => s.member_id)));
      let memberMap: Record<string, string> = {};
      let memberTierMap: Record<string, string> = {};
      if (memberIds.length > 0) {
        const res = await sbFetch(
          `/members?id=in.(${memberIds.join(",")})&select=id,name,tier&limit=500`
        );
        const members: { id: string; name: string; tier: string }[] =
          await res.json();
        memberMap = Object.fromEntries(members.map(m => [m.id, m.name]));
        memberTierMap = Object.fromEntries(members.map(m => [m.id, m.tier]));
      }
      return {
        data: data.map(s => ({
          ...s,
          member_name: memberMap[s.member_id] ?? "Unknown",
          member_tier: memberTierMap[s.member_id] ?? null,
        })),
      };
    }),
  }),

  // ─── Labels ─────────────────────────────────────────────────────────────────
  labels: router({
    pending: publicProcedure.query(async () => {
      const copies = await sbJson<any[]>(
        "/book_copies?label_status=eq.pending&status=in.(in_house,pending_label)&select=id,sku,isbn,book_title_id,age_group,bin_id,label_status,received_at&limit=1000&order=received_at.asc"
      );
      const titleIds = Array.from(
        new Set(copies.map(c => c.book_title_id).filter(Boolean))
      );
      let titleMap: Record<
        string,
        {
          title: string;
          author: string;
          isbn: string | null;
          bin_theme: string | null;
        }
      > = {};
      if (titleIds.length > 0) {
        const titles = await sbJson<
          {
            id: string;
            title: string;
            author: string;
            isbn: string | null;
            bin_theme: string | null;
          }[]
        >(
          `/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author,isbn,bin_theme&limit=1000`
        );
        titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
      }
      return copies.map(c => ({
        ...c,
        isbn: (c.isbn ?? titleMap[c.book_title_id]?.isbn ?? null) as
          | string
          | null,
        book_title: titleMap[c.book_title_id] ?? null,
      }));
    }),

    markPrinted: publicProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        const now = new Date().toISOString();
        await sbVoid(`/book_copies?id=in.(${input.ids.join(",")})`, {
          method: "PATCH",
          body: JSON.stringify({
            label_status: LABEL_STATUSES.printed,
            label_printed_at: now,
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });
        await sbVoid(
          `/book_copies?id=in.(${input.ids.join(",")})&status=eq.pending_label`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: "pending_stock",
              updated_at: now,
            }),
            headers: { Prefer: "return=minimal" },
          }
        );
        return { success: true };
      }),
  }),

  // ─── Receive Books ──────────────────────────────────────────────────────────
  receive: router({
    addBook: publicProcedure
      .input(
        z.object({
          isbn: z.string(),
          title: z.string(),
          author: z.string(),
          cover_url: z.string().nullable().optional(),
          publisher: z.string().nullable().optional(),
          published_date: z.string().nullable().optional(),
          page_count: z.number().nullable().optional(),
          description: z.string().nullable().optional(),
          subjects: z.array(z.string()).optional(),
          age_group: z.string(),
          bin_id: z.string(),
          bin_theme: z.string().optional(),
          condition: z.string().default("good"),
          tags: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const getThemeFromBinId = (binId: string | null | undefined) => {
          const value = (binId ?? "").toUpperCase();

          if (value.includes("-ADV-")) return "Adventure";
          if (value.includes("-HUM-") || value.includes("-LCH-"))
            return "Laughs & Chaos";
          if (value.includes("-HRT-") || value.includes("HEARTHOME"))
            return "Heart & Home";
          if (value.includes("-WON-") || value.includes("-WND-"))
            return "Wonder & Imagination";
          if (value.includes("-WLD-")) return "Wild & Wonderful";
          if (value.includes("-DSC-")) return "Discovery Den";
          if (value.includes("-LEG-")) return "Legends & Long Ago";
          if (value.includes("-SEA-")) return "Seasons & Celebrations";

          return null;
        };

        const derivedBinTheme = getThemeFromBinId(input.bin_id);
        const ageGroupKey = normalizeAgeGroup(input.age_group);

        if (!ageGroupKey) {
          throw new Error(`Unsupported age group: ${input.age_group}`);
        }

        const sanitizedTags = sanitizeBookTags(input.tags);
        const requestedBinTheme = input.bin_theme ?? derivedBinTheme;
        const classificationText = [
          input.title,
          input.author,
          input.description ?? "",
          ...(input.subjects ?? []),
        ].join(" ");
        const binTheme =
          getThemeFromBookSignals(
            sanitizedTags,
            classificationText,
            requestedBinTheme
          ) ?? requestedBinTheme;
        const canonicalBinId =
          getBinCodeForAgeGroupAndTheme(ageGroupKey, binTheme) ?? input.bin_id;
        let tagRows =
          sanitizedTags.length > 0
            ? await sbJson<{ id: string; tag: string; bin_theme: string }[]>(
                "/book_sorting_tags?select=id,tag,bin_theme&limit=1000"
              )
            : [];
        const selectedTagSet = new Set(sanitizedTags);
        const existingTagSet = new Set(tagRows.map(row => row.tag));
        const missingTags = sanitizedTags.filter(
          tag => !existingTagSet.has(tag)
        );

        if (missingTags.length > 0) {
          const createdTags = await sbJson<
            { id: string; tag: string; bin_theme: string }[]
          >("/book_sorting_tags", {
            method: "POST",
            body: JSON.stringify(
              missingTags.map(tag => ({
                tag,
                bin_theme: BOOK_TAG_TO_THEME[tag],
              }))
            ),
          });

          tagRows = [...tagRows, ...createdTags];
        }

        const tagIds = tagRows
          .filter(row => selectedTagSet.has(row.tag))
          .map(row => row.id);

        // ── Upsert book title ────────────────────────────────────────────────
        let existing: any[] = [];
        let createdTitleForThisCopy = false;

        // First try ISBN match
        if (input.isbn?.trim()) {
          existing = await sbJson<any[]>(
            `/book_titles?isbn=eq.${encodeURIComponent(input.isbn)}&limit=1`
          );
        }

        // Fallback to title + author match
        if (existing.length === 0) {
          existing = await sbJson<any[]>(
            `/book_titles?title=ilike.${encodeURIComponent(input.title)}&author=ilike.${encodeURIComponent(input.author)}&limit=1`
          );
        }
        let titleId: string;
        if (existing.length > 0) {
          titleId = existing[0].id;
          const existingCopies = await sbJson<{ id: string }[]>(
            `/book_copies?book_title_id=eq.${titleId}&select=id&limit=1`
          );
          const titleAgeGroup =
            existingCopies.length === 0
              ? ageGroupKey
              : (normalizeAgeGroup(existing[0].age_group) ?? ageGroupKey);
          await sbVoid(`/book_titles?id=eq.${titleId}`, {
            method: "PATCH",
            body: JSON.stringify({
              cover_url: input.cover_url ?? existing[0].cover_url,
              publisher: input.publisher ?? existing[0].publisher,
              published_date:
                input.published_date ?? existing[0].published_date,
              page_count: input.page_count ?? existing[0].page_count,
              description: input.description ?? existing[0].description,
              subjects: input.subjects ?? existing[0].subjects,
              age_group: titleAgeGroup,
              bin_theme: binTheme ?? existing[0].bin_theme ?? null,
              tag_ids:
                tagIds.length > 0 ? tagIds : (existing[0].tag_ids ?? null),
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
              age_group: ageGroupKey,
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

        // ── Build SKU prefix ─────────────────────────────────────────────────
        const agePrefix = getSkuPrefixForAgeGroup(ageGroupKey);

        // ── Find first unused SKU number (fills gaps, handles >9999) ─────────
        const allSkuData = await sbJson<{ sku: string }[]>(
          `/book_copies?age_group=eq.${ageGroupKey}&select=sku&order=sku.asc&limit=10000`
        );

        const usedNumbers = new Set(
          allSkuData
            .map(r => {
              const m = r.sku.match(/(\d+)$/);
              return m ? parseInt(m[1], 10) : null;
            })
            .filter((n): n is number => n !== null)
        );

        let nextNum = 1;
        while (usedNumbers.has(nextNum)) nextNum++;

        const sku = `BN-${agePrefix}-${String(nextNum).padStart(6, "0")}`;

        // ── Create book copy ─────────────────────────────────────────────────
        let copy: any[] = [];
        try {
          copy = await sbJson<any[]>("/book_copies", {
            method: "POST",
            body: JSON.stringify({
              sku,
              book_title_id: titleId,
              isbn: input.isbn,
              age_group: ageGroupKey,
              bin_id: canonicalBinId,
              status: BOOK_COPY_STATUSES.pendingQc,
              condition: input.condition,
              label_status: LABEL_STATUSES.pending,
              received_at: new Date().toISOString(),
            }),
          });
        } catch (error) {
          if (createdTitleForThisCopy) {
            await sbVoid(`/book_titles?id=eq.${titleId}`, {
              method: "DELETE",
              headers: { Prefer: "return=minimal" },
            }).catch(() => undefined);
          }
          throw error;
        }

        if (!copy[0]?.id) {
          if (createdTitleForThisCopy) {
            await sbVoid(`/book_titles?id=eq.${titleId}`, {
              method: "DELETE",
              headers: { Prefer: "return=minimal" },
            }).catch(() => undefined);
          }
          throw new Error(
            "Book title saved, but no physical copy was created."
          );
        }

        return { success: true, sku, copy_id: copy[0].id, title_id: titleId };
      }),
  }),

  // ─── QC Queue ────────────────────────────────────────────────────────────────
  qc: router({
    queue: publicProcedure.query(async () => {
      const data = await sbJson<any[]>(
        "/book_copies?status=eq.pending_qc&select=id,sku,isbn,age_group,bin_id,status,condition,received_at,book_title_id,book_titles(id,title,author,cover_url)&order=received_at.asc&limit=1000"
      );
      return data.map(c => ({
        id: c.id as string,
        sku: c.sku as string,
        isbn: c.isbn as string | null,
        age_group: c.age_group as string,
        bin_id: c.bin_id as string,
        status: c.status as string,
        condition: c.condition as string | null,
        received_at: c.received_at as string,
        book_title_id: c.book_title_id as string,
        book_title: c.book_titles as {
          id: string;
          title: string;
          author: string;
          cover_url: string | null;
        } | null,
      }));
    }),
    count: publicProcedure.query(async () => {
      const res = await sbFetch("/book_copies?status=eq.pending_qc&select=id", {
        headers: { Prefer: "count=exact", Range: "0-0" },
      });
      const total = parseInt(
        res.headers.get("content-range")?.split("/")[1] ?? "0",
        10
      );
      return { count: total };
    }),
    pass: publicProcedure
      .input(
        z.object({
          copy_id: z.string(),
          condition: z.string(),
          notes: z.string().optional(),
          reprint_label: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const nextStatus = input.reprint_label
          ? "pending_label"
          : "pending_stock";
        await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: nextStatus,
            condition: input.condition,
            qc_notes: input.notes ?? null,
            qc_passed_at: new Date().toISOString(),
            label_status: input.reprint_label
              ? LABEL_STATUSES.pending
              : LABEL_STATUSES.printed,
          }),
          headers: { Prefer: "return=minimal" },
        });
        return { success: true, next_status: nextStatus };
      }),
    fail: publicProcedure
      .input(z.object({ copy_id: z.string(), notes: z.string().optional() }))
      .mutation(async ({ input }) => {
        await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "donated_lfl",
            label_status: LABEL_STATUSES.notRequired,
            qc_notes: input.notes ?? null,
            qc_failed_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
        return { success: true };
      }),
    passAll: publicProcedure
      .input(z.object({ copy_ids: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        if (input.copy_ids.length === 0) return { success: true, count: 0 };
        const now = new Date().toISOString();
        await sbVoid(`/book_copies?id=in.(${input.copy_ids.join(",")})`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "pending_label",
            label_status: LABEL_STATUSES.pending,
            condition: "good",
            qc_passed_at: now,
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });
        return { success: true, count: input.copy_ids.length };
      }),
  }),

  // ─── Stock Queue ─────────────────────────────────────────────────────────────
  stock: router({
    queue: publicProcedure.query(async () => {
      const data = await sbJson<any[]>(
        "/book_copies?status=eq.pending_stock&select=id,sku,isbn,age_group,bin_id,status,condition,received_at,book_title_id,book_titles(id,title,author,cover_url)&order=received_at.asc&limit=1000"
      );
      return data.map(c => ({
        id: c.id as string,
        sku: c.sku as string,
        isbn: c.isbn as string | null,
        age_group: c.age_group as string,
        bin_id: c.bin_id as string,
        status: c.status as string,
        condition: c.condition as string | null,
        received_at: c.received_at as string,
        book_title_id: c.book_title_id as string,
        book_title: c.book_titles as {
          id: string;
          title: string;
          author: string;
          cover_url: string | null;
        } | null,
      }));
    }),
    count: publicProcedure.query(async () => {
      const res = await sbFetch(
        "/book_copies?status=eq.pending_stock&select=id",
        {
          headers: { Prefer: "count=exact", Range: "0-0" },
        }
      );
      const total = parseInt(
        res.headers.get("content-range")?.split("/")[1] ?? "0",
        10
      );
      return { count: total };
    }),
    confirmPlaced: publicProcedure
      .input(z.object({ copy_id: z.string(), bin_id: z.string().optional() }))
      .mutation(async ({ input }) => {
        await sbVoid(`/book_copies?id=eq.${input.copy_id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "in_house",
            stocked_at: new Date().toISOString(),
            ...(input.bin_id ? { bin_id: input.bin_id } : {}),
          }),
          headers: { Prefer: "return=minimal" },
        });
        return { success: true };
      }),
    confirmAll: publicProcedure
      .input(z.object({ copy_ids: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        if (input.copy_ids.length === 0) return { success: true, count: 0 };
        const now = new Date().toISOString();
        await sbVoid(`/book_copies?id=in.(${input.copy_ids.join(",")})`, {
          method: "PATCH",
          body: JSON.stringify({ status: "in_house", stocked_at: now }),
          headers: { Prefer: "return=minimal" },
        });
        return { success: true, count: input.copy_ids.length };
      }),
  }),

  // ─── Donations ──────────────────────────────────────────────────────────────
  donations: router({
    list: publicProcedure.query(async () => {
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

    add: publicProcedure
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

        // Update each child member row
        await Promise.all(
          input.children.map(async child =>
            sbFetch(`/members?id=eq.${child.member_id}`, {
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
            })
          )
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
        await sbFetch(`/households?id=eq.${household.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            welcome_form_completed: true,
            updated_at: now,
          }),
          headers: { Prefer: "return=minimal" },
        });

        return { success: true };
      }),
  }),

  // ─── Returns ────────────────────────────────────────────────────────────────
  returns: router({
    bundles: publicProcedure
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
                status: string | null;
                book_titles: {
                  title: string | null;
                  author: string | null;
                } | null;
              } | null;
            }[]
          >(
            `/shipment_books?shipment_id=in.(${shipmentIds.join(",")})&book_copy_id=not.is.null&select=id,shipment_id,book_copy_id,book_copies(id,sku,bin_id,status,book_titles(title,author))&limit=1000`
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

    openRequests: publicProcedure.query(async () => {
      const returns = await sbJson<
        {
          id: string;
          member_id: string | null;
          return_number: string | null;
          original_shipment_id: string | null;
          status: string;
          created_at: string | null;
        }[]
      >(
        "/returns?status=in.(requested,in_transit,receiving)&order=created_at.asc&limit=50&select=id,member_id,return_number,original_shipment_id,status,created_at"
      );

      if (returns.length === 0) return [];

      const memberIds = Array.from(
        new Set(returns.map(r => r.member_id).filter(Boolean))
      );
      const shipmentIds = Array.from(
        new Set(returns.map(r => r.original_shipment_id).filter(Boolean))
      );

      const [members, shipments] = await Promise.all([
        memberIds.length
          ? sbJson<{ id: string; name: string | null }[]>(
              `/members?id=in.(${memberIds.join(",")})&select=id,name&limit=100`
            )
          : Promise.resolve([]),
        shipmentIds.length
          ? sbJson<{ id: string; shipment_number: string | null }[]>(
              `/shipments?id=in.(${shipmentIds.join(",")})&select=id,shipment_number&limit=100`
            )
          : Promise.resolve([]),
      ]);

      const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
      const shipmentMap = Object.fromEntries(shipments.map(s => [s.id, s]));
      const result = [];

      for (const returnRecord of returns) {
        const expected = returnRecord.original_shipment_id
          ? await sbJson<
              {
                id: string;
                book_copy_id: string | null;
                book_copies: {
                  sku: string | null;
                  status: string | null;
                  book_titles: { title: string | null } | null;
                } | null;
              }[]
            >(
              `/shipment_books?shipment_id=eq.${returnRecord.original_shipment_id}&book_copy_id=not.is.null&select=id,book_copy_id,book_copies(sku,status,book_titles(title))&limit=200`
            )
          : [];
        const received = await sbJson<
          { book_copy_id: string; received: boolean | null }[]
        >(
          `/return_books?return_id=eq.${returnRecord.id}&select=book_copy_id,received&limit=200`
        );
        const receivedIds = new Set(
          received.filter(book => book.received).map(book => book.book_copy_id)
        );

        result.push({
          ...returnRecord,
          member_name: returnRecord.member_id
            ? (memberMap[returnRecord.member_id]?.name ?? "Unknown member")
            : "Unknown member",
          shipment_number: returnRecord.original_shipment_id
            ? (shipmentMap[returnRecord.original_shipment_id]
                ?.shipment_number ?? null)
            : null,
          expected_count: expected.length,
          received_count: receivedIds.size,
          expected_books: expected.map(book => ({
            shipment_book_id: book.id,
            copy_id: book.book_copy_id,
            sku: book.book_copies?.sku ?? null,
            title: book.book_copies?.book_titles?.title ?? null,
            copy_status: book.book_copies?.status ?? null,
            received: book.book_copy_id
              ? receivedIds.has(book.book_copy_id)
              : false,
          })),
        });
      }

      return result;
    }),

    lookupBySku: publicProcedure
      .input(z.object({ sku: z.string() }))
      .query(async ({ input }) => {
        const res = await sbFetch(
          `/book_copies?sku=ilike.${encodeURIComponent(input.sku)}&limit=1&select=id,sku,isbn,age_group,bin_id,status,condition,book_title_id`
        );
        if (!res.ok) return null;
        const copies: any[] = await res.json();
        if (!copies[0]) return null;
        const copy = copies[0];
        const titleRes = await sbFetch(
          `/book_titles?id=eq.${copy.book_title_id}&limit=1&select=id,title,author`
        );
        const titles: any[] = titleRes.ok ? await titleRes.json() : [];
        const sbRes = await sbFetch(
          `/shipment_books?book_copy_id=eq.${copy.id}&order=created_at.desc&limit=1&select=shipment_id,id`
        );
        const sbRows: any[] = sbRes.ok ? await sbRes.json() : [];
        return {
          ...copy,
          book_title: titles[0] ?? null,
          last_shipment_id: sbRows[0]?.shipment_id ?? null,
          last_shipment_book_id: sbRows[0]?.id ?? null,
        };
      }),

    processReturn: publicProcedure
      .input(
        z.object({
          copy_id: z.string(),
          notes: z.string().optional(),
          last_shipment_id: z.string().nullable().optional(),
          last_shipment_book_id: z.string().nullable().optional(),
          sku: z.string().optional(),
          title: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return processReturnedBook({
          copy_id: input.copy_id,
          shipment_id: input.last_shipment_id,
          shipment_book_id: input.last_shipment_book_id,
          notes: input.notes,
          outcome: "received",
        });
      }),

    processBundleBook: publicProcedure
      .input(
        z.object({
          shipment_id: z.string(),
          shipment_book_id: z.string(),
          copy_id: z.string(),
          outcome: z.enum(["received", "missing", "issue"]),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return processReturnedBook({
          copy_id: input.copy_id,
          shipment_id: input.shipment_id,
          shipment_book_id: input.shipment_book_id,
          notes: input.notes,
          outcome: input.outcome,
        });
      }),

    processBundle: publicProcedure
      .input(
        z.object({
          shipment_id: z.string(),
          notes: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const books = await sbJson<
          {
            id: string;
            book_copy_id: string | null;
            book_copies: { status: string | null } | null;
          }[]
        >(
          `/shipment_books?shipment_id=eq.${input.shipment_id}&book_copy_id=not.is.null&select=id,book_copy_id,book_copies(status)&limit=200`
        );

        const outBooks = books.filter(
          book => book.book_copy_id && book.book_copies?.status === "in_transit"
        );

        let lastResult: Awaited<ReturnType<typeof processReturnedBook>> | null =
          null;
        for (const book of outBooks) {
          lastResult = await processReturnedBook({
            copy_id: book.book_copy_id!,
            shipment_id: input.shipment_id,
            shipment_book_id: book.id,
            notes: input.notes,
            outcome: "received",
          });
        }

        return {
          success: true,
          processed_count: outBooks.length,
          return_number: lastResult?.return_number ?? null,
          return_id: lastResult?.return_id ?? null,
          status: lastResult?.status ?? null,
        };
      }),

    history: publicProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        const limit = input.limit ?? 20;
        const res = await sbFetch(
          `/returns?order=processed_at.desc&limit=${limit}&select=id,return_number,status,return_type,actual_return_date,processed_at,notes,original_shipment_id`
        );
        if (!res.ok) return [];
        const returns: any[] = await res.json();
        if (!returns.length) return [];

        const returnIds = returns.map((r: any) => r.id).join(",");
        const rbRes = await sbFetch(
          `/return_books?return_id=in.(${returnIds})&select=return_id,book_copy_id,condition_on_return,condition_notes,action,processed_at`
        );
        const returnBooks: any[] = rbRes.ok ? await rbRes.json() : [];

        const copyIds = Array.from(
          new Set(returnBooks.map((rb: any) => rb.book_copy_id))
        ).join(",");
        let copies: any[] = [];
        if (copyIds) {
          const copyRes = await sbFetch(
            `/book_copies?id=in.(${copyIds})&select=id,sku,bin_id,book_title_id`
          );
          copies = copyRes.ok ? await copyRes.json() : [];
        }
        const titleIds = Array.from(
          new Set(copies.map((c: any) => c.book_title_id))
        ).join(",");
        let titles: any[] = [];
        if (titleIds) {
          const titleRes = await sbFetch(
            `/book_titles?id=in.(${titleIds})&select=id,title,author`
          );
          titles = titleRes.ok ? await titleRes.json() : [];
        }

        const titleMap = Object.fromEntries(titles.map((t: any) => [t.id, t]));
        const copyMap = Object.fromEntries(
          copies.map((c: any) => [
            c.id,
            { ...c, book_title: titleMap[c.book_title_id] ?? null },
          ])
        );
        const rbByReturn: Record<string, any[]> = {};
        for (const rb of returnBooks) {
          if (!rbByReturn[rb.return_id]) rbByReturn[rb.return_id] = [];
          rbByReturn[rb.return_id].push({
            ...rb,
            copy: copyMap[rb.book_copy_id] ?? null,
          });
        }

        return returns.map((r: any) => ({
          ...r,
          books: rbByReturn[r.id] ?? [],
        }));
      }),
  }),

  // ─── Event Sign-Ups ─────────────────────────────────────────────────────────
  signups: router({
    list: publicProcedure.query(async () => {
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

    convertToMember: publicProcedure
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
    list: publicProcedure
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

    resolve: publicProcedure
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

    dismiss: publicProcedure
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
    listMissing: publicProcedure
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

    resolveMissing: publicProcedure
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

    dismissMissing: publicProcedure
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

export type AppRouter = typeof appRouter;
