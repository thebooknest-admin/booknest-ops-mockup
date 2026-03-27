// BookNest Ops — Label Queue (wired to real Supabase data)
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Tag, Download, Printer, CheckCircle2, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type LabelCopy = {
  id: string;
  sku: string;
  isbn: string | null;
  age_group: string | null;
  bin_id: string | null;
  label_status: string | null;
  received_at: string | null;
  book_title: { title: string; author: string; isbn: string | null } | null;
};

// ─── Label Card (print view) ─────────────────────────────────────────────────
// Rendered inside a hidden @print section; each card is ~2.5" × 1.5" at 96dpi.

function LabelCard({ copy }: { copy: LabelCopy }) {
  const title = copy.book_title?.title ?? "—";
  const isbn = copy.isbn ?? copy.book_title?.isbn ?? "";
  const sku = copy.sku ?? "";
  const bin = copy.bin_id ?? "";
  const qrValue = sku; // QR encodes the SKU

  return (
    <div
      className="label-card"
      style={{
        width: "2.5in",
        height: "1.5in",
        border: "1px solid #ccc",
        borderRadius: "4px",
        padding: "6px 8px",
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        gap: "6px",
        boxSizing: "border-box",
        pageBreakInside: "avoid",
        backgroundColor: "#fff",
        fontFamily: "monospace",
      }}
    >
      {/* Left: text fields */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", overflow: "hidden" }}>
        {/* Title */}
        <div style={{ fontSize: "7.5pt", fontWeight: 700, lineHeight: 1.2, color: "#111", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {title}
        </div>
        {/* ISBN */}
        <div style={{ fontSize: "6.5pt", color: "#555", marginTop: "2px" }}>
          <span style={{ fontWeight: 600 }}>ISBN:</span> {isbn || "—"}
        </div>
        {/* SKU */}
        <div style={{ fontSize: "7pt", fontWeight: 700, color: "#1a6640", marginTop: "2px" }}>
          {sku}
        </div>
        {/* Bin */}
        <div style={{ fontSize: "6.5pt", color: "#555", marginTop: "2px" }}>
          <span style={{ fontWeight: 600 }}>Bin:</span> {bin || "—"}
        </div>
      </div>

      {/* Right: QR code */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {qrValue ? (
          <QRCodeSVG
            value={qrValue}
            size={72}
            level="M"
            style={{ display: "block" }}
          />
        ) : (
          <div style={{ width: 72, height: 72, background: "#eee", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "6pt", color: "#999" }}>
            No SKU
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LabelsPage() {
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: pendingCopies = [], isLoading, refetch } = trpc.labels.pending.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  const markPrinted = trpc.labels.markPrinted.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`${vars.ids.length} label${vars.ids.length > 1 ? "s" : ""} marked as printed`);
      setSelected(new Set());
      utils.labels.pending.invalidate();
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === pendingCopies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingCopies.map((c) => c.id)));
    }
  };

  const exportCSV = () => {
    const rows = [
      ["SKU", "Title", "Author", "ISBN", "Age Group", "Bin", "Received"],
      ...pendingCopies.map((c) => [
        c.sku ?? "",
        c.book_title?.title ?? "",
        c.book_title?.author ?? "",
        c.isbn ?? c.book_title?.isbn ?? "",
        c.age_group ?? "",
        c.bin_id ?? "",
        c.received_at ? new Date(c.received_at).toLocaleDateString() : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `label-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const printSelected = () => {
    window.print();
  };

  const allSelected = pendingCopies.length > 0 && selected.size === pendingCopies.length;
  const someSelected = selected.size > 0;

  const copiesToPrint = someSelected
    ? pendingCopies.filter((c) => selected.has(c.id))
    : pendingCopies;

  return (
    <>
      {/* ── Print-only label sheet ── */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #label-print-sheet { display: flex !important; }
          @page { margin: 0.25in; size: letter; }
        }
        #label-print-sheet {
          display: none;
          flex-wrap: wrap;
          gap: 8px;
          align-content: flex-start;
        }
      `}</style>

      <div id="label-print-sheet">
        {copiesToPrint.map((copy) => (
          <LabelCard key={copy.id} copy={copy} />
        ))}
      </div>

      {/* ── Screen UI ── */}
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Label Queue</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading…" : `${pendingCopies.length} copies awaiting labels`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              Refresh
            </button>
            <button
              onClick={exportCSV}
              disabled={pendingCopies.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            <button
              onClick={printSelected}
              disabled={pendingCopies.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-40"
            >
              <Tag className="w-3.5 h-3.5" />
              {someSelected ? `Print ${selected.size} Labels` : "Print All Labels"}
            </button>
            {someSelected && (
              <button
                onClick={() => markPrinted.mutate({ ids: Array.from(selected) })}
                disabled={markPrinted.isPending}
                className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                <Printer className="w-3.5 h-3.5" />
                Mark {selected.size} Printed
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading label queue…</p>
            </div>
          ) : pendingCopies.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "oklch(0.42 0.11 155)" }} />
              <p className="text-sm font-medium text-foreground">All labels printed!</p>
              <p className="text-xs text-muted-foreground mt-1">No copies are waiting for labels.</p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="grid grid-cols-12 px-5 py-3 bg-muted/30 border-b border-border items-center">
                <div className="col-span-1 flex items-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                </div>
                <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ISBN</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bin</span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age</span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Received</span>
              </div>

              <div className="divide-y divide-border/50">
                {pendingCopies.map((copy) => {
                  const isChecked = selected.has(copy.id);
                  const isbn = copy.isbn ?? copy.book_title?.isbn ?? null;
                  return (
                    <div
                      key={copy.id}
                      onClick={() => toggleSelect(copy.id)}
                      className={cn(
                        "grid grid-cols-12 px-5 py-3 items-center cursor-pointer transition-colors",
                        isChecked ? "bg-primary/5" : "hover:bg-muted/20"
                      )}
                    >
                      <div className="col-span-1 flex items-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(copy.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </div>
                      <div className="col-span-3 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {copy.book_title?.title ?? "—"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{copy.book_title?.author ?? ""}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs font-mono text-muted-foreground">
                          {isbn ?? <span className="italic text-muted-foreground/50">—</span>}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs font-mono font-semibold" style={{ color: "oklch(0.42 0.11 155)" }}>
                          {copy.sku ?? "—"}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-muted-foreground font-mono">{copy.bin_id ?? "—"}</span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs text-foreground capitalize">{copy.age_group ?? "—"}</span>
                      </div>
                      <div className="col-span-1">
                        <span className="text-xs text-muted-foreground">
                          {copy.received_at ? new Date(copy.received_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {someSelected ? `${selected.size} of ${pendingCopies.length} selected` : `${pendingCopies.length} copies pending`}
                </p>
                {someSelected && (
                  <button
                    onClick={() => markPrinted.mutate({ ids: Array.from(selected) })}
                    disabled={markPrinted.isPending}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Mark {selected.size} as Printed
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
