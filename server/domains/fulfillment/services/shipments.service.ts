import {
  getMemberAddress,
  getMemberById,
  getShipmentBooks,
  getShipmentById,
  getShipments,
  sbFetch,
  updateShipmentStatus,
} from "../../../supabase";

export async function listShipments(input?: { status?: string }) {
  const { data, total } = await getShipments({ status: input?.status, limit: 100 });
  const memberIds = Array.from(new Set(data.map(s => s.member_id)));
  let memberMap: Record<string, string> = {};
  let memberTierMap: Record<string, string> = {};
  if (memberIds.length > 0) {
    const res = await sbFetch(`/members?id=in.(${memberIds.join(",")})&select=id,name,tier&limit=500`);
    const members: { id: string; name: string; tier: string }[] = await res.json();
    memberMap = Object.fromEntries(members.map(m => [m.id, m.name]));
    memberTierMap = Object.fromEntries(members.map(m => [m.id, m.tier]));
  }
  return { data: data.map(s => ({ ...s, member_name: memberMap[s.member_id] ?? "Unknown", member_tier: memberTierMap[s.member_id] ?? null })), total };
}

export async function getShipmentDetail(input: { id: string }) {
  const shipment = await getShipmentById(input.id);
  if (!shipment) return null;
  const [books, member, address] = await Promise.all([
    getShipmentBooks(input.id), getMemberById(shipment.member_id),
    shipment.address_id ? sbFetch(`/member_addresses?id=eq.${shipment.address_id}&limit=1`).then(r => r.json()).then((d: any[]) => d[0] ?? null) : getMemberAddress(shipment.member_id),
  ]);
  const titleIds = Array.from(new Set(books.map(b => b.book_title_id)));
  let titleMap: Record<string, { title: string; author: string; cover_url: string | null }> = {};
  if (titleIds.length > 0) {
    const res = await sbFetch(`/book_titles?id=in.(${titleIds.join(",")})&select=id,title,author,cover_url&limit=50`);
    const titles: { id: string; title: string; author: string; cover_url: string | null }[] = await res.json();
    titleMap = Object.fromEntries(titles.map(t => [t.id, t]));
  }
  return { ...shipment, member, address, books: books.map(b => ({ ...b, book_title: titleMap[b.book_title_id] ?? null })) };
}

export async function updateShipmentTracking(input: { id: string; tracking_number: string; carrier?: string }) {
  const res = await sbFetch(`/shipments?id=eq.${input.id}`, { method: "PATCH", body: JSON.stringify({ tracking_number: input.tracking_number, carrier: input.carrier ?? "USPS", updated_at: new Date().toISOString() }), headers: { Prefer: "return=minimal" } });
  if (!res.ok) throw new Error(`Failed to update tracking: ${await res.text()}`);
  return { success: true };
}

export async function updateShipmentStatusService(input: { id: string; status: string; tracking_number?: string; carrier?: string; actual_ship_date?: string }) {
  const { id, status, ...extra } = input;
  if (status === "shipped") throw new Error("Use shipping.markShipped so copies, shipment books, and member history stay in sync.");
  await updateShipmentStatus(id, status, extra as any);
  return { success: true };
}

export async function listAllShipments() {
  const { data } = await getShipments({ limit: 500 });
  const memberIds = Array.from(new Set(data.map(s => s.member_id)));
  let memberMap: Record<string, string> = {};
  let memberTierMap: Record<string, string> = {};
  if (memberIds.length > 0) {
    const res = await sbFetch(`/members?id=in.(${memberIds.join(",")})&select=id,name,tier&limit=500`);
    const members: { id: string; name: string; tier: string }[] = await res.json();
    memberMap = Object.fromEntries(members.map(m => [m.id, m.name]));
    memberTierMap = Object.fromEntries(members.map(m => [m.id, m.tier]));
  }
  return { data: data.map(s => ({ ...s, member_name: memberMap[s.member_id] ?? "Unknown", member_tier: memberTierMap[s.member_id] ?? null })) };
}