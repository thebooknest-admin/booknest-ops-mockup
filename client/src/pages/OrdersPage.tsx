// BookNest Ops — Order History
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Package, RefreshCw, Search, X, ExternalLink,
  CheckCircle2, Clock, AlertTriangle, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<string, string> = {
  "little-nest": "Little Nest", "cozy-nest": "Cozy Nest", "story-nest": "Story Nest",
  little_nest: "Little Nest", cozy_nest: "Cozy Nest", story_nest: "Story Nest",
};

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "picking", label: "Picking" },
  { value: "packing", label: "Packing" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  picking:  { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   label: "Picking" },
  packing:  { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  label: "Packing" },
  packed:   { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", label: "Packed" },
  shipped:  { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  label: "Shipped" },
};

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border", label: status };
}

export default function OrdersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading, refetch, isRefetching } =
    trpc.shipments.listAll.useQuery(undefined, { refetchInterval: 120_000 });

  const allOrders = data?.data ?? [];

  // Client-side filter
  const filtered = allOrders.filter((o) => {
    if (statusFilter && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const memberName = ((o as any).member_name ?? "").toLowerCase();
      const orderNum = (o.order_number ?? o.shipment_number ?? "").toLowerCase();
      const tracking = (o.tracking_number ?? "").toLowerCase();
      if (!memberName.includes(q) && !orderNum.includes(q) && !tracking.includes(q)) return false;
    }
    return true;
  });

  const shippedCount = allOrders.filter((o) => o.status === "shipped").length;
  const inProgressCount = allOrders.filter((o) => ["picking", "packing", "packed"].includes(o.status)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-muted-foreground" />
            Order History
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? "Loading..." : `${allOrders.length} total order${allOrders.length !== 1 ? "s" : ""} · ${shippedCount} shipped · ${inProgressCount} in progress`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search member, order #, or tracking..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Clear filters */}
        {(search || statusFilter) && (
          <button
            onClick={() => { setSearch(""); setStatusFilter(""); }}
            className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Clear
          </button>
        )}

        {filtered.length !== allOrders.length && (
          <span className="text-xs text-muted-foreground">
            Showing {filtered.length} of {allOrders.length}
          </span>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading orders...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">No orders found</p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || statusFilter ? "Try adjusting your filters." : "Orders will appear here once created."}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid grid-cols-12 px-5 py-3 bg-muted/30 border-b border-border">
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order #</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ship Date</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking</span>
              <span className="col-span-1"></span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/50">
              {filtered.map((order) => {
                const style = getStatusStyle(order.status);
                const tierKey = ((order as any).member_tier ?? "").toLowerCase();
                const tierLabel = TIER_LABELS[tierKey] ?? "—";
                const shipDate = order.scheduled_ship_date
                  ? new Date(order.scheduled_ship_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—";
                const actualDate = order.actual_ship_date
                  ? new Date(order.actual_ship_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : null;

                return (
                  <div key={order.id} className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-muted/10 transition-colors">
                    {/* Order # */}
                    <div className="col-span-2">
                      <p className="text-sm font-mono font-medium text-foreground">
                        {order.order_number ?? order.shipment_number ?? order.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>

                    {/* Member */}
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {(order as any).member_name ?? "Unknown"}
                      </p>
                    </div>

                    {/* Tier */}
                    <div className="col-span-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.85 0.06 155)" }}>
                        {tierLabel}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-span-1">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize", style.bg, style.text, style.border)}>
                        {style.label}
                      </span>
                    </div>

                    {/* Ship date */}
                    <div className="col-span-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1">
                          {order.status === "shipped"
                            ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                            : <Clock className="w-3 h-3 text-muted-foreground shrink-0" />}
                          <span className="text-xs text-foreground">{shipDate}</span>
                        </div>
                        {actualDate && (
                          <p className="text-xs text-muted-foreground pl-4">shipped {actualDate}</p>
                        )}
                      </div>
                    </div>

                    {/* Tracking */}
                    <div className="col-span-2">
                      {order.tracking_number ? (
                        <a
                          href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${order.tracking_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors group"
                        >
                          <span className="truncate">{order.tracking_number}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="col-span-1 flex justify-end">
                      {order.status === "packed" || order.status === "shipped" ? (
                        <Link href={`/ship/${order.id}`}>
                          <button className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                            View
                          </button>
                        </Link>
                      ) : order.status === "picking" ? (
                        <Link href="/picking">
                          <button className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                            Pick
                          </button>
                        </Link>
                      ) : order.status === "packing" ? (
                        <Link href="/packing">
                          <button className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors">
                            Pack
                          </button>
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}