import { formatInventoryLocation } from "@shared/booknest";
import { sbFetch, sbJson, sbVoid } from "../../../../server/supabase";

type ReturnOutcome = "received" | "missing" | "issue";
type NextShipment = (input: { member_id: string; source?: "manual" | "return" }) => Promise<any>;

export function createReturnsService(createPickingOrderForMember: NextShipment) {
  async function getNextReturnStatus(returnId: string, shipmentId: string) {
    const [shipmentBooks, handledBooks] = await Promise.all([
      sbJson<any[]>(`/shipment_books?shipment_id=eq.${shipmentId}&book_copy_id=not.is.null&select=id,book_copy_id,book_copies(status)&limit=200`),
      sbJson<any[]>(`/return_books?return_id=eq.${returnId}&processed_at=not.is.null&select=book_copy_id&limit=200`),
    ]);
    const handledCopyIds = new Set(handledBooks.map(book => book.book_copy_id).filter(Boolean));
    const hasOutstandingBooks = shipmentBooks.some(book => book.book_copy_id && !handledCopyIds.has(book.book_copy_id) && book.book_copies?.status === "in_transit");
    return hasOutstandingBooks ? "receiving" : "received";
  }

  async function processReturnedBook(input: { copy_id: string; shipment_id?: string | null; shipment_book_id?: string | null; notes?: string | null; outcome?: ReturnOutcome }) {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const outcome = input.outcome ?? "received";
    const [copy] = await sbJson<any[]>(`/book_copies?id=eq.${input.copy_id}&select=id,book_title_id,status&limit=1`);
    if (!copy) throw new Error("Book copy not found");
    let shipmentBookId = input.shipment_book_id ?? null;
    let shipmentId = input.shipment_id ?? null;
    let memberId: string | null = null;
    if (shipmentBookId || shipmentId) {
      const filters = shipmentBookId ? `id=eq.${shipmentBookId}` : `shipment_id=eq.${shipmentId}&book_copy_id=eq.${input.copy_id}`;
      const shipmentBook = (await sbJson<any[]>(`/shipment_books?${filters}&order=created_at.desc&limit=1&select=id,shipment_id,shipments(member_id)`))[0];
      shipmentBookId = shipmentBook?.id ?? shipmentBookId;
      shipmentId = shipmentBook?.shipment_id ?? shipmentId;
      memberId = shipmentBook?.shipments?.member_id ?? null;
    }
    if (!shipmentId || !shipmentBookId || !memberId) {
      const shipmentBook = (await sbJson<any[]>(`/shipment_books?book_copy_id=eq.${input.copy_id}&order=created_at.desc&limit=1&select=id,shipment_id,shipments(member_id)`))[0];
      shipmentBookId = shipmentBook?.id ?? shipmentBookId;
      shipmentId = shipmentBook?.shipment_id ?? shipmentId;
      memberId = shipmentBook?.shipments?.member_id ?? memberId;
    }
    const keptHistory = outcome === "missing" && memberId && shipmentId && copy.book_title_id
      ? await sbJson<any[]>(`/member_book_history?member_id=eq.${memberId}&shipment_id=eq.${shipmentId}&book_title_id=eq.${copy.book_title_id}&kept=eq.true&select=id&limit=1`) : [];
    const missingWasKept = outcome === "missing" && keptHistory.length > 0;
    await sbVoid(`/book_copies?id=eq.${input.copy_id}`, { method: "PATCH", body: JSON.stringify({ status: missingWasKept ? "withdrawn" : outcome === "missing" ? "lost" : "in_house", updated_at: now }), headers: { Prefer: "return=minimal" } });
    const returnNumber = `RET-${now.slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    let returnRows: any[] = [];
    if (shipmentId) returnRows = await sbJson<any[]>(`/returns?original_shipment_id=eq.${shipmentId}&status=in.(requested,in_transit,receiving)&order=created_at.desc&limit=1`);
    if (!returnRows[0] && memberId) returnRows = await sbJson<any[]>(`/returns?member_id=eq.${memberId}&status=in.(requested,in_transit,receiving)&order=created_at.desc&limit=1`);
    let returnRecord = returnRows[0] ?? null;
    if (!returnRecord) {
      returnRecord = (await sbJson<any[]>("/returns", { method: "POST", body: JSON.stringify({ member_id: memberId, return_number: returnNumber, original_shipment_id: shipmentId, status: shipmentId ? "receiving" : "received", return_type: "swap", actual_return_date: today, processed_at: now, notes: input.notes ?? null, created_at: now, updated_at: now }) }))[0] ?? null;
    }
    if (!returnRecord?.id) throw new Error("Failed to create or locate return record");
    const returnId = returnRecord.id as string;
    const notePrefix = outcome === "missing" ? (missingWasKept ? "Kept/paid before return" : "Missing on return") : outcome === "issue" ? "Issue on return" : null;
    const conditionNotes = [notePrefix, input.notes].filter(Boolean).join(": ");
    const existingReturnBook = (await sbJson<any[]>(`/return_books?return_id=eq.${returnId}&book_copy_id=eq.${input.copy_id}&select=id&limit=1`))[0];
    const returnBookBody = { shipment_book_id: shipmentBookId, received: outcome !== "missing", condition_on_return: "good", condition_notes: conditionNotes || null, action: "restock", processed_at: now };
    if (existingReturnBook) await sbVoid(`/return_books?id=eq.${existingReturnBook.id}`, { method: "PATCH", body: JSON.stringify(returnBookBody), headers: { Prefer: "return=minimal" } });
    else await sbVoid("/return_books", { method: "POST", body: JSON.stringify({ return_id: returnId, book_copy_id: input.copy_id, ...returnBookBody, created_at: now }), headers: { Prefer: "return=minimal" } });
    if (memberId && shipmentId && copy.book_title_id && outcome !== "missing") {
      await sbVoid(`/member_book_history?member_id=eq.${memberId}&shipment_id=eq.${shipmentId}&book_title_id=eq.${copy.book_title_id}`, { method: "PATCH", body: JSON.stringify({ returned_date: today, kept: false, notes: input.notes ?? null }), headers: { Prefer: "return=minimal" } });
    }
    const nextReturnStatus = shipmentId ? await getNextReturnStatus(returnId, shipmentId) : "received";
    await sbVoid(`/returns?id=eq.${returnId}`, { method: "PATCH", body: JSON.stringify({ status: nextReturnStatus, actual_return_date: today, processed_at: now, notes: input.notes ?? returnRecord.notes ?? null, updated_at: now }), headers: { Prefer: "return=minimal" } });
    let nextShipment: any = null;
    let nextShipmentError: string | null = null;
    if (memberId && nextReturnStatus === "received") {
      try { nextShipment = await createPickingOrderForMember({ member_id: memberId, source: "return" }); }
      catch (error) { nextShipmentError = error instanceof Error ? error.message : "Could not create next order."; }
    }
    return { success: true, return_number: returnRecord.return_number ?? returnNumber, return_id: returnId, status: nextReturnStatus, next_shipment: nextShipment, next_shipment_error: nextShipmentError };
  }

  async function lookupBySku(input: { sku: string }) {
    const res = await sbFetch(`/book_copies?sku=ilike.${encodeURIComponent(input.sku)}&limit=1&select=id,sku,isbn,age_group,bin_id,section,status,condition,book_title_id`);
    if (!res.ok) return null;
    const copies: any[] = await res.json();
    if (!copies[0]) return null;
    const copy = copies[0];
    const titleRes = await sbFetch(`/book_titles?id=eq.${copy.book_title_id}&limit=1&select=id,title,author`);
    const titles: any[] = titleRes.ok ? await titleRes.json() : [];
    const shipmentRes = await sbFetch(`/shipment_books?book_copy_id=eq.${copy.id}&order=created_at.desc&limit=1&select=shipment_id,id`);
    const rows: any[] = shipmentRes.ok ? await shipmentRes.json() : [];
    return { ...copy, location: formatInventoryLocation(copy.bin_id, copy.section), book_title: titles[0] ?? null, last_shipment_id: rows[0]?.shipment_id ?? null, last_shipment_book_id: rows[0]?.id ?? null };
  }

  async function openRequests() {
    const returns = await sbJson<any[]>("/returns?status=in.(requested,in_transit,receiving)&order=created_at.asc&limit=50&select=id,member_id,return_number,original_shipment_id,status,created_at");
    if (!returns.length) return [];
    const memberIds = Array.from(new Set(returns.map(r => r.member_id).filter(Boolean)));
    const shipmentIds = Array.from(new Set(returns.map(r => r.original_shipment_id).filter(Boolean)));
    const [members, shipments] = await Promise.all([memberIds.length ? sbJson<any[]>(`/members?id=in.(${memberIds.join(",")})&select=id,name&limit=100`) : Promise.resolve([]), shipmentIds.length ? sbJson<any[]>(`/shipments?id=in.(${shipmentIds.join(",")})&select=id,shipment_number&limit=100`) : Promise.resolve([])]);
    const memberMap = Object.fromEntries(members.map(m => [m.id, m]));
    const shipmentMap = Object.fromEntries(shipments.map(s => [s.id, s]));
    const result: any[] = [];
    for (const returnRecord of returns) {
      const expected = returnRecord.original_shipment_id ? await sbJson<any[]>(`/shipment_books?shipment_id=eq.${returnRecord.original_shipment_id}&book_copy_id=not.is.null&select=id,book_copy_id,book_copies(sku,status,book_titles(title))&limit=200`) : [];
      const received = await sbJson<any[]>(`/return_books?return_id=eq.${returnRecord.id}&select=book_copy_id,received&limit=200`);
      const receivedIds = new Set(received.filter(book => book.received).map(book => book.book_copy_id));
      const outstanding = expected.some(book => book.book_copy_id && !receivedIds.has(book.book_copy_id) && book.book_copies?.status === "in_transit");
      if (returnRecord.original_shipment_id && !outstanding) continue;
      result.push({ ...returnRecord, member_name: returnRecord.member_id ? (memberMap[returnRecord.member_id]?.name ?? "Unknown member") : "Unknown member", shipment_number: returnRecord.original_shipment_id ? (shipmentMap[returnRecord.original_shipment_id]?.shipment_number ?? null) : null, expected_count: expected.length, received_count: receivedIds.size, expected_books: expected.map(book => ({ shipment_book_id: book.id, copy_id: book.book_copy_id, sku: book.book_copies?.sku ?? null, title: book.book_copies?.book_titles?.title ?? null, copy_status: book.book_copies?.status ?? null, received: book.book_copy_id ? receivedIds.has(book.book_copy_id) : false })) });
    }
    return result;
  }

  async function history(input: { limit?: number }) {
    const limit = input.limit ?? 20;
    const res = await sbFetch(`/returns?order=processed_at.desc&limit=${limit}&select=id,return_number,status,return_type,actual_return_date,processed_at,notes,original_shipment_id`);
    if (!res.ok) return [];
    const returns: any[] = await res.json();
    if (!returns.length) return [];
    const returnIds = returns.map(r => r.id).join(",");
    const rbRes = await sbFetch(`/return_books?return_id=in.(${returnIds})&select=return_id,book_copy_id,condition_on_return,condition_notes,action,processed_at`);
    const returnBooks: any[] = rbRes.ok ? await rbRes.json() : [];
    const copyIds = Array.from(new Set(returnBooks.map(rb => rb.book_copy_id))).join(",");
    let copies: any[] = [];
    if (copyIds) { const res = await sbFetch(`/book_copies?id=in.(${copyIds})&select=id,sku,bin_id,section,book_title_id`); copies = res.ok ? await res.json() : []; }
    const titleIds = Array.from(new Set(copies.map(c => c.book_title_id))).join(",");
    let titles: any[] = [];
    if (titleIds) { const res = await sbFetch(`/book_titles?id=in.(${titleIds})&select=id,title,author`); titles = res.ok ? await res.json() : []; }
    const titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
    const copyMap = Object.fromEntries(copies.map(c => [c.id, { ...c, location: formatInventoryLocation(c.bin_id, c.section), book_title: titleMap[c.book_title_id] ?? null }]));
    const byReturn: Record<string, any[]> = {};
    for (const rb of returnBooks) { if (!byReturn[rb.return_id]) byReturn[rb.return_id] = []; byReturn[rb.return_id].push({ ...rb, copy: copyMap[rb.book_copy_id] ?? null }); }
    return returns.map(r => ({ ...r, books: byReturn[r.id] ?? [] }));
  }

  async function processReturn(input: any) { return processReturnedBook({ copy_id: input.copy_id, shipment_id: input.last_shipment_id, shipment_book_id: input.last_shipment_book_id, notes: input.notes, outcome: "received" }); }
  async function processBundleBook(input: any) { return processReturnedBook({ copy_id: input.copy_id, shipment_id: input.shipment_id, shipment_book_id: input.shipment_book_id, notes: input.notes, outcome: input.outcome }); }
  async function processBundle(input: any) {
    const books = await sbJson<any[]>(`/shipment_books?shipment_id=eq.${input.shipment_id}&book_copy_id=not.is.null&select=id,book_copy_id,book_copies(status)&limit=200`);
    const outBooks = books.filter(book => book.book_copy_id && book.book_copies?.status === "in_transit");
    let lastResult: any = null;
    for (const book of outBooks) lastResult = await processReturnedBook({ copy_id: book.book_copy_id, shipment_id: input.shipment_id, shipment_book_id: book.id, notes: input.notes, outcome: "received" });
    return { success: true, processed_count: outBooks.length, return_number: lastResult?.return_number ?? null, return_id: lastResult?.return_id ?? null, status: lastResult?.status ?? null, next_shipment: lastResult?.next_shipment ?? null, next_shipment_error: lastResult?.next_shipment_error ?? null };
  }
  return { getNextReturnStatus, processReturnedBook, lookupBySku, openRequests, history, processReturn, processBundleBook, processBundle };
}