import { sbJson } from "../../../supabase";

const OPEN_SHIPMENT_STATUSES = "picking,packing,packed,shipped";
const OPEN_RETURN_STATUSES = "requested,in_transit,receiving";

type Shipment = { id: string; status: string };
type ReturnRecord = { id: string; status: string };

export type MemberCycleState = {
  open: boolean;
  shipment: Shipment | null;
  returnRecord: ReturnRecord | null;
};

async function isShippedCycleResolved(shipmentId: string): Promise<boolean> {
  const [receivedReturn] = await sbJson<ReturnRecord[]>(
    `/returns?original_shipment_id=eq.${shipmentId}&status=eq.received&select=id,status&limit=1`
  );
  if (!receivedReturn) return false;

  const [expectedBooks, resolvedBooks] = await Promise.all([
    sbJson<{ book_copy_id: string | null }[]>(
      `/shipment_books?shipment_id=eq.${shipmentId}&book_copy_id=not.is.null&select=book_copy_id&limit=200`
    ),
    sbJson<{ book_copy_id: string | null }[]>(
      `/return_books?return_id=eq.${receivedReturn.id}&processed_at=not.is.null&select=book_copy_id&limit=200`
    ),
  ]);

  const resolvedCopyIds = new Set(
    resolvedBooks.map(book => book.book_copy_id).filter((id): id is string => Boolean(id))
  );
  return expectedBooks.every(
    book => !book.book_copy_id || resolvedCopyIds.has(book.book_copy_id)
  );
}

export async function getMemberCycleState(memberId: string): Promise<MemberCycleState> {
  const [shipments, openReturns] = await Promise.all([
    sbJson<Shipment[]>(
      `/shipments?member_id=eq.${memberId}&shipment_type=eq.outbound&status=in.(${OPEN_SHIPMENT_STATUSES})&select=id,status&limit=200`
    ),
    sbJson<ReturnRecord[]>(
      `/returns?member_id=eq.${memberId}&status=in.(${OPEN_RETURN_STATUSES})&select=id,status&limit=1`
    ),
  ]);

  const activeShipment = shipments.find(shipment => shipment.status !== "shipped");
  if (activeShipment) {
    return { open: true, shipment: activeShipment, returnRecord: null };
  }
  if (openReturns[0]) {
    return { open: true, shipment: null, returnRecord: openReturns[0] };
  }

  for (const shipment of shipments.filter(item => item.status === "shipped")) {
    if (!(await isShippedCycleResolved(shipment.id))) {
      return { open: true, shipment, returnRecord: null };
    }
  }

  return { open: false, shipment: null, returnRecord: null };
}

export async function isMemberCycleOpen(memberId: string): Promise<boolean> {
  return (await getMemberCycleState(memberId)).open;
}