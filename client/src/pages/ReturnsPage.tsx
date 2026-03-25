// BookNest Ops — Process Returns (wired to real Supabase data + full audit trail)
import { useState } from "react";
import { toast } from "sonner";
import {
  RotateCcw, Search, CheckCircle2, Loader2, AlertTriangle,
  ClipboardList, ChevronDown, ChevronUp, RefreshCw
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const CONDITIONS = [
  { value: "new", label: "New", color: "oklch(0.42 0.11 155)" },
  { value: "like_new", label: "Like New", color: "oklch(0.52 0.14 155)" },
  { value: "good", label: "Good", color: "oklch(0.55 0.14 75)" },
  { value: "fair", label: "Fair", color: "oklch(0.55 0.14 50)" },
  { value: "poor", label: "Poor", color: "oklch(0.55 0.22 25)" },
];

const AGE_LABELS: Record<string, string> = {
  hatchlings: "🐣 Hatchlings",
  fledglings: "🐥 Fledglings",
  soarers: "🦅 Soarers",
  sky_readers: "🌟 Sky Readers",
};

const CONDITION_COLORS: Record<string, string> = {
  new: "oklch(0.42 0.11 155)",
  like_new: "oklch(0.52 0.14 155)",
  good: "oklch(0.55 0.14 75)",
  fair: "oklch(0.55 0.14 50)",
  poor: "oklch(0.55 0.22 25)",
};

export default function ReturnsPage() {
  const [sku, setSku] = useState("");
  const [searchSku, setSearchSku] = useState<string | null>(null);
  const [condition, setCondition] = useState("good");
  const [notes, setNotes] = useState("");
  const [processed, setProcessed] = useState(false);
  const [lastReturnNumber, setLastReturnNumber] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const { data: found, isLoading, error } = trpc.returns.lookupBySku.useQuery(
    { sku: searchSku! },
    { enabled: !!searchSku, retry: false }
  );

  const utils = trpc.useUtils();

  const { data: history, isLoading: historyLoading, refetch: refetchHistory } =
    trpc.returns.history.useQuery({ limit: 20 });

  const processReturn = trpc.returns.processReturn.useMutation({
    onSuccess: (result) => {
      setProcessed(true);
      setSessionCount((c) => c + 1);
      setLastReturnNumber(result.return_number ?? null);
      toast.success(`${found?.book_title?.title ?? "Book"} checked back in — ${result.return_number}`);
      utils.returns.history.invalidate();
    },
    onError: (err: any) => {
      toast.error("Failed to process return: " + err.message);
    },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = sku.trim();
    if (!trimmed) return;
    setProcessed(false);
    setCondition("good");
    setNotes("");
    setLastReturnNumber(null);
    setSearchSku(trimmed);
  };

  const handleProcess = () => {
    if (!found) return;
    processReturn.mutate({
      copy_id: found.id,
      condition,
      notes: notes.trim() || undefined,
      last_shipment_id: found.last_shipment_id ?? undefined,
      last_shipment_book_id: found.last_shipment_book_id ?? undefined,
      sku: found.sku,
      title: found.book_title?.title,
    });
  };

  const handleReset = () => {
    setSku("");
    setSearchSku(null);
    setProcessed(false);
    setCondition("good");
    setNotes("");
    setLastReturnNumber(null);
  };

  const notFound = searchSku && !isLoading && !found && !error;
  const alreadyInHouse = found && found.status === "in_house" && !processed;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="page-header">
          <h1 className="page-title">Process Returns</h1>
          <p className="page-subtitle">Scan or enter a SKU to check a book back into inventory</p>
        </div>
        {sessionCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border"
            style={{ backgroundColor: "oklch(0.96 0.04 155)", borderColor: "oklch(0.85 0.06 155)", color: "oklch(0.35 0.10 155)" }}>
            <RotateCcw className="w-3.5 h-3.5" />
            {sessionCount} returned this session
          </div>
        )}
      </div>

      {/* SKU Search */}
      <div className="bg-card rounded-xl border border-border p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="Scan or type SKU (e.g. BN-SOAR-0042)…"
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !sku.trim()}
            className="w-full py-3 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Look Up SKU
          </button>
        </form>
      </div>

      {/* Not found */}
      {notFound && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{ backgroundColor: "oklch(0.97 0.03 25)", borderColor: "oklch(0.88 0.08 25)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "oklch(0.55 0.22 25)" }} />
          <p className="text-sm font-medium" style={{ color: "oklch(0.40 0.18 25)" }}>
            SKU <span className="font-mono">{searchSku}</span> not found. Check the label and try again.
          </p>
        </div>
      )}

      {/* Already in house warning */}
      {alreadyInHouse && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border"
          style={{ backgroundColor: "oklch(0.97 0.04 75)", borderColor: "oklch(0.88 0.08 75)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
          <p className="text-sm font-medium" style={{ color: "oklch(0.40 0.12 75)" }}>
            This copy is already marked as <strong>in-house</strong>. You can still re-process it to update the condition.
          </p>
        </div>
      )}

      {/* Book found — not yet processed */}
      {found && !processed && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Book Found</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Title", value: found.book_title?.title ?? "—" },
              { label: "Author", value: found.book_title?.author ?? "—" },
              { label: "SKU", value: found.sku },
              { label: "Bin", value: found.bin_id ?? "—" },
              { label: "Age Group", value: AGE_LABELS[found.age_group] ?? found.age_group ?? "—" },
              { label: "Current Status", value: found.status?.replace(/_/g, " ") ?? "—" },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{f.label}</p>
                <p className="font-medium text-foreground mt-0.5 font-mono text-xs">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Condition selector */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Condition on Return</p>
            <div className="flex gap-2 flex-wrap">
              {CONDITIONS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCondition(c.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    condition === c.value ? "text-white border-transparent" : "border-border text-muted-foreground hover:bg-muted"
                  )}
                  style={condition === c.value ? { backgroundColor: c.color } : {}}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional notes */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes (optional)</p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. torn cover, missing pages, water damage…"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>

          <button
            onClick={handleProcess}
            disabled={processReturn.isPending}
            className="w-full py-3 rounded-lg text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            {processReturn.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RotateCcw className="w-4 h-4" />
            }
            Check Back Into Inventory
          </button>
        </div>
      )}

      {/* Success */}
      {found && processed && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "oklch(0.62 0.16 155)" }} />
          <h3 className="font-semibold text-foreground">Return Processed</h3>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{found.book_title?.title ?? found.sku}</span> is back in{" "}
            <span className="font-mono font-medium">{found.bin_id ?? "inventory"}</span>
          </p>
          {lastReturnNumber && (
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              Return record: <span className="font-semibold text-foreground">{lastReturnNumber}</span>
            </p>
          )}
          <button
            onClick={handleReset}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Process Another Return
          </button>
        </div>
      )}

      {/* Return History Log */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => {
            setHistoryExpanded(v => !v);
            if (!historyExpanded) refetchHistory();
          }}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            <span className="font-semibold text-foreground text-sm">Return History</span>
            {history && history.length > 0 && (
              <span className="text-xs text-muted-foreground">({history.length} records)</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); refetchHistory(); }}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Refresh history"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {historyExpanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />
            }
          </div>
        </button>

        {historyExpanded && (
          <div className="border-t border-border">
            {historyLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading history…</p>
              </div>
            ) : !history || history.length === 0 ? (
              <div className="p-6 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-foreground">No return records yet</p>
                <p className="text-xs text-muted-foreground mt-1">Returns you process will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
                {history.map((r: any) => (
                  <div key={r.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-foreground">{r.return_number}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: "oklch(0.95 0.04 155)", color: "oklch(0.35 0.10 155)" }}>
                            {r.status}
                          </span>
                        </div>
                        {r.books?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {r.books.map((rb: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{rb.copy?.sku ?? "—"}</span>
                                <span className="text-border">·</span>
                                <span className="truncate">{rb.copy?.book_title?.title ?? "Unknown title"}</span>
                                {rb.condition_on_return && (
                                  <>
                                    <span className="text-border">·</span>
                                    <span className="font-medium capitalize"
                                      style={{ color: CONDITION_COLORS[rb.condition_on_return] ?? "inherit" }}>
                                      {rb.condition_on_return.replace(/_/g, " ")}
                                    </span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {r.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{r.notes}"</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {r.actual_return_date
                          ? new Date(r.actual_return_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
