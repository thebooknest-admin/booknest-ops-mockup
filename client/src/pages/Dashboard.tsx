// BookNest Ops — Dashboard (Command Center)
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Package, Truck, Archive, Users,
  AlertTriangle, AlertCircle, ArrowRight, BookOpen, RotateCcw,
  RefreshCw, BoxIcon, ClipboardList, Gift, ArrowRightLeft,
  CheckCircle2, Tag, Layers, CalendarCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getNextShipDay(): { isToday: boolean; label: string } {
  const today = new Date();
  const dow = today.getDay();
  if (dow === 2) return { isToday: true, label: "Tuesday" };
  if (dow === 5) return { isToday: true, label: "Friday" };
  const daysUntilTue = (2 - dow + 7) % 7;
  const daysUntilFri = (5 - dow + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + Math.min(daysUntilTue, daysUntilFri));
  return {
    isToday: false,
    label: next.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
  };
}

export default function Dashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = trpc.dashboard.stats.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric"
  });

  const nextShipDay = getNextShipDay();
  const overdueCount = stats?.overdueShipments ?? 0;
  const lowBinCount = stats?.inventory?.low_bins?.length ?? 0;
  const pendingSwaps = stats?.pendingSwaps ?? 0;
  const toPick = stats?.toPick ?? 0;
  const toPack = stats?.toPack ?? 0;
  const toShip = stats?.toShip ?? 0;
  const labelCount = 0; // TODO: pull from labels.pending count
  const stockCount = 0; // TODO: pull from stock.count

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

  if (pendingSwaps > 0) {
    actions.push({
      id: "swaps",
      priority: "urgent",
      label: `${pendingSwaps} swap${pendingSwaps !== 1 ? "s" : ""} requested`,
      sub: "Members ready to send books back — prep next bundle",
      href: "/members",
      icon: ArrowRightLeft,
      count: pendingSwaps,
    });
  }

  if (nextShipDay.isToday && toShip > 0) {
    actions.push({
      id: "ship-today",
      priority: "today",
      label: `${toShip} order${toShip !== 1 ? "s" : ""} to ship today`,
      sub: `It's ${nextShipDay.label} — export labels and drop off at USPS`,
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

  if (lowBinCount > 0) {
    actions.push({
      id: "inventory",
      priority: "normal",
      label: `${lowBinCount} bin${lowBinCount !== 1 ? "s" : ""} running low`,
      sub: "Restock before next ship day",
      href: "/inventory",
      icon: AlertTriangle,
      count: lowBinCount,
    });
  }

  const urgentActions = actions.filter(a => a.priority === "urgent");
  const todayActions = actions.filter(a => a.priority === "today");
  const normalActions = actions.filter(a => a.priority === "normal");
  const allClear = actions.length === 0;

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

      {/* ── TODAY'S ACTIONS ── */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between"
          style={{ backgroundColor: nextShipDay.isToday ? "oklch(0.96 0.04 155)" : undefined }}>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            <h2 className="font-semibold text-sm text-foreground">
              Today's Actions
              {nextShipDay.isToday && (
                <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "oklch(0.42 0.11 155)", color: "white" }}>
                  🚚 Ship Day
                </span>
              )}
            </h2>
          </div>
          {!nextShipDay.isToday && (
            <span className="text-xs text-muted-foreground">
              Next ship day: <span className="font-medium text-foreground">{nextShipDay.label}</span>
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-12 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : allClear ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">All caught up!</p>
            <p className="text-xs text-muted-foreground mt-1">No urgent actions right now. Enjoy the quiet. 🐣</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {/* Urgent */}
            {urgentActions.map(action => (
              <Link key={action.id} href={action.href}>
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-red-50/30 transition-colors cursor-pointer"
                  style={{ borderLeft: "3px solid oklch(0.63 0.22 25)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "oklch(0.97 0.03 25)" }}>
                    <action.icon className="w-4 h-4" style={{ color: "oklch(0.55 0.22 25)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.sub}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}

            {/* Today */}
            {todayActions.map(action => (
              <Link key={action.id} href={action.href}>
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-muted/20 transition-colors cursor-pointer"
                  style={{ borderLeft: "3px solid oklch(0.42 0.11 155)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "oklch(0.95 0.03 155)" }}>
                    <action.icon className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.sub}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}

            {/* Normal */}
            {normalActions.map(action => (
              <Link key={action.id} href={action.href}>
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-muted/20 transition-colors cursor-pointer"
                  style={{ borderLeft: "3px solid oklch(0.76 0.16 70)" }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "oklch(0.97 0.05 75)" }}>
                    <action.icon className="w-4 h-4" style={{ color: "oklch(0.55 0.14 75)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{action.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{action.sub}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── STAT CARDS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
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

        <Link href="/members">
          <div className={cn("stat-card group cursor-pointer", pendingSwaps > 0 && "border-amber-200")}
            style={pendingSwaps > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.76 0.16 70)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Swaps</span>
              <ArrowRightLeft className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : pendingSwaps}</p>
            <p className="text-xs text-muted-foreground">
              {pendingSwaps > 0
                ? <span style={{ color: "oklch(0.55 0.14 75)" }} className="font-medium">needs attention</span>
                : "pending swaps"}
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              View Members <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/inventory">
          <div className={cn("stat-card group cursor-pointer", lowBinCount > 0 && "border-amber-200")}
            style={lowBinCount > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.76 0.16 70)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Inventory</span>
              <Archive className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : (stats?.inventory?.in_house ?? 0)}</p>
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
            <p className="text-3xl font-bold text-foreground mt-1">{isLoading ? "—" : (stats?.activeMembers ?? 0)}</p>
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
            { label: "Log Donation", icon: Gift, href: "/donations/intake" },
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