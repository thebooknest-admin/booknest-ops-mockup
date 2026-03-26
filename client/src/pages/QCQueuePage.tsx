import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle, XCircle, BookOpen, ClipboardCheck, ChevronDown, ChevronUp } from "lucide-react";

const CONDITION_OPTIONS = [
  { value: "good", label: "Good", description: "Clean, no damage, all pages intact", color: "bg-green-100 text-green-800 border-green-200" },
  { value: "fair", label: "Fair", description: "Minor wear, small marks, fully readable", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { value: "poor", label: "Poor", description: "Significant wear — donate to LFL", color: "bg-red-100 text-red-800 border-red-200" },
];

type QCItem = {
  id: string;
  sku: string;
  isbn: string | null;
  age_group: string;
  bin_id: string;
  condition: string | null;
  received_at: string;
  book_title: { id: string; title: string; author: string; cover_url: string | null } | null;
};

function QCCard({ item, onDone }: { item: QCItem; onDone: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [condition, setCondition] = useState<string>("good");
  const [notes, setNotes] = useState("");

  const passMutation = trpc.qc.pass.useMutation({
    onSuccess: () => {
      toast.success(`${item.sku} moved to Stock Queue`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const failMutation = trpc.qc.fail.useMutation({
    onSuccess: () => {
      toast.success(`${item.sku} marked for LFL donation`);
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const isBusy = passMutation.isPending || failMutation.isPending;

  return (
    <Card className="border border-border overflow-hidden">
      <CardContent className="p-0">
        {/* Header row */}
        <button
          className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* Cover */}
          <div className="w-10 h-14 rounded overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center">
            {item.book_title?.cover_url ? (
              <img src={item.book_title.cover_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <BookOpen className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {item.book_title?.title ?? "Unknown Title"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{item.book_title?.author}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-xs text-muted-foreground">{item.sku}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{item.bin_id}</span>
            </div>
          </div>
          {/* Expand toggle */}
          <div className="flex-shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {/* Expanded QC panel */}
        {expanded && (
          <div className="border-t border-border p-4 space-y-4 bg-muted/10">
            {/* Condition selector */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Condition</p>
              <div className="grid grid-cols-3 gap-2">
                {CONDITION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setCondition(opt.value)}
                    className={`rounded-lg border-2 p-2 text-left transition-all ${
                      condition === opt.value
                        ? `${opt.color} border-current font-semibold`
                        : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs opacity-75 leading-tight mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Notes (optional)</p>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Torn cover, missing pages, water damage…"
                className="text-sm resize-none h-20"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-green-700 hover:bg-green-800 text-white"
                disabled={isBusy || condition === "poor"}
                onClick={() => passMutation.mutate({ copy_id: item.id, condition, notes: notes || undefined })}
              >
                <CheckCircle className="w-4 h-4 mr-1.5" />
                {passMutation.isPending ? "Passing…" : "Pass — Move to Stock"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
                disabled={isBusy}
                onClick={() => failMutation.mutate({ copy_id: item.id, notes: notes || undefined })}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                {failMutation.isPending ? "Failing…" : "Fail — Donate to LFL"}
              </Button>
            </div>
            {condition === "poor" && (
              <p className="text-xs text-red-600 text-center">
                Condition is Poor — this book should be donated to LFL, not stocked.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function QCQueuePage() {
  const { data: items = [], refetch, isLoading } = trpc.qc.queue.useQuery();

  const handleDone = () => {
    refetch();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">QC Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inspect, clean, and grade each book before it goes to stock.
          </p>
        </div>
        <Badge
          variant="outline"
          className="text-sm px-3 py-1 border-amber-300 bg-amber-50 text-amber-800"
        >
          {items.length} pending
        </Badge>
      </div>

      {/* Empty state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading QC queue…</p>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <ClipboardCheck className="w-12 h-12 opacity-30" />
          <p className="text-base font-medium">QC queue is clear</p>
          <p className="text-sm opacity-70">All received books have been inspected.</p>
        </div>
      )}

      {/* Queue list */}
      <div className="space-y-3">
        {items.map((item) => (
          <QCCard key={item.id} item={item} onDone={handleDone} />
        ))}
      </div>
    </div>
  );
}
