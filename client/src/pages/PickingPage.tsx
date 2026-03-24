// BookNest Ops — Picking Queue (wired to real Supabase data)
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { RefreshCw, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<string, string> = {
  little_nest: "Little Nest",
  cozy_nest: "Cozy Nest",
  story_nest: "Story Nest",
};

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function PickingPage() {
  const { data: pickingData, isLoading: loadingPicking, refetch, isRefetching } =
    trpc.shipments.list.useQuery({ status: "picking" }, { refetchInterval: 60_000 });
  const { data: pendingData, isLoading: loadingPending } =
    trpc.shipments.list.useQuery({ status: "pending" }, { refetchInterval: 60_000 });

  const isLoading = loadingPicking || loadingPending;
  const allOrders = [...(pickingData?.data ?? []), ...(pendingData?.data ?? [])];
  const overdueCount = allOrders.filter((o) => isOverdue(o.scheduled_ship_date)).length;

  const sorted = [...allOrders].sort((a, b) => {
    const aOver = isOverdue(a.scheduled_ship_date);
    const bOver = isOverdue(b.scheduled_ship_date);
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    if (a.scheduled_ship_date && b.scheduled_ship_date) {
      return new Date(a.scheduled_ship_date).getTime() - new Date(b.scheduled_ship_date).getTime();
    }
    return 0;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Picking Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${allOrders.length} order${allOrders.length !== 1 ? "s" : ""} to pick`}
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">· {overdueCount} overdue</span>
            )}
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

      {/* Overdue Alert */}
      {overdueCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{ backgroundColor: "oklch(0.97 0.03 25)", borderColor: "oklch(0.88 0.08 25)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "oklch(0.55 0.22 25)" }} />
          <p className="text-sm font-medium" style={{ color: "oklch(0.40 0.18 25)" }}>
            {overdueCount} order{overdueCount !== 1 ? "s are" : " is"} overdue — pick and ship as soon as possible.
          </p>
        </div>
      )}

      {/* Picking Route Guide */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Warehouse Picking Route</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { prefix: "HATC", label: "Hatchlings", emoji: "🐣" },
            { prefix: "FLED", label: "Fledglings", emoji: "🐥" },
            { prefix: "SOAR", label: "Soarers", emoji: "🦅" },
            { prefix: "SKY", label: "Sky Readers", emoji: "🌟" },
          ].map((zone) => (
            <div key={zone.prefix} className="rounded-lg border border-border p-3 text-center bg-muted/20">
              <p className="text-lg mb-1">{zone.emoji}</p>
              <p className="text-xs font-bold text-foreground">{zone.prefix}</p>
              <p className="text-xs text-muted-foreground">{zone.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading picking queue...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">No orders in the picking queue right now.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 px-5 py-3 bg-muted/30">
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order #</span>
              <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ship By</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
              <span className="col-span-1"></span>
            </div>
            <div className="divide-y divide-border/50">
              {sorted.map((order) => {
                const overdue = isOverdue(order.scheduled_ship_date);
                const tierKey = (order as any).member_tier?.toLowerCase() ?? "";
                const tierLabel = TIER_LABELS[tierKey] ?? order.shipment_type ?? "—";

                return (
                  <div
                    key={order.id}
                    className={cn("grid grid-cols-12 px-5 py-3.5 items-center", overdue && "bg-red-50/40")}
                  >
                    <div className="col-span-2">
                      <p className="text-sm font-mono font-medium text-foreground">
                        {order.order_number ?? order.shipment_number ?? order.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {(order as any).member_name ?? "Unknown Member"}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.85 0.06 155)" }}>
                        {tierLabel}
                      </span>
                    </div>
                    <div className="col-span-2">
                      {order.scheduled_ship_date ? (
                        <div className="flex items-center gap-1.5">
                          {overdue ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          )}
                          <span className={cn("text-xs", overdue ? "text-red-600 font-semibold" : "text-foreground")}>
                            {new Date(order.scheduled_ship_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                        overdue ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"
                      )}>
                        {overdue ? "Overdue" : order.status}
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Link href={`/ship/${order.id}`}>
                        <button
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                        >
                          Pick
                        </button>
                      </Link>
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
