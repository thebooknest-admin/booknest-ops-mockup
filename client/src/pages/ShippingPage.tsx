// BookNest Ops — Shipping Queue
import { Link } from "wouter";
import { Truck, AlertCircle, Clock, ArrowRight, CheckCircle2 } from "lucide-react";
import { orders } from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ShippingPage() {
  const shippingOrders = [...orders].sort((a, b) => {
    if (a.status === "Overdue" && b.status !== "Overdue") return -1;
    if (b.status === "Overdue" && a.status !== "Overdue") return 1;
    return 0;
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Shipping Queue</h1>
          <p className="page-subtitle">{shippingOrders.length} orders ready to ship</p>
        </div>
        <button
          onClick={() => toast.info("Fetching rates for all orders...")}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
        >
          <Truck className="w-4 h-4" />
          Get All Rates
        </button>
      </div>

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
            {shippingOrders.map(order => (
              <tr key={order.id} className={cn(order.status === "Overdue" && "bg-red-50/30")}>
                <td className="font-mono text-xs text-muted-foreground">{order.orderNumber}</td>
                <td>
                  <div>
                    <p className="font-medium text-sm">{order.memberName}</p>
                    <p className="text-xs text-muted-foreground">{order.memberEmail}</p>
                  </div>
                </td>
                <td>
                  {order.tier ? (
                    <span className="badge-tier">{order.tier}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </td>
                <td>
                  <span className="text-sm">{order.booksPicked}/{order.booksTotal}</span>
                </td>
                <td>
                  <div className={cn(
                    "flex items-center gap-1.5 text-sm",
                    order.status === "Overdue" && "font-semibold"
                  )} style={order.status === "Overdue" ? { color: "oklch(0.55 0.22 25)" } : {}}>
                    {order.status === "Overdue" && <AlertCircle className="w-3.5 h-3.5" />}
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
                  <Link href={`/ship/${order.id}`}>
                    <button className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                      style={{ backgroundColor: "oklch(0.92 0.04 155)", color: "oklch(0.32 0.10 155)" }}>
                      Ship <ArrowRight className="w-3 h-3" />
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
