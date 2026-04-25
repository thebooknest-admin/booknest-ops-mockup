import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { BookOpen, Package, CheckCheck, Check, Pencil, X, Search } from "lucide-react";

type StockItem = {
  id: string;
  sku: string;
  isbn: string | null;
  age_group: string;
  bin_id: string;
  condition: string | null;
  received_at: string;
  book_title: { id: string; title: string; author: string; cover_url: string | null } | null;
};

const CONDITION_COLOR: Record<string, string> = {
  good: "bg-green-100 text-green-800",
  fair: "bg-amber-100 text-amber-800",
  poor: "bg-red-100 text-red-800",
};

// Split bin_id into prefix + number, e.g. "FLED-ADVENTURE-01" → ["FLED-ADVENTURE-", "01"]
function splitBinId(binId: string): [string, string] {
  const match = binId.match(/^(.+-)(\d+)$/);
  if (match) return [match[1], match[2]];
  return [binId, ""];
}

function StockCard({
  item,
  selected,
  onToggle,
  onConfirmSingle,
  busy,
}: {
  item: StockItem;
  selected: boolean;
  onToggle: () => void;
  onConfirmSingle: (binId: string) => void;
  busy: boolean;
}) {
  const [editingBin, setEditingBin] = useState(false);
  const [binPrefix, binSuffix] = splitBinId(item.bin_id);
  const [binNumber, setBinNumber] = useState(binSuffix || "01");

  const finalBinId = binPrefix + binNumber.padStart(2, "0");

  const handlePlacedClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editingBin) {
      // Already in edit mode — confirm with current bin
      onConfirmSingle(finalBinId);
      setEditingBin(false);
    } else {
      setEditingBin(true);
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBin(false);
    setBinNumber(binSuffix || "01");
  };

  return (
    <Card
      className={`border overflow-hidden transition-all cursor-pointer ${
        selected ? "border-green-500 bg-green-50/40" : "border-border"
      }`}
      onClick={!editingBin ? onToggle : undefined}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-3">
          {/* Checkbox */}
          <div
            className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
              selected ? "border-green-600 bg-green-600" : "border-muted-foreground/40 bg-background"
            }`}
          >
            {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>

          {/* Cover */}
          <div className="w-9 h-12 rounded overflow-hidden bg-muted shrink-0 flex items-center justify-center">
            {item.book_title?.cover_url ? (
              <img src={item.book_title.cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <BookOpen className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {item.book_title?.title ?? "Unknown Title"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{item.book_title?.author}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs font-medium text-foreground font-mono">{item.bin_id}</span>
              {item.condition && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${
                    CONDITION_COLOR[item.condition] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {item.condition}
                </span>
              )}
            </div>
          </div>

          {/* Placed button */}
          {!editingBin && (
            <Button
              size="sm"
              className="shrink-0 bg-green-700 hover:bg-green-800 text-white text-xs px-3"
              disabled={busy}
              onClick={handlePlacedClick}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Placed
            </Button>
          )}
        </div>

        {/* Inline bin editor */}
        {editingBin && (
          <div
            className="flex items-center gap-2 pt-1 border-t border-border/60"
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Shelving in:</span>
            <span className="font-mono text-xs font-semibold text-foreground">{binPrefix}</span>
            <input
              type="text"
              value={binNumber}
              onChange={(e) => setBinNumber(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className="w-10 text-center font-mono text-sm font-bold border border-border rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
              autoFocus
              maxLength={2}
              placeholder="01"
            />
            <div className="flex-1" />
            <button
              onClick={handleCancel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <Button
              size="sm"
              className="bg-green-700 hover:bg-green-800 text-white text-xs px-3"
              disabled={busy || !binNumber}
              onClick={handlePlacedClick}
            >
              <Check className="w-3.5 h-3.5 mr-1" />
              Confirm
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function StockQueuePage() {
  const { data: items = [], refetch, isLoading } = trpc.stock.queue.useQuery();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const filteredItems = search.trim()
    ? items.filter((item) => {
        const q = search.toLowerCase();
        return (
          item.book_title?.title?.toLowerCase().includes(q) ||
          item.book_title?.author?.toLowerCase().includes(q) ||
          item.sku?.toLowerCase().includes(q) ||
          item.bin_id?.toLowerCase().includes(q)
        );
      })
    : items;

  const confirmAllMutation = trpc.stock.confirmAll.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.count} book${result.count !== 1 ? "s" : ""} confirmed as shelved`);
      setSelected(new Set());
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const confirmOneMutation = trpc.stock.confirmPlaced.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (e) => toast.error(e.message),
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
    if (selected.size === filteredItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const handleConfirmSelected = () => {
    if (selected.size === 0) return;
    confirmAllMutation.mutate({ copy_ids: Array.from(selected) });
  };

  // Group by bin for easier shelving
  const byBin: Record<string, StockItem[]> = {};
  for (const item of filteredItems) {
    if (!byBin[item.bin_id]) byBin[item.bin_id] = [];
    byBin[item.bin_id].push(item);
  }
  const sortedBins = Object.keys(byBin).sort();

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stock Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Physically place each book in its bin, then confirm it's shelved.
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-sm px-3 py-1 border-blue-300 bg-blue-50 text-blue-800"
        >
          {items.length} to shelve
        </Badge>
      </div>

      {/* Search */}
      {items.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, SKU, or bin…"
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Batch action bar */}
      {filteredItems.length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border">
          <button
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={toggleAll}
          >
            {selected.size === filteredItems.length ? "Deselect all" : `Select all (${filteredItems.length})`}
          </button>
          <div className="flex-1" />
          {selected.size > 0 && (
            <Button
              className="bg-green-700 hover:bg-green-800 text-white"
              disabled={confirmAllMutation.isPending}
              onClick={handleConfirmSelected}
            >
              <CheckCheck className="w-4 h-4 mr-1.5" />
              {confirmAllMutation.isPending
                ? "Confirming…"
                : `Confirm ${selected.size} Placed`}
            </Button>
          )}
        </div>
      )}

      {/* Empty state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading stock queue…</p>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Package className="w-12 h-12 opacity-30" />
          <p className="text-base font-medium">Stock queue is clear</p>
          <p className="text-sm opacity-70">All QC-passed books have been shelved.</p>
        </div>
      )}

      {!isLoading && items.length > 0 && filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
          <Search className="w-10 h-10 opacity-30" />
          <p className="text-base font-medium">No results for "{search}"</p>
          <button onClick={() => setSearch("")} className="text-sm underline hover:text-foreground transition-colors">
            Clear search
          </button>
        </div>
      )}

      {/* Books grouped by bin */}
      {sortedBins.map((bin) => (
        <div key={bin} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
              Bin: {bin}
            </span>
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">
              {byBin[bin].length} book{byBin[bin].length !== 1 ? "s" : ""}
            </span>
          </div>
          {byBin[bin].map((item) => (
            <StockCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => toggleSelect(item.id)}
              onConfirmSingle={(binId) => {
                confirmOneMutation.mutate({ copy_id: item.id, bin_id: binId });
                toast.success(`${item.sku} shelved in ${binId}`);
              }}
              busy={confirmOneMutation.isPending || confirmAllMutation.isPending}
            />
          ))}
        </div>
      ))}
    </div>
  );
}