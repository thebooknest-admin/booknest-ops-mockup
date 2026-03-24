// BookNest Ops — Dashboard (Command Center)
// Wired to real Supabase data via tRPC

import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Package, Truck, CheckCircle2, Archive, Users, Gift,
  AlertTriangle, AlertCircle, ArrowRight, BookOpen, RotateCcw,
  RefreshCw, Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = trpc.dashboard.stats.useQuery(undefined, {
    refetchInterval: 60_000, // auto-refresh every minute
  });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });

  const overdueCount = stats?.overdueShipments ?? 0;
  const lowBinCount = stats?.inventory?.low_bins?.length ?? 0;
  const hasUrgent = overdueCount > 0;
  const hasWarning = lowBinCount > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
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

      {/* ── URGENT ALERT BANNER ── */}
      {hasUrgent && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.88 0.08 25)" }}>
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "oklch(0.55 0.22 25)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "oklch(0.40 0.18 25)" }}>Action Required</p>
            <p className="text-sm mt-0.5" style={{ color: "oklch(0.50 0.18 25)" }}>
              {overdueCount} shipment{overdueCount !== 1 ? "s are" : " is"} overdue — ship immediately.
            </p>
          </div>
          <Link href="/shipping">
            <button className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
              style={{ backgroundColor: "oklch(0.55 0.22 25)", color: "white" }}>
              Ship Now →
            </button>
          </Link>
        </div>
      )}

      {/* ── WARNING BANNER (low inventory) ── */}
      {hasWarning && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ backgroundColor: "oklch(0.97 0.05 75)", borderColor: "oklch(0.88 0.08 75)" }}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "oklch(0.45 0.14 75)" }}>
              {lowBinCount} bin{lowBinCount !== 1 ? "s are" : " is"} running low
            </p>
            <p className="text-sm mt-0.5" style={{ color: "oklch(0.55 0.12 75)" }}>
              {stats!.inventory.low_bins.slice(0, 5).join(", ")}
              {lowBinCount > 5 ? ` +${lowBinCount - 5} more` : ""}
            </p>
          </div>
          <Link href="/inventory">
            <button className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
              style={{ backgroundColor: "oklch(0.55 0.14 75)", color: "white" }}>
              View Inventory →
            </button>
          </Link>
        </div>
      )}

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-3 xl:grid-cols-6 gap-4">
        <Link href="/picking">
          <div className="stat-card group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="section-label">Pick</span>
              <Package className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">
              {isLoading ? "—" : (stats?.toPick ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">bundles to pick</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Start Picking <ArrowRight className="w-3 h-3" />
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
            <p className="text-3xl font-bold text-foreground mt-1">
              {isLoading ? "—" : (stats?.toShip ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {overdueCount > 0
                ? <span style={{ color: "oklch(0.55 0.22 25)" }} className="font-medium">{overdueCount} overdue</span>
                : "orders ready"}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Ship Now <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="section-label">Done Today</span>
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold text-foreground mt-1">
            {isLoading ? "—" : (stats?.shippedToday ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">orders shipped</p>
        </div>

        <Link href="/inventory">
          <div className={cn("stat-card group cursor-pointer", lowBinCount > 0 && "border-amber-200")}
            style={lowBinCount > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.76 0.16 70)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Inventory</span>
              <Archive className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">
              {isLoading ? "—" : (stats?.inventory?.in_house ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {lowBinCount > 0
                ? <span style={{ color: "oklch(0.55 0.14 75)" }} className="font-medium">{lowBinCount} low bins</span>
                : "copies in house"}
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
            <p className="text-3xl font-bold text-foreground mt-1">
              {isLoading ? "—" : (stats?.activeMembers ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {(stats?.waitlistMembers ?? 0) > 0
                ? <span style={{ color: "oklch(0.52 0.12 75)" }} className="font-medium">{stats!.waitlistMembers} on waitlist</span>
                : "active subscribers"}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              View Members <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/donation-intake">
          <div className="stat-card group cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="section-label">In Transit</span>
              <Clock className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">
              {isLoading ? "—" : (stats?.inventory?.in_transit ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">books with members</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Log Donation <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>
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
            { label: "Log Donation", icon: Gift, href: "/donation-intake" },
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

      {/* ── INVENTORY BY AGE GROUP ── */}
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

        {/* Low Bins Panel */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-sm text-foreground">Bin Status</h2>
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
                {lowBinCount > 0 ? (
                  <div>
                    <p className="text-xs font-medium mb-2 flex items-center gap-1.5"
                      style={{ color: "oklch(0.55 0.14 75)" }}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Low Bins — needs restocking
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {stats!.inventory.low_bins.slice(0, 10).map(bin => (
                        <span key={bin} className="text-xs px-2 py-0.5 rounded-full border"
                          style={{ backgroundColor: "oklch(0.97 0.05 75)", borderColor: "oklch(0.88 0.08 75)", color: "oklch(0.45 0.14 75)" }}>
                          {bin}
                        </span>
                      ))}
                      {lowBinCount > 10 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          +{lowBinCount - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-green-700">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    All bins are well stocked
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
