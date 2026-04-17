// BookNest Ops — Shipping Queue (Pirateship CSV export workflow)
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Truck, AlertTriangle, Clock, RefreshCw, CheckCircle2,
  Tag, ArrowRightLeft, CalendarDays, PackageCheck,
  Download, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  "little-nest": "Little Nest",
  "cozy-nest": "Cozy Nest",
  "story-nest": "Story Nest",
  little_nest: "Little Nest",
  cozy_nest: "Cozy Nest",
  story_nest: "Story Nest",
};

const BOOK_NEST = {
  name: "The Book Nest",
  street: "205 Ambrose Drive",
  street2: "#8",
  city: "Ranson",
  state: "WV",
  zip: "25438",
};

function isOverdue(date: string | null): boolean {
  if (!date) return false;
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d < new Date();
}

function isDueToday(date: string | null): boolean {
  if (!date) return false;
  return date === new Date().toISOString().split("T")[0];
}

function getNextShipDay(): { label: string; isToday: boolean } {
  const today = new Date();
  const dow = today.getDay();
  if (dow === 2) return { label: "Today (Tuesday)", isToday: true };
  if (dow === 5) return { label: "Today (Friday)", isToday: true };
  const daysUntilTue = (2 - dow + 7) % 7;
  const daysUntilFri = (5 - dow + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + Math.min(daysUntilTue, daysUntilFri));
  return {
    label: next.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
    isToday: false,
  };
}

function escapeCSV(val: string | null | undefined): string {
  const str = val ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ShippingPage() {
  const { data: packedData, isLoading, refetch, isRefetching } =
    trpc.shipments.list.useQuery({ status: "packed" }, { refetchInterval: 60_000 });
  const { data: exportData } =
    trpc.shipping.exportOrders.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: pendingSwapsData, isLoading: loadingSwaps, refetch: refetchSwaps } =
    trpc.shipping.pendingSwaps.useQuery(undefined, { refetchInterval: 60_000 });

  const generateReturnLabel = trpc.shipping.generateLabel.useMutation({
    onSuccess: (result) => {
      if (result.success && result.label_url) {
        toast.success("Return label generated!", {
          action: { label: "Open Label", onClick: () => window.open(result.label_url!, "_blank") },
        });
      } else if (!result.success) {
        toast.error(`Label failed: ${result.error}`);
      }
      refetchSwaps();
    },
    onError: () => toast.error("Failed to generate label."),
  });

  const generateAllReturnLabels = trpc.shipping.generateAllLabels.useMutation({
    onSuccess: (result) => {
      toast.success(`Generated ${result.processed} label${result.processed !== 1 ? "s" : ""}${result.failed > 0 ? `, ${result.failed} failed` : ""}`);
      refetchSwaps();
    },
    onError: () => toast.error("Batch label generation failed."),
  });

  // ── CSV export handlers ───────────────────────────────────────────────────

  function handleExportOutbound() {
    const orders = exportData?.orders ?? [];
    if (!orders.length) {
      toast.info("No orders to export for the next ship day.");
      return;
    }
    const shipDate = exportData?.ship_date ?? "unknown";
    const rows = [
      ["Order Number", "Name", "Street", "Street2", "City", "State", "Zip", "Weight (oz)", "Length", "Width", "Height"],
      ...orders.map((o) => [
        o.order_number,
        o.member_name,
        o.street,
        o.street2 ?? "",
        o.city,
        o.state,
        o.zip,
        String(o.weight_oz),
        "14",
        "11",
        "3",
      ]),
    ];
    downloadCSV(`booknest-outbound-${shipDate}.csv`, rows);
    toast.success(`Exported ${orders.length} outbound label${orders.length !== 1 ? "s" : ""}`);
  }

  function handleExportReturn() {
    const orders = exportData?.orders ?? [];
    if (!orders.length) {
      toast.info("No orders to export for the next ship day.");
      return;
    }
    const shipDate = exportData?.ship_date ?? "unknown";
    // Return labels: FROM = member, TO = Book Nest
    const rows = [
      ["Order Number", "Name", "Street", "Street2", "City", "State", "Zip", "Weight (oz)", "Length", "Width", "Height"],
      ...orders.map((o) => [
        `${o.order_number}-RET`,
        BOOK_NEST.name,
        BOOK_NEST.street,
        BOOK_NEST.street2,
        BOOK_NEST.city,
        BOOK_NEST.state,
        BOOK_NEST.zip,
        "32", // standard return weight
        "13",
        "11",
        "4",
      ]),
    ];
    downloadCSV(`booknest-return-${shipDate}.csv`, rows);
    toast.success(`Exported ${orders.length} return label${orders.length !== 1 ? "s" : ""}`);
  }

  const allOrders = packedData?.data ?? [];
  const overdueCount = allOrders.filter((o) => isOverdue(o.scheduled_ship_date)).length;
  const dueTodayCount = allOrders.filter((o) => isDueToday(o.scheduled_ship_date)).length;
  const upcomingCount = allOrders.filter((o) => !isOverdue(o.scheduled_ship_date) && !isDueToday(o.scheduled_ship_date)).length;
  const pendingSwaps = pendingSwapsData?.pending ?? [];
  const nextShipDay = getNextShipDay();
  const exportOrders = exportData?.orders ?? [];
  const missingAddresses = exportData?.missing ?? [];

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

      {/* ── Pending Swap Return Labels ────────────────────────────────── */}
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
              onClick={() => generateAllReturnLabels.mutate()}
              disabled={generateAllReturnLabels.isPending}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              <Tag className="w-4 h-4" />
              {generateAllReturnLabels.isPending ? "Generating..." : "Generate All Labels"}
            </button>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loadingSwaps ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading...</p>
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
                          onClick={() => generateReturnLabel.mutate({
                            return_id: swap.return_id,
                            member_name: swap.member_name,
                            street: swap.address!.street,
                            street2: swap.address!.street2 ?? undefined,
                            city: swap.address!.city,
                            state: swap.address!.state,
                            zip: swap.address!.zip,
                          })}
                          disabled={generateReturnLabel.isPending}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                        >
                          <Tag className="w-3 h-3" />
                          {generateReturnLabel.isPending ? "..." : "Generate"}
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
              {isLoading ? "Loading..." : `${allOrders.length} order${allOrders.length !== 1 ? "s" : ""} packed and ready`}
              {overdueCount > 0 && <span className="ml-2 text-red-600 font-medium">· {overdueCount} overdue</span>}
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
            {exportOrders.length > 0 && (
              <>
                <button
                  onClick={handleExportOutbound}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export Outbound ({exportOrders.length})
                </button>
                <button
                  onClick={handleExportReturn}
                  className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
                  style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                >
                  <Download className="w-4 h-4" />
                  Export Return ({exportOrders.length})
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Missing address warning ─────────────────────────────────── */}
        {missingAddresses.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border"
            style={{ backgroundColor: "oklch(0.97 0.03 25)", borderColor: "oklch(0.88 0.08 25)" }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "oklch(0.55 0.22 25)" }} />
            <div>
              <p className="text-sm font-medium" style={{ color: "oklch(0.40 0.18 25)" }}>
                {missingAddresses.length} order{missingAddresses.length !== 1 ? "s are" : " is"} missing an address and won't be exported:
              </p>
              <p className="text-xs mt-0.5" style={{ color: "oklch(0.50 0.15 25)" }}>
                {missingAddresses.map((m) => m.member_name).join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* ── Stat pills ─────────────────────────────────────────────── */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-3">
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{
                backgroundColor: nextShipDay.isToday ? "oklch(0.96 0.04 155)" : "oklch(0.98 0.01 80)",
                borderColor: nextShipDay.isToday ? "oklch(0.85 0.08 155)" : "oklch(0.91 0.006 80)",
              }}
            >
              <CalendarDays className="w-4 h-4 shrink-0" style={{ color: nextShipDay.isToday ? "oklch(0.42 0.11 155)" : "oklch(0.55 0.01 80)" }} />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Next Ship Day</p>
                <p className="text-sm font-semibold" style={{ color: nextShipDay.isToday ? "oklch(0.35 0.10 155)" : "oklch(0.25 0.01 80)" }}>
                  {nextShipDay.label}
                </p>
              </div>
            </div>

            <div
              className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{
                backgroundColor: dueTodayCount > 0 ? "oklch(0.97 0.04 75)" : "oklch(0.98 0.01 80)",
                borderColor: dueTodayCount > 0 ? "oklch(0.88 0.08 75)" : "oklch(0.91 0.006 80)",
              }}
            >
              <PackageCheck className="w-4 h-4 shrink-0" style={{ color: dueTodayCount > 0 ? "oklch(0.55 0.14 75)" : "oklch(0.65 0.01 80)" }} />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Due Today</p>
                <p className="text-sm font-semibold" style={{ color: dueTodayCount > 0 ? "oklch(0.40 0.12 75)" : "oklch(0.55 0.01 80)" }}>
                  {dueTodayCount} order{dueTodayCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ backgroundColor: "oklch(0.98 0.01 80)", borderColor: "oklch(0.91 0.006 80)" }}>
              <Clock className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Upcoming</p>
                <p className="text-sm font-semibold text-foreground">{upcomingCount} order{upcomingCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Overdue banner ─────────────────────────────────────────── */}
        {overdueCount > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
            style={{ backgroundColor: "oklch(0.97 0.03 25)", borderColor: "oklch(0.88 0.08 25)" }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "oklch(0.55 0.22 25)" }} />
            <p className="text-sm font-medium" style={{ color: "oklch(0.40 0.18 25)" }}>
              {overdueCount} order{overdueCount !== 1 ? "s are" : " is"} overdue — ship as soon as possible.
            </p>
          </div>
        )}

        {/* ── Order table ────────────────────────────────────────────── */}
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
                <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ship By</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
              </div>
              <div className="divide-y divide-border/50">
                {sorted.map((order) => {
                  const overdue = isOverdue(order.scheduled_ship_date);
                  const today = isDueToday(order.scheduled_ship_date);
                  const tierKey = ((order as any).member_tier ?? "").toLowerCase();
                  const tierLabel = TIER_LABELS[tierKey] ?? "—";

                  return (
                    <div
                      key={order.id}
                      className={cn(
                        "grid grid-cols-12 px-5 py-3.5 items-center",
                        overdue && "bg-red-50/40",
                        today && !overdue && "bg-amber-50/30"
                      )}
                    >
                      <div className="col-span-2">
                        <p className="text-sm font-mono font-medium text-foreground">
                          {order.order_number ?? order.shipment_number ?? order.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <div className="col-span-3 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {(order as any).member_name ?? "Unknown"}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.85 0.06 155)" }}>
                          {tierLabel}
                        </span>
                      </div>
                      <div className="col-span-3">
                        {order.scheduled_ship_date ? (
                          <div className="flex items-center gap-1.5">
                            {overdue
                              ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              : <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            <span className={cn("text-xs",
                              overdue ? "text-red-600 font-semibold" :
                              today ? "text-amber-700 font-semibold" : "text-foreground"
                            )}>
                              {new Date(order.scheduled_ship_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center justify-between">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
                          overdue ? "bg-red-50 text-red-700 border-red-200" :
                          today ? "bg-amber-50 text-amber-700 border-amber-200" :
                          "bg-blue-50 text-blue-700 border-blue-200"
                        )}>
                          {overdue ? "Overdue" : today ? "Ship Today" : "Upcoming"}
                        </span>
                        <Link href={`/ship/${order.id}`}>
                          <button
                            className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white transition-colors"
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