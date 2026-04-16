// BookNest Ops — Shipping Queue (wired to real Supabase data)
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Truck, AlertTriangle, Clock, RefreshCw, CheckCircle2, Tag, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  little_nest: "Little Nest",
  cozy_nest: "Cozy Nest",
  story_nest: "Story Nest",
};

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

export default function ShippingPage() {
  const { data: packedData, isLoading: loadingShipping, refetch, isRefetching } =
  trpc.shipments.list.useQuery({ status: "packed" }, { refetchInterval: 60_000 });
  const { data: pendingSwapsData, isLoading: loadingSwaps, refetch: refetchSwaps } =
    trpc.shipping.pendingSwaps.useQuery(undefined, { refetchInterval: 60_000 });

  const generateLabel = trpc.shipping.generateLabel.useMutation({
    onSuccess: (result) => {
      if (result.success && result.label_url) {
        toast.success("Return label generated!", {
          action: {
            label: "Open Label",
            onClick: () => window.open(result.label_url!, "_blank"),
          },
        });
      } else if (!result.success) {
        toast.error(`Label generation failed: ${result.error}`);
      }
      refetchSwaps();
    },
    onError: () => {
      toast.error("Failed to generate label. Check EasyPost configuration.");
    },
  });

  const generateAllLabels = trpc.shipping.generateAllLabels.useMutation({
    onSuccess: (result) => {
      toast.success(`Generated ${result.processed} label${result.processed !== 1 ? "s" : ""}${result.failed > 0 ? `, ${result.failed} failed` : ""}`);
      refetchSwaps();
    },
    onError: () => {
      toast.error("Batch label generation failed.");
    },
  });

  const isLoading = loadingShipping;
  const allOrders = packedData?.data ?? [];
  const overdueCount = allOrders.filter((o) => isOverdue(o.scheduled_ship_date)).length;
  const pendingSwaps = pendingSwapsData?.pending ?? [];

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
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* ── Pending Swap Returns ──────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-muted-foreground" />
              Pending Return Labels
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loadingSwaps ? "Loading..." : `${pendingSwaps.length} swap${pendingSwaps.length !== 1 ? "s" : ""} awaiting return label`}
            </p>
          </div>
          {pendingSwaps.length > 0 && (
            <button
              onClick={() => generateAllLabels.mutate()}
              disabled={generateAllLabels.isPending}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              <Tag className="w-4 h-4" />
              {generateAllLabels.isPending ? "Generating..." : "Generate All Labels"}
            </button>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loadingSwaps ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading pending swaps...</p>
            </div>
          ) : pendingSwaps.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">No pending return labels</p>
              <p className="text-xs text-muted-foreground mt-1">All swap requests have labels generated.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 px-5 py-3 bg-muted/30">
                <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</span>
                <span className="col-span-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Address</span>
                <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Requested</span>
                <span className="col-span-2"></span>
              </div>
              <div className="divide-y divide-border/50">
                {pendingSwaps.map((swap) => (
                  <div key={swap.return_id} className="grid grid-cols-12 px-5 py-3.5 items-center">
                    <div className="col-span-3">
                      <p className="text-sm font-medium text-foreground">{swap.member_name}</p>
                      <p className="text-xs text-muted-foreground">{swap.member_email}</p>
                    </div>
                    <div className="col-span-4">
                      {swap.address ? (
                        <div className="text-xs text-muted-foreground leading-relaxed">
                          <p>{swap.address.street}{swap.address.street2 ? `, ${swap.address.street2}` : ""}</p>
                          <p>{swap.address.city}, {swap.address.state} {swap.address.zip}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-red-500 font-medium">No address on file</span>
                      )}
                    </div>
                    <div className="col-span-3">
                      <span className="text-xs text-muted-foreground">
                        {new Date(swap.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>
                    <div className="col-span-2 flex justify-end">
                      {swap.address ? (
                        <button
                          onClick={() => generateLabel.mutate({
                            return_id: swap.return_id,
                            member_name: swap.member_name,
                            street: swap.address!.street,
                            street2: swap.address!.street2 ?? undefined,
                            city: swap.address!.city,
                            state: swap.address!.state,
                            zip: swap.address!.zip,
                          })}
                          disabled={generateLabel.isPending}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                        >
                          <Tag className="w-3 h-3" />
                          {generateLabel.isPending ? "..." : "Generate"}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No address</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Outbound Shipping Queue ───────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
              <Truck className="w-5 h-5 text-muted-foreground" />
              Outbound Shipping Queue
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading..." : `${allOrders.length} order${allOrders.length !== 1 ? "s" : ""} ready to ship`}
              {overdueCount > 0 && (
                <span className="ml-2 text-red-600 font-medium">· {overdueCount} overdue</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={() => toast.info("Fetching rates for all orders...")}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              <Truck className="w-4 h-4" />
              Get All Rates
            </button>
          </div>
        </div>

        {overdueCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
            style={{ backgroundColor: "oklch(0.97 0.03 25)", borderColor: "oklch(0.88 0.08 25)" }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "oklch(0.55 0.22 25)" }} />
            <p className="text-sm font-medium" style={{ color: "oklch(0.40 0.18 25)" }}>
              {overdueCount} order{overdueCount !== 1 ? "s are" : " is"} overdue — ship as soon as possible.
            </p>
          </div>
        )}

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading shipping queue...</p>
            </div>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-foreground">All caught up!</p>
              <p className="text-xs text-muted-foreground mt-1">No orders in the shipping queue right now.</p>
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
                          overdue ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"
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
                            Ship
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
    </div>
  );
}