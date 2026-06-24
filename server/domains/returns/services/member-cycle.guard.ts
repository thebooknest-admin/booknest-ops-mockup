import { sbJson } from "../../../supabase";

const OPEN_SHIPMENT_STATUSES = "picking,packing,packed,shipped";
const OPEN_RETURN_STATUSES = "requested,in_transit,receiving";

export type MemberCycleState = {
  open: boolean;
  shipment: { id: string; status: string } | null;
  returnRecord: { id: string; status: string } | null;
};

export async function getMemberCycleState(memberId: string): Promise<MemberCycleState> {
  const [shipments, returns] = await Promise.all([
    sbJson<{ id: string; status: string }[]>(
      `/shipments?member_id=eq.${memberId}&shipment_type=eq.outbound&status=in.(${OPEN_SHIPMENT_STATUSES})&select=id,status&limit=1`
    ),
    sbJson<{ id: string; status: string }[]>(
      `/returns?member_id=eq.${memberId}&status=in.(${OPEN_RETURN_STATUSES})&select=id,status&limit=1`
    ),
  ]);
  return {
    open: Boolean(shipments[0] || returns[0]),
    shipment: shipments[0] ?? null,
    returnRecord: returns[0] ?? null,
  };
}

export async function isMemberCycleOpen(memberId: string): Promise<boolean> {
  return (await getMemberCycleState(memberId)).open;
}