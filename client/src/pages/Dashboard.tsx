// BookNest Ops — Dashboard (Command Center)
// Design: Warm Linen Artisan Light — action-first layout, proactive alerts

import { Link } from "wouter";
import { toast } from "sonner";
import {
  Package, Truck, CheckCircle2, Archive, Users, Gift,
  AlertTriangle, AlertCircle, ArrowRight, BookOpen, RotateCcw,
  TrendingUp, Clock
} from "lucide-react";
import { dashboardStats, notifications, bins, orders } from "@/lib/data";
import { cn } from "@/lib/utils";

const lowBins = bins.filter(b => b.count > 0 && b.count <= 5).slice(0, 4);
const emptyBins = bins.filter(b => b.count === 0);
const overdueOrders = orders.filter(o => o.status === "Overdue");

export default function Dashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Good morning, MamaBird 👋</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          System Online
        </div>
      </div>

      {/* ── URGENT ALERT BANNER ── */}
      {(overdueOrders.length > 0 || emptyBins.length > 0) && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.88 0.08 25)" }}>
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "oklch(0.55 0.22 25)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "oklch(0.40 0.18 25)" }}>
              Action Required
            </p>
            <div className="mt-1 space-y-1">
              {overdueOrders.length > 0 && (
                <p className="text-sm" style={{ color: "oklch(0.50 0.18 25)" }}>
                  {overdueOrders.length} order{overdueOrders.length > 1 ? "s are" : " is"} overdue for shipping — ship immediately.
                </p>
              )}
              {emptyBins.length > 0 && (
                <p className="text-sm" style={{ color: "oklch(0.50 0.18 25)" }}>
                  {emptyBins.length} inventory bin{emptyBins.length > 1 ? "s are" : " is"} completely empty.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            {overdueOrders.length > 0 && (
              <Link href="/shipping">
                <button className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: "oklch(0.55 0.22 25)", color: "white" }}>
                  Ship Now →
                </button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── WARNING BANNER (low inventory) ── */}
      {dashboardStats.lowBins > 0 && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ backgroundColor: "oklch(0.97 0.05 75)", borderColor: "oklch(0.88 0.08 75)" }}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "oklch(0.45 0.14 75)" }}>
              {dashboardStats.lowBins} bins are running low
            </p>
            <p className="text-sm mt-0.5" style={{ color: "oklch(0.55 0.12 75)" }}>
              {lowBins.map(b => b.bin).join(", ")}{lowBins.length < dashboardStats.lowBins ? ` +${dashboardStats.lowBins - lowBins.length} more` : ""}
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
            <p className="text-3xl font-bold text-foreground mt-1">{dashboardStats.pickingQueue}</p>
            <p className="text-xs text-muted-foreground">bundles to pick</p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Start Picking <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/shipping">
          <div className={cn("stat-card group cursor-pointer", dashboardStats.overdueOrders > 0 && "border-red-200")} style={dashboardStats.overdueOrders > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.63 0.22 25)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Ship</span>
              <Truck className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{dashboardStats.shippingQueue}</p>
            <p className="text-xs text-muted-foreground">
              {dashboardStats.overdueOrders > 0
                ? <span style={{ color: "oklch(0.55 0.22 25)" }} className="font-medium">{dashboardStats.overdueOrders} overdue</span>
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
          <p className="text-3xl font-bold text-foreground mt-1">{dashboardStats.completedToday}</p>
          <p className="text-xs text-muted-foreground">orders shipped</p>
        </div>

        <Link href="/inventory">
          <div className={cn("stat-card group cursor-pointer", dashboardStats.emptyBins > 0 && "border-amber-200")} style={dashboardStats.emptyBins > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.76 0.16 70)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Inventory</span>
              <Archive className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{dashboardStats.totalInventory}</p>
            <p className="text-xs text-muted-foreground">
              <span style={{ color: "oklch(0.55 0.14 75)" }} className="font-medium">{dashboardStats.lowBins} low</span>
              {dashboardStats.emptyBins > 0 && <span style={{ color: "oklch(0.55 0.22 25)" }} className="font-medium"> · {dashboardStats.emptyBins} empty</span>}
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
            <p className="text-3xl font-bold text-foreground mt-1">{dashboardStats.activeMembers}</p>
            <p className="text-xs text-muted-foreground">
              <span style={{ color: "oklch(0.52 0.12 75)" }} className="font-medium">{dashboardStats.waitlistMembers} on waitlist</span>
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              View Members <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>

        <Link href="/donations/intake">
          <div className={cn("stat-card group cursor-pointer", dashboardStats.donationsPending > 0 && "border-blue-200")} style={dashboardStats.donationsPending > 0 ? { borderTopWidth: 3, borderTopColor: "oklch(0.55 0.18 250)" } : {}}>
            <div className="flex items-center justify-between">
              <span className="section-label">Donations</span>
              <Gift className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="text-3xl font-bold text-foreground mt-1">{dashboardStats.donationsPending}</p>
            <p className="text-xs text-muted-foreground">
              <span style={{ color: "oklch(0.45 0.18 250)" }} className="font-medium">pending intake</span>
            </p>
            <div className="flex items-center gap-1 mt-2 text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              Process Now <ArrowRight className="w-3 h-3" />
            </div>
          </div>
        </Link>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div>
        <h2 className="section-label mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: "Receive Books", icon: BookOpen, href: "/receive", color: "oklch(0.42 0.11 155)" },
            { label: "Start Picking", icon: Package, href: "/picking", color: "oklch(0.42 0.11 155)" },
            { label: "Start Shipping", icon: Truck, href: "/shipping", color: "oklch(0.42 0.11 155)" },
            { label: "Process Returns", icon: RotateCcw, href: "/returns", color: "oklch(0.42 0.11 155)" },
            { label: "Log Donation", icon: Gift, href: "/donations/intake", color: "oklch(0.42 0.11 155)" },
          ].map(action => (
            <Link key={action.label} href={action.href}>
              <div className="action-card items-center text-center">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2"
                  style={{ backgroundColor: "oklch(0.92 0.04 155)" }}>
                  <action.icon className="w-5 h-5" style={{ color: action.color }} />
                </div>
                <span className="text-sm font-medium text-foreground">{action.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── BOTTOM ROW: Recent Alerts + Today's Orders ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Notifications */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Recent Alerts</h2>
            <span className="text-xs text-muted-foreground">{notifications.filter(n => !n.read).length} unread</span>
          </div>
          <div className="divide-y divide-border/50">
            {notifications.slice(0, 5).map(n => (
              <div key={n.id} className={cn("px-5 py-3 flex items-start gap-3", !n.read && "bg-muted/30")}>
                <div className={cn(
                  "w-2 h-2 rounded-full mt-1.5 shrink-0",
                  n.type === "urgent" && "bg-red-500",
                  n.type === "warning" && "bg-amber-500",
                  n.type === "info" && "bg-blue-500",
                  n.type === "success" && "bg-green-500",
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                </div>
                <span className="text-xs text-muted-foreground/60 shrink-0">{n.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Today's Orders */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Active Orders</h2>
            <Link href="/shipping">
              <span className="text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>View All →</span>
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {orders.map(order => (
              <div key={order.id} className="px-5 py-3 flex items-center gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  order.status === "Overdue" ? "bg-red-500" : "bg-amber-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{order.memberName}</p>
                  <p className="text-xs text-muted-foreground">{order.orderNumber} · {order.tier || "No Tier"}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                    order.status === "Overdue"
                      ? "bg-red-50 text-red-700"
                      : "bg-amber-50 text-amber-700"
                  )}>
                    {order.status}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">Due {order.shipByDate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
