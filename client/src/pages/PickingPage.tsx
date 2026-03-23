// BookNest Ops — Picking Queue
import { Link } from "wouter";
import { Package, ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { orders } from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const pickingOrders = orders.filter(o => o.status === "Picking" || o.status === "Overdue");

export default function PickingPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Picking Queue</h1>
        <p className="page-subtitle">{pickingOrders.length} bundle{pickingOrders.length !== 1 ? "s" : ""} waiting to be picked</p>
      </div>

      {pickingOrders.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: "oklch(0.62 0.16 155)" }} />
          <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">No bundles in the picking queue right now.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Order #</th>
                <th>Member</th>
                <th>Tier</th>
                <th>Books</th>
                <th>Ship By</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pickingOrders.map(order => (
                <tr key={order.id}>
                  <td className="font-mono text-xs text-muted-foreground">{order.orderNumber}</td>
                  <td className="font-medium">{order.memberName}</td>
                  <td>
                    {order.tier ? (
                      <span className="badge-tier">{order.tier}</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-1.5 w-16">
                        <div
                          className="h-1.5 rounded-full"
                          style={{
                            width: `${(order.booksPicked / order.booksTotal) * 100}%`,
                            backgroundColor: "oklch(0.42 0.11 155)"
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{order.booksPicked}/{order.booksTotal}</span>
                    </div>
                  </td>
                  <td className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      {order.shipByDate}
                    </div>
                  </td>
                  <td>
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                      order.status === "Overdue" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                    )}>
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => toast.success(`Started picking for ${order.memberName}`)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      style={{ backgroundColor: "oklch(0.92 0.04 155)", color: "oklch(0.32 0.10 155)" }}
                    >
                      Pick <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bin Locations Guide */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="font-semibold text-sm text-foreground mb-3">Picking Route (sorted by bin location)</h2>
        <p className="text-sm text-muted-foreground">Books are sorted by bin location so you can walk through the warehouse in a single efficient pass.</p>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {["HATC", "FLED", "SOAR", "SKY"].map(prefix => (
            <div key={prefix} className="rounded-lg border border-border p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{prefix}</p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {prefix === "HATC" ? "Hatchlings" : prefix === "FLED" ? "Fledglings" : prefix === "SOAR" ? "Soarers" : "Sky Readers"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
