// BookNest Ops — Shipping Queue
// Labels via Pirateship. Ship days: Tuesday & Friday.
// Click "Ship" to open a modal showing the full address + tracking number input.
// Confirming tracking marks the shipment as shipped automatically.

import { useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Truck, AlertTriangle, Clock, RefreshCw, CheckCircle2,
  CalendarDays, PackageCheck, X, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Ship day helpers (Tuesday = 2, Friday = 5) ───────────────────────────────

function getNextShipDay(): { label: string; date: string; isToday: boolean } {
  const now = new Date();
  const day = now.getDay();
  const SHIP_DAYS = [2, 5];

  let daysAhead = 0;
  for (let i = 0; i <= 7; i++) {
    if (SHIP_DAYS.includes((day + i) % 7)) { daysAhead = i; break; }
  }

  const next = new Date(now);
  next.setDate(now.getDate() + daysAhead);
  const isToday = daysAhead === 0;
  const label = isToday
    ? "Today"
    : next.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  return { label, date: next.toISOString().split("T")[0], isToday };
}

function isOverdue(date: string | null | undefined): boolean {
  if (!date) return false;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

function isDueToday(date: string | null | undefined): boolean {
  if (!date) return false;
  return date === new Date().toISOString().split("T")[0];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Order {
  id: string;
  shipment_number?: string | null;
  order_number?: string | null;
  member_name: string;
  member_tier?: string | null;
  scheduled_ship_date?: string | null;
  address?: {
    street: string;
    street2?: string | null;
    city: string;
    state: string;
    zip: string;
  } | null;
}

// ─── Ship Modal ───────────────────────────────────────────────────────────────

interface ShipModalProps {
  order: Order;
  onClose: () => void;
  onConfirm: (shipmentId: string, trackingNumber: string) => void;
  isPending: boolean;
}

function ShipModal({ order, onClose, onConfirm, isPending }: ShipModalProps) {
  const [tracking, setTracking] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayNumber =
    order.order_number ?? order.shipment_number ?? order.id.slice(0, 8).toUpperCase();

  const handleConfirm = () => {
    const t = tracking.trim();
    if (!t) { toast.error("Please enter a tracking number."); inputRef.current?.focus(); return; }
    onConfirm(order.id, t);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-foreground">Ship Order</h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{displayNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          {/* Member + address */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shipping To</p>
            <div className="bg-muted/40 rounded-xl px-4 py-3 space-y-0.5">
              <p className="text-sm font-semibold text-foreground">{order.member_name}</p>
              {order.address ? (
                <>
                  <p className="text-sm text-muted-foreground">{order.address.street}{order.address.street2 ? `, ${order.address.street2}` : ""}</p>
                  <p className="text-sm text-muted-foreground">{order.address.city}, {order.address.state} {order.address.zip}</p>
                </>
              ) : (
                <p className="text-sm text-red-500 font-medium">⚠ No address on file</p>
              )}
            </div>
          </div>

          {/* Pirateship link */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Create Label</p>
            <a
               href="https://www.pirateship.com/ship"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between w-full px-4 py-3 rounded-xl border border-border hover:bg-muted/50 transition-colors group"
            >
              <span className="text-sm font-medium text-foreground">Open Pirateship</span>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </a>
            <p className="text-xs text-muted-foreground">
              Create the label in Pirateship, then paste the tracking number below.
            </p>
          </div>

          {/* Tracking input */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tracking Number</p>
            <input
              ref={inputRef}
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="9400111899223397978459"
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal transition-all placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-border flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending || !tracking.trim()}
            className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            {isPending ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><CheckCircle2 className="w-4 h-4" /> Mark as Shipped</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tier labels ──────────────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  "little-nest": "Little Nest", "cozy-nest": "Cozy Nest", "story-nest": "Story Nest",
  little_nest: "Little Nest", cozy_nest: "Cozy Nest", story_nest: "Story Nest",
};

// ─── Order Row ────────────────────────────────────────────────────────────────

interface OrderRowProps {
  order: Order;
  onShip: (order: Order) => void;
}

function OrderRow({ order, onShip }: OrderRowProps) {
  const overdue = isOverdue(order.scheduled_ship_date);
  const today = isDueToday(order.scheduled_ship_date);

  return (
    <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground">{order.member_name}</span>
          {order.member_tier && (
            <span className="text-xs text-muted-foreground">
              {TIER_LABELS[order.member_tier] ?? order.member_tier}
            </span>
          )}
          {overdue && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
              <AlertTriangle className="w-3 h-3" /> Overdue
            </span>
          )}
          {today && !overdue && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
              <Clock className="w-3 h-3" /> Due today
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          {order.shipment_number && (
            <span className="text-xs font-mono text-muted-foreground">{order.shipment_number}</span>
          )}
          {order.scheduled_ship_date && (
            <span className="text-xs text-muted-foreground">Ship: {order.scheduled_ship_date}</span>
          )}
          {order.address && (
            <span className="text-xs text-muted-foreground">
              {order.address.city}, {order.address.state}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onShip(order)}
        className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors shrink-0"
        style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
      >
        <Truck className="w-4 h-4" />
        Ship
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ShippingPage() {
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const { data: packedData, isLoading, refetch, isRefetching } =
    trpc.shipping.list.useQuery({ status: "packed" }, { refetchInterval: 60_000 });

  const markShipped = trpc.shipping.markShipped.useMutation({
    onSuccess: () => {
      toast.success("Shipment marked as shipped!");
      setActiveOrder(null);
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to mark as shipped: " + err.message);
    },
  });

  const orders: Order[] = packedData?.data ?? [];
  const nextShipDay = getNextShipDay();

  const overdueOrders = orders.filter((o) => isOverdue(o.scheduled_ship_date));
  const todayOrders = orders.filter((o) => isDueToday(o.scheduled_ship_date));
  const upcomingOrders = orders.filter(
    (o) => !isOverdue(o.scheduled_ship_date) && !isDueToday(o.scheduled_ship_date)
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Shipping Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? "Loading orders…"
              : `${orders.length} order${orders.length !== 1 ? "s" : ""} ready to ship`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border",
              nextShipDay.isToday
                ? "border-green-300 bg-green-50 text-green-700"
                : "border-border bg-muted text-muted-foreground"
            )}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Ship day: {nextShipDay.label}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && orders.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <PackageCheck className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-base font-medium text-foreground">All shipped!</p>
          <p className="text-sm text-muted-foreground mt-1">No orders waiting to ship.</p>
        </div>
      )}

      {/* Overdue */}
      {overdueOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-xs font-semibold text-red-500 uppercase tracking-widest">Overdue</p>
          </div>
          {overdueOrders.map((order) => (
            <OrderRow key={order.id} order={order} onShip={setActiveOrder} />
          ))}
        </div>
      )}

      {/* Due today */}
      {todayOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <p className="text-xs font-semibold text-amber-500 uppercase tracking-widest">Due Today</p>
          </div>
          {todayOrders.map((order) => (
            <OrderRow key={order.id} order={order} onShip={setActiveOrder} />
          ))}
        </div>
      )}

      {/* Upcoming */}
      {upcomingOrders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Upcoming</p>
          </div>
          {upcomingOrders.map((order) => (
            <OrderRow key={order.id} order={order} onShip={setActiveOrder} />
          ))}
        </div>
      )}

      {/* Ship modal */}
      {activeOrder && (
        <ShipModal
          order={activeOrder}
          onClose={() => setActiveOrder(null)}
          onConfirm={(shipmentId, trackingNumber) =>
            markShipped.mutate({ shipment_id: shipmentId, tracking_number: trackingNumber })
          }
          isPending={markShipped.isPending}
        />
      )}
    </div>
  );
}