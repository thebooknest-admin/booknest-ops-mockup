// BookNest Ops — Dashboard (Command Center)
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Package, Truck, Archive, Users,
  AlertTriangle, AlertCircle, ArrowRight, BookOpen, RotateCcw,
  RefreshCw, BoxIcon, ClipboardCheck, ClipboardList, Gift, ArrowRightLeft,
  CheckCircle2, Tag, Layers, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getNextShipDay } from "@/lib/shipDays";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = trpc.dashboard.stats.useQuery(undefined, {
    refetchInterval: 60_000,
  });

const [, navigate] = useLocation();
const [showPickModal, setShowPickModal] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });

  const nextShipDay = getNextShipDay();
  const overdueCount = stats?.overdueShipments ?? 0;
  const toPick = stats?.toPick ?? 0;
  useEffect(() => {
  if (!isLoading && toPick > 0) {
    setShowPickModal(true);
  }
}, [isLoading, toPick]);
  const toPack = stats?.toPack ?? 0;
  const toShip = stats?.toShip ?? 0;
  const pendingQc = stats?.pendingQc ?? 0;
  const pendingLabels = stats?.pendingLabels ?? 0;
  const pendingStock = stats?.pendingStock ?? 0;
  const pendingReturns = stats?.pendingReturns ?? stats?.pendingSwaps ?? 0;

  // Build action items
  const actions: { id: string; priority: "urgent" | "today" | "normal"; label: string; sub: string; href: string; icon: React.ComponentType<any>; count?: number }[] = [];

  if (overdueCount > 0) {
    actions.push({
      id: "overdue",
      priority: "urgent",
      label: `${overdueCount} overdue shipment${overdueCount !== 1 ? "s" : ""}`,
      sub: "Ship immediately",
      href: "/shipping",
      icon: AlertCircle,
      count: overdueCount,
    });
  }

  if (nextShipDay.isToday && toShip > 0) {
    actions.push({
      id: "ship-today",
      priority: "today",
      label: `${toShip} order${toShip !== 1 ? "s" : ""} to ship today`,
      sub: `It's ${nextShipDay.dayName} — export labels and drop off at USPS`,
      href: "/shipping",
      icon: Truck,
      count: toShip,
    });
  }

  if (toPick > 0) {
    actions.push({
      id: "pick",
      priority: "today",
      label: `${toPick} order${toPick !== 1 ? "s" : ""} to pick`,
      sub: "Scan books and move to packing",
      href: "/picking",
      icon: Package,
      count: toPick,
    });
  }

  if (toPack > 0) {
    actions.push({
      id: "pack",
      priority: "today",
      label: `${toPack} order${toPack !== 1 ? "s" : ""} to pack`,
      sub: "Put books in mailers and mark as packed",
      href: "/packing",
      icon: BoxIcon,
      count: toPack,
    });
  }

  if (pendingReturns > 0) {
    actions.push({
      id: "returns",
      priority: "today",
      label: `${pendingReturns} return${pendingReturns !== 1 ? "s" : ""} open`,
      sub: "Scan returned books back into inventory",
      href: "/returns",
      icon: RotateCcw,
      count: pendingReturns,
    });
  }

  if (pendingQc > 0) {
    actions.push({
      id: "qc",
      priority: "normal",
      label: `${pendingQc} book${pendingQc !== 1 ? "s" : ""} awaiting QC`,
      sub: "Inspect received books before labeling",
      href: "/qc",
      icon: ClipboardCheck,
      count: pendingQc,
    });
  }

  if (pendingLabels > 0) {
    actions.push({
      id: "labels",
      priority: "normal",
      label: `${pendingLabels} label${pendingLabels !== 1 ? "s" : ""} to print`,
      sub: "Print labels before shelving",
      href: "/labels",
      icon: Tag,
      count: pendingLabels,
    });
  }

  if (pendingStock > 0) {
    actions.push({
      id: "stock",
      priority: "normal",
      label: `${pendingStock} book${pendingStock !== 1 ? "s" : ""} to shelve`,
      sub: "Confirm books are physically in bins",
      href: "/stock",
      icon: Layers,
      count: pendingStock,
    });
  }

  const urgentActions = actions.filter(a => a.priority === "urgent");
  const todayActions = actions.filter(a => a.priority === "today");
  const normalActions = actions.filter(a => a.priority === "normal");
  const allClear = actions.length === 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

{showPickModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div className="w-full max-w-md rounded-3xl bg-card border border-border shadow-2xl p-6">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: "oklch(0.92 0.04 155)" }}
      >
        <Package
          className="w-7 h-7"
          style={{ color: "oklch(0.42 0.11 155)" }}
        />
      </div>

      <h2 className="text-xl font-bold text-foreground">
        Orders ready to pick
      </h2>

      <p className="text-sm text-muted-foreground mt-2">
        You have {toPick} order{toPick !== 1 ? "s" : ""} waiting in the picking queue.
      </p>

      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={() => setShowPickModal(false)}
          className="flex-1 py-2.5 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
        >
          Later
        </button>

        <button
          type="button"
          onClick={() => navigate("/picking")}
          className="flex-1 py-2.5 rounded-2xl text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
        >
          Go Pick Orders
        </button>
      </div>
    </div>
  </div>
)}

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Good morning, MamaBird 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
          {isLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        <Link href="/picking">
          <div className="stat-card group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="section-label">Pick</span>
              <Package className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : toPick}</p>
            <p className="text-xs text-muted-foreground">orders to pick</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Picking Queue <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/packing">
          <div className="stat-card group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="section-label">Pack</span>
              <BoxIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : toPack}</p>
            <p className="text-xs text-muted-foreground">orders to pack</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Packing Queue <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/shipping">
          <div className={cn("stat-card group cursor-pointer", overdueCount > 0 && "border-red-200")}
            style={overdueCount > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.63 0.22 25)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Ship</span>
              <Truck className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : toShip}</p>
            <p className="text-xs text-muted-foreground">
              {overdueCount > 0
                ? <span style={{ color: "oklch(0.55 0.22 25)" }} className="font-medium">{overdueCount} overdue</span>
                : "orders ready"}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Shipping Queue <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/inventory">
          <div className="stat-card group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="section-label">Inventory</span>
              <Archive className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : (stats?.inventory?.in_house ?? 0)}</p>
            <p className="text-xs text-muted-foreground">
  copies in house
</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              View Bins <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/members">
          <div className="stat-card group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="section-label">Members</span>
              <Users className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : (stats?.activeMembers ?? 0)}</p>
            <p className="text-xs text-muted-foreground">
  active subscribers
</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              View Members <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>
      </div>

      {/* â”€â”€ INTAKE FLOW â”€â”€ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "QC", count: pendingQc, sub: "received books", href: "/qc", icon: ClipboardCheck },
          { label: "Labels", count: pendingLabels, sub: "ready to print", href: "/labels", icon: Tag },
          { label: "Stock", count: pendingStock, sub: "ready to shelve", href: "/stock", icon: Layers },
          { label: "Returns", count: pendingReturns, sub: "open requests", href: "/returns", icon: RotateCcw },
        ].map((item) => (
          <Link key={item.label} href={item.href}>
            <div className="bg-card rounded-xl border border-border p-4 hover:bg-muted/20 transition-colors cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="section-label">{item.label}</span>
                <item.icon className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">
                {isLoading ? "â€”" : item.count}
              </p>
              <p className="text-xs text-muted-foreground">{item.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div>
        <h2 className="section-label mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Receive Books", icon: BookOpen, href: "/receive" },
            { label: "Start Picking", icon: Package, href: "/picking" },
            { label: "Start Shipping", icon: Truck, href: "/shipping" },
            { label: "Process Returns", icon: RotateCcw, href: "/returns" },
          ].map(action => (
            <Link key={action.label} href={action.href}>
              <div className="action-card items-center text-center">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
                  style={{ backgroundColor: "oklch(0.92 0.04 155)" }}>
                  <action.icon className="w-5 h-5" style={{ color: "oklch(0.42 0.11 155)" }} />
                </div>
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── INVENTORY ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Inventory by Age Group</h2>
            <Link href="/inventory">
              <span className="text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>Full View →</span>
            </Link>
          </div>
          <div className="p-5 space-y-3">
            {isLoading ? (
              <div className="space-y-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-28 h-3 bg-muted rounded animate-pulse" />
                    <div className="flex-1 h-2 bg-muted rounded animate-pulse" />
                    <div className="w-8 h-3 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : stats?.inventory?.by_age && Object.keys(stats.inventory.by_age).length > 0 ? (
              Object.entries(stats.inventory.by_age)
                .sort(([, a], [, b]) => b - a)
                .map(([age, count]) => {
                  const max = Math.max(...Object.values(stats.inventory.by_age));
                  const pct = max > 0 ? (count / max) * 100 : 0;
                  return (
                    <div key={age} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-28 shrink-0 capitalize">{age}</span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div className="h-2 rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: "oklch(0.42 0.11 155)" }} />
                      </div>
                      <span className="text-xs font-medium text-foreground w-8 text-right">{count}</span>
                    </div>
                  );
                })
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No inventory data yet</p>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground">Inventory Snapshot</h2>
          </div>
          <div className="p-5">
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 mb-4">
  <div className="text-center p-3 rounded-lg bg-muted/50">
    <p className="text-xl font-bold text-foreground">{stats?.inventory?.in_house ?? 0}</p>
    <p className="text-xs text-muted-foreground mt-0.5">In House</p>
  </div>

  <div className="text-center p-3 rounded-lg bg-muted/50">
    <p className="text-xl font-bold text-foreground">{stats?.inventory?.in_transit ?? 0}</p>
    <p className="text-xs text-muted-foreground mt-0.5">In Transit</p>
  </div>

  <div className="text-center p-3 rounded-lg bg-muted/50">
    <p className="text-xl font-bold text-foreground">{stats?.inventory?.returned ?? 0}</p>
    <p className="text-xs text-muted-foreground mt-0.5">Returned</p>
  </div>
</div>

<div className="flex items-center gap-2 text-sm text-green-700">
  <CheckCircle2 className="w-4 h-4 text-green-500" />
  Inventory counts are up to date!
</div>
</>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
