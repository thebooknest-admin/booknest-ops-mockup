// BookNest Ops — Label Queue (wired to real Supabase data)
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Tag, Download, Printer, CheckCircle2, RefreshCw, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

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
        c.book_title?.isbn ?? "",
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

  const allSelected = pendingCopies.length > 0 && selected.size === pendingCopies.length;
  const someSelected = selected.size > 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
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
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Author</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bin</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Received</span>
            </div>

            <div className="divide-y divide-border/50">
              {pendingCopies.map((copy) => {
                const isChecked = selected.has(copy.id);
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
                      {copy.book_title?.isbn && (
                        <p className="text-xs text-muted-foreground font-mono">{copy.book_title.isbn}</p>
                      )}
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">{copy.book_title?.author ?? "—"}</p>
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
  );
}
