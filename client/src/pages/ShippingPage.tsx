// BookNest Ops — Shipping Queue (Pirateship CSV export + tracking import)
import { useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Truck, AlertTriangle, Clock, RefreshCw, CheckCircle2,
  CalendarDays, PackageCheck, Download, AlertCircle, Upload, X, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getNextShipDay } from "@/lib/shipDays";

const TIER_LABELS: Record<string, string> = {
  "little-nest": "Little Nest", "cozy-nest": "Cozy Nest", "story-nest": "Story Nest",
  little_nest: "Little Nest", cozy_nest: "Cozy Nest", story_nest: "Story Nest",
};

const BOOK_NEST = {
  name: "The Book Nest", street: "205 Ambrose Drive", street2: "#8",
  city: "Ranson", state: "WV", zip: "25438",
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


function escapeCSV(val: string | null | undefined): string {
  const str = val ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function downloadCSV(filename: string, rows: string[][]): void {
  const csv = rows.map((r) => r.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function detectColumns(headers: string[]): { orderCol: number; trackingCol: number; carrierCol: number } {
  const h = headers.map((h) => h.toLowerCase().trim());
  return {
    orderCol: h.findIndex((h) => h.includes("order")),
    trackingCol: h.findIndex((h) => h.includes("tracking") || h.includes("track")),
    carrierCol: h.findIndex((h) => h.includes("carrier") || h.includes("service") || h.includes("mail class")),
  };
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/).filter((l) => l.trim())) {
    const cells: string[] = [];
    let inQuote = false, current = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) { cells.push(current.trim()); current = ""; }
      else current += ch;
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

interface ParsedRow { order_number: string; tracking_number: string; carrier?: string; }
interface ImportState { rows: ParsedRow[]; filename: string; errors: string[]; }

export default function ShippingPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data: packedData, isLoading, refetch, isRefetching } =
    trpc.shipments.list.useQuery({ status: "packed" }, { refetchInterval: 60_000 });
  const { data: exportData } =
    trpc.shipping.exportOrders.useQuery(undefined, { refetchInterval: 60_000 });

  const importTracking = trpc.shipping.importTracking.useMutation({
    onSuccess: (result) => {
      if (result.succeeded > 0)
        toast.success(`Updated ${result.succeeded} shipment${result.succeeded !== 1 ? "s" : ""} — marked as shipped!`);
      if (result.failed > 0)
        toast.error(`${result.failed} row${result.failed !== 1 ? "s" : ""} failed — check order numbers.`);
      setImportState(null);
      setImportOpen(false);
      refetch();
    },
    onError: () => toast.error("Import failed. Please try again."),
  });

  function handleExportOutbound() {
    const orders = exportData?.orders ?? [];
    if (!orders.length) { toast.info("No orders to export for the next ship day."); return; }
    const shipDate = exportData?.ship_date ?? "unknown";
    downloadCSV(`booknest-outbound-${shipDate}.csv`, [
      ["Order Number", "Name", "Street", "Street2", "City", "State", "Zip", "Weight (oz)", "Length", "Width", "Height"],
      ...orders.map((o) => [o.order_number, o.member_name, o.street, o.street2 ?? "", o.city, o.state, o.zip, String(o.weight_oz), "14", "11", "3"]),
    ]);
    toast.success(`Exported ${orders.length} outbound label${orders.length !== 1 ? "s" : ""}`);
  }

  function handleExportReturn() {
    const orders = exportData?.orders ?? [];
    if (!orders.length) { toast.info("No orders to export for the next ship day."); return; }
    const shipDate = exportData?.ship_date ?? "unknown";
    downloadCSV(`booknest-return-${shipDate}.csv`, [
      ["Order Number", "Name", "Street", "Street2", "City", "State", "Zip", "Weight (oz)", "Length", "Width", "Height"],
      ...orders.map((o) => [`${o.order_number}-RET`, BOOK_NEST.name, BOOK_NEST.street, BOOK_NEST.street2, BOOK_NEST.city, BOOK_NEST.state, BOOK_NEST.zip, "32", "13", "11", "4"]),
    ]);
    toast.success(`Exported ${orders.length} return label${orders.length !== 1 ? "s" : ""}`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { toast.error("CSV appears to be empty."); return; }

      const headers = rows[0];
      const { orderCol, trackingCol, carrierCol } = detectColumns(headers);
      const errors: string[] = [];
      if (orderCol === -1) errors.push("Could not find an Order Number column. Expected a column containing 'order' in the header.");
      if (trackingCol === -1) errors.push("Could not find a Tracking Number column. Expected a column containing 'tracking' in the header.");

      if (errors.length > 0) { setImportState({ rows: [], filename: file.name, errors }); setImportOpen(true); return; }

      const parsed: ParsedRow[] = rows.slice(1)
        .filter((r) => r[orderCol]?.trim() && r[trackingCol]?.trim())
        .map((r) => ({
          order_number: r[orderCol].trim(),
          tracking_number: r[trackingCol].trim(),
          carrier: carrierCol !== -1 ? r[carrierCol]?.trim() : undefined,
        }));

      if (!parsed.length) { toast.error("No valid rows found in the CSV."); return; }
      setImportState({ rows: parsed, filename: file.name, errors: [] });
      setImportOpen(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const allOrders = packedData?.data ?? [];
  const overdueCount = allOrders.filter((o) => isOverdue(o.scheduled_ship_date)).length;
  const dueTodayCount = allOrders.filter((o) => isDueToday(o.scheduled_ship_date)).length;
  const upcomingCount = allOrders.filter((o) => !isOverdue(o.scheduled_ship_date) && !isDueToday(o.scheduled_ship_date)).length;
  const nextShipDay = getNextShipDay();
  const exportOrders = exportData?.orders ?? [];
  const missingAddresses = exportData?.missing ?? [];

  const sorted = [...allOrders].sort((a, b) => {
    const aOver = isOverdue(a.scheduled_ship_date);
    const bOver = isOverdue(b.scheduled_ship_date);
    if (aOver && !bOver) return -1;
    if (!aOver && bOver) return 1;
    if (a.scheduled_ship_date && b.scheduled_ship_date)
      return new Date(a.scheduled_ship_date).getTime() - new Date(b.scheduled_ship_date).getTime();
    return 0;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">

      {/* ── Tracking Import Modal ─────────────────────────────────────── */}
      {importOpen && importState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Import Tracking Numbers</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{importState.filename}</p>
              </div>
              <button onClick={() => { setImportOpen(false); setImportState(null); }} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {importState.errors.length > 0 && (
              <div className="px-6 py-4 space-y-2">
                {importState.errors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{e}</p>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground mt-2">
                  Make sure your Pirateship export includes the <strong>Order ID</strong> and <strong>Tracking Number</strong> columns.
                </p>
                <button onClick={() => { setImportOpen(false); setImportState(null); }} className="w-full mt-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
                  Close
                </button>
              </div>
            )}

            {importState.rows.length > 0 && (
              <>
                <div className="px-6 py-4">
                  <p className="text-sm text-foreground mb-3">
                    Found <strong>{importState.rows.length}</strong> shipment{importState.rows.length !== 1 ? "s" : ""} to update. This will mark them as <strong>shipped</strong> and save tracking numbers.
                  </p>
                  <div className="rounded-lg border border-border overflow-hidden max-h-52 overflow-y-auto">
                    <div className="grid grid-cols-2 px-3 py-2 bg-muted/40">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order #</span>
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tracking</span>
                    </div>
                    <div className="divide-y divide-border/50">
                      {importState.rows.slice(0, 20).map((r, i) => (
                        <div key={i} className="grid grid-cols-2 px-3 py-2">
                          <span className="text-xs font-mono text-foreground">{r.order_number}</span>
                          <span className="text-xs font-mono text-muted-foreground truncate">{r.tracking_number}</span>
                        </div>
                      ))}
                      {importState.rows.length > 20 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">+{importState.rows.length - 20} more rows</div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 border-t border-border flex gap-3">
                  <button onClick={() => { setImportOpen(false); setImportState(null); }} className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={() => importTracking.mutate({ rows: importState.rows })}
                    disabled={importTracking.isPending}
                    className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                  >
                    {importTracking.isPending ? "Importing..." : `Import ${importState.rows.length} Shipment${importState.rows.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />

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
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import Tracking
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
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ backgroundColor: nextShipDay.isToday ? "oklch(0.96 0.04 155)" : "oklch(0.98 0.01 80)", borderColor: nextShipDay.isToday ? "oklch(0.85 0.08 155)" : "oklch(0.91 0.006 80)" }}>
              <CalendarDays className="w-4 h-4 shrink-0" style={{ color: nextShipDay.isToday ? "oklch(0.42 0.11 155)" : "oklch(0.55 0.01 80)" }} />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Next Ship Day</p>
                <p className="text-sm font-semibold" style={{ color: nextShipDay.isToday ? "oklch(0.35 0.10 155)" : "oklch(0.25 0.01 80)" }}>{nextShipDay.label}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
              style={{ backgroundColor: dueTodayCount > 0 ? "oklch(0.97 0.04 75)" : "oklch(0.98 0.01 80)", borderColor: dueTodayCount > 0 ? "oklch(0.88 0.08 75)" : "oklch(0.91 0.006 80)" }}>
              <PackageCheck className="w-4 h-4 shrink-0" style={{ color: dueTodayCount > 0 ? "oklch(0.55 0.14 75)" : "oklch(0.65 0.01 80)" }} />
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Due Today</p>
                <p className="text-sm font-semibold" style={{ color: dueTodayCount > 0 ? "oklch(0.40 0.12 75)" : "oklch(0.55 0.01 80)" }}>{dueTodayCount} order{dueTodayCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border" style={{ backgroundColor: "oklch(0.98 0.01 80)", borderColor: "oklch(0.91 0.006 80)" }}>
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
                  const tierKey = (order.member_tier ?? "").toLowerCase();
                  const tierLabel = TIER_LABELS[tierKey] ?? "—";
                  return (
                    <div key={order.id} className={cn("grid grid-cols-12 px-5 py-3.5 items-center", overdue && "bg-red-50/40", today && !overdue && "bg-amber-50/30")}>
                      <div className="col-span-2">
                        <p className="text-sm font-mono font-medium text-foreground">
                          {order.order_number ?? order.shipment_number ?? order.id.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <div className="col-span-3 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{order.member_name}</p>
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
                            {overdue ? <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" /> : <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            <span className={cn("text-xs", overdue ? "text-red-600 font-semibold" : today ? "text-amber-700 font-semibold" : "text-foreground")}>
                              {new Date(order.scheduled_ship_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
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
                          <button className="text-xs font-medium px-2.5 py-1.5 rounded-lg text-white transition-colors" style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
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

        {/* ── Import hint ────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-1">
          <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <p className="text-xs text-muted-foreground">
            After buying labels in Pirateship, export your batch and click <strong>Import Tracking</strong> to mark orders as shipped.
          </p>
        </div>
      </div>
    </div>
  );
}