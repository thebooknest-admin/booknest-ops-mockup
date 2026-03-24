import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getDashboardStats,
  getMembers,
  getMemberById,
  getBookTitles,
  getBookTitlesWithCopies,
  getBookCopies,
  getInventorySummary,
  getShipments,
  getShipmentById,
  getShipmentBooks,
  getMemberAddress,
  getBinConfigs,
  updateShipmentStatus,
} from "./supabase";

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

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
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
        const address = await getMemberAddress(input.id);
        return { ...member, address };
      }),
  }),

  // ─── Inventory ──────────────────────────────────────────────────────────────
  inventory: router({
    summary: publicProcedure.query(async () => {
      return getInventorySummary();
    }),

    bookTitles: publicProcedure
      .input(
        z.object({
          limit: z.number().optional(),
          offset: z.number().optional(),
          search: z.string().optional(),
          age_group: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return getBookTitlesWithCopies(input ?? {});
      }),

    bookCopies: publicProcedure
      .input(
        z.object({
          status: z.string().optional(),
          bin_id: z.string().optional(),
          age_group: z.string().optional(),
          limit: z.number().optional(),
        }).optional()
      )
      .query(async ({ input }) => {
        return getBookCopies(input ?? {});
      }),

    bins: publicProcedure.query(async () => {
      return getBinConfigs();
    }),
  }),

  // ─── Shipments / Orders ─────────────────────────────────────────────────────
  shipments: router({
    list: publicProcedure
      .input(z.object({ status: z.string().optional() }).optional())
      .query(async ({ input }) => {
        const { data, total } = await getShipments({ status: input?.status, limit: 100 });
        const memberIds = Array.from(new Set(data.map((s) => s.member_id)));
        let memberMap: Record<string, string> = {};
        if (memberIds.length > 0) {
          const res = await sbFetch(
            `/members?id=in.(${memberIds.join(",")})&select=id,name,tier,age_group&limit=200`
          );
          const members: { id: string; name: string; tier: string; age_group: string }[] = await res.json();
          memberMap = Object.fromEntries(members.map((m) => [m.id, m.name]));
        }
        return {
          data: data.map((s) => ({ ...s, member_name: memberMap[s.member_id] ?? "Unknown" })),
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
                .then((r) => r.json())
                .then((d: any[]) => d[0] ?? null)
            : getMemberAddress(shipment.member_id),
        ]);
        const titleIds = Array.from(new Set(books.map((b) => b.book_title_id)));
        let titleMap: Record<string, { title: string; author: string; cover_url: string | null }> = {};
        if (titleIds.length > 0) {
          const res = await sbFetch(
            `/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author,cover_url&limit=50`
          );
          const titles: { id: string; title: string; author: string; cover_url: string | null }[] = await res.json();
          titleMap = Object.fromEntries(titles.map((t) => [t.id, t]));
        }
        return {
          ...shipment,
          member,
          address,
          books: books.map((b) => ({ ...b, book_title: titleMap[b.book_title_id] ?? null })),
        };
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
        await updateShipmentStatus(id, status, extra as any);
        return { success: true };
      }),
  }),

  // ─── Labels ─────────────────────────────────────────────────────────────────
  labels: router({
    pending: publicProcedure.query(async () => {
      const res = await sbFetch(
        "/book_copies?label_status=eq.pending&status=eq.in_house&select=id,sku,book_title_id,age_group,bin_id,label_status,received_at&limit=200&order=received_at.asc"
      );
      const copies: any[] = await res.json();
      const titleIds = Array.from(new Set(copies.map((c) => c.book_title_id).filter(Boolean)));
      let titleMap: Record<string, { title: string; author: string }> = {};
      if (titleIds.length > 0) {
        const tr = await sbFetch(
          `/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author&limit=300`
        );
        const titles: { id: string; title: string; author: string }[] = await tr.json();
        titleMap = Object.fromEntries(titles.map((t) => [t.id, t]));
      }
      return copies.map((c) => ({ ...c, book_title: titleMap[c.book_title_id] ?? null }));
    }),

    markPrinted: publicProcedure
      .input(z.object({ ids: z.array(z.string()) }))
      .mutation(async ({ input }) => {
        await sbFetch(`/book_copies?id=in.(${input.ids.join(",")})`, {
          method: "PATCH",
          body: JSON.stringify({
            label_status: "printed",
            label_printed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=minimal" },
        });
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
          subjects: z.array(z.string()).optional(),
          age_group: z.string(),
          bin_id: z.string(),
          condition: z.string().default("good"),
          tags: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const titleRes = await sbFetch("/book_titles?isbn=eq." + input.isbn + "&limit=1");
        const existing: any[] = await titleRes.json();
        let titleId: string;
        if (existing.length > 0) {
          titleId = existing[0].id;
          await sbFetch(`/book_titles?id=eq.${titleId}`, {
            method: "PATCH",
            body: JSON.stringify({
              cover_url: input.cover_url ?? existing[0].cover_url,
              publisher: input.publisher ?? existing[0].publisher,
              published_date: input.published_date ?? existing[0].published_date,
              page_count: input.page_count ?? existing[0].page_count,
              subjects: input.subjects ?? existing[0].subjects,
              updated_at: new Date().toISOString(),
            }),
            headers: { Prefer: "return=minimal" },
          });
        } else {
          const newTitleRes = await sbFetch("/book_titles", {
            method: "POST",
            body: JSON.stringify({
              isbn: input.isbn,
              title: input.title,
              author: input.author,
              cover_url: input.cover_url ?? null,
              age_group: input.age_group,
              publisher: input.publisher ?? null,
              published_date: input.published_date ?? null,
              page_count: input.page_count ?? null,
              subjects: input.subjects ?? null,
            }),
          });
          const newTitle: any[] = await newTitleRes.json();
          titleId = newTitle[0].id;
        }
        const agePrefix = input.age_group.toUpperCase().slice(0, 4);
        const countRes = await sbFetch(`/book_copies?age_group=ilike.${input.age_group}&select=id`, {
          headers: { Prefer: "count=exact" },
        });
        const count = parseInt(countRes.headers.get("content-range")?.split("/")[1] ?? "0", 10);
        const sku = `BN-${agePrefix}-${String(count + 1).padStart(4, "0")}`;
        const copyRes = await sbFetch("/book_copies", {
          method: "POST",
          body: JSON.stringify({
            sku,
            book_title_id: titleId,
            isbn: input.isbn,
            age_group: input.age_group.toLowerCase(),
            bin_id: input.bin_id,
            status: "in_house",
            condition: input.condition,
            label_status: "pending",
            received_at: new Date().toISOString(),
          }),
        });
        const copy: any[] = await copyRes.json();
        return { success: true, sku, copy_id: copy[0]?.id, title_id: titleId };
      }),
  }),

  // ─── Donations ──────────────────────────────────────────────────────────────
  donations: router({
    list: publicProcedure.query(async () => {
      const res = await sbFetch("/donations?order=created_at.desc&limit=200", {
        headers: { Prefer: "count=exact" },
      });
      if (!res.ok) return { data: [], total: 0 };
      const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
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
          body: JSON.stringify({ ...input, tags: input.tags ?? [], created_at: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(`Failed to save donation: ${await res.text()}`);
        const data = await res.json();
        return { success: true, id: data[0]?.id };
      }),
  }),

  // ─── Event Sign-Ups ─────────────────────────────────────────────────────────
  signups: router({
    list: publicProcedure.query(async () => {
      const res = await sbFetch("/event_signups?order=created_at.desc&limit=200", {
        headers: { Prefer: "count=exact" },
      });
      if (!res.ok) return { data: [], total: 0 };
      const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
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
          body: JSON.stringify({ ...input, created_at: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(`Failed to save sign-up: ${await res.text()}`);
        const data = await res.json();
        return { success: true, id: data[0]?.id };
      }),
  }),
});

export type AppRouter = typeof appRouter;
