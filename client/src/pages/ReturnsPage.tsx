// BookNest Ops — Process Returns (wired to real Supabase data)
import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Search, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
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

export default function ReturnsPage() {
  const [sku, setSku] = useState("");
  const [searchSku, setSearchSku] = useState<string | null>(null);
  const [condition, setCondition] = useState("good");
  const [processed, setProcessed] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const { data: found, isLoading, error } = trpc.returns.lookupBySku.useQuery(
    { sku: searchSku! },
    { enabled: !!searchSku, retry: false }
  );

  const processReturn = trpc.returns.processReturn.useMutation({
    onSuccess: () => {
      setProcessed(true);
      setSessionCount((c) => c + 1);
      toast.success(`${found?.book_title?.title ?? "Book"} checked back into inventory`);
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
    setSearchSku(trimmed);
  };

  const handleProcess = () => {
    if (!found) return;
    processReturn.mutate({ copy_id: found.id, condition });
  };

  const handleReset = () => {
    setSku("");
    setSearchSku(null);
    setProcessed(false);
    setCondition("good");
  };

  // Show "not found" when query ran but returned null
  const notFound = searchSku && !isLoading && !found && !error;
  // Show "already in house" warning
  const alreadyInHouse = found && found.status === "in_house" && !processed;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
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
            SKU <span className="font-mono">{searchSku}</span> not found in inventory. Check the label and try again.
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
          <button
            onClick={handleReset}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Process Another Return
          </button>
        </div>
      )}
    </div>
  );
}
