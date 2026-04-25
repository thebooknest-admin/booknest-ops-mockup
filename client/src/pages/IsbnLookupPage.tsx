// BookNest Ops — ISBN Lookup & Classifier
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BookOpen, ChevronDown, ChevronUp, Search, Zap, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type AgeTier = "Hatchlings" | "Fledglings" | "Soarers" | "Sky Readers";
type ThemeBin = "Adventure" | "Humor" | "Life" | "Learn" | "Identity" | "Nature" | "Seasonal";
type ConfidenceLevel = "high" | "medium" | "low" | "needs-review";

const TIER_COLORS: Record<AgeTier, string> = {
  Hatchlings: "bg-yellow-100 text-yellow-800 border-yellow-300",
  Fledglings: "bg-green-100 text-green-800 border-green-300",
  Soarers: "bg-blue-100 text-blue-800 border-blue-300",
  "Sky Readers": "bg-purple-100 text-purple-800 border-purple-300",
};
const BIN_COLORS: Record<ThemeBin, string> = {
  Adventure: "bg-orange-100 text-orange-800",
  Humor: "bg-yellow-100 text-yellow-800",
  Life: "bg-pink-100 text-pink-800",
  Learn: "bg-teal-100 text-teal-800",
  Identity: "bg-indigo-100 text-indigo-800",
  Nature: "bg-green-100 text-green-800",
  Seasonal: "bg-red-100 text-red-800",
};
const CONFIDENCE_CONFIG: Record<ConfidenceLevel, { label: string; className: string; dot: string }> = {
  high:           { label: "High confidence",   className: "text-green-700 bg-green-50 border-green-200",   dot: "bg-green-500" },
  medium:         { label: "Medium confidence", className: "text-yellow-700 bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" },
  low:            { label: "Low confidence",    className: "text-orange-700 bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  "needs-review": { label: "Needs review",      className: "text-red-700 bg-red-50 border-red-200",          dot: "bg-red-500" },
};

function CoverImage({ title, coverCandidates, coverUrl }: { title: string; coverCandidates: string[]; coverUrl: string | null }) {
  const [idx, setIdx] = useState(0);
  const candidates = coverCandidates?.length ? coverCandidates : coverUrl ? [coverUrl] : [];
  if (!candidates.length) {
    return (
      <div className="w-20 h-28 rounded-md bg-muted border flex items-center justify-center shrink-0">
        <BookOpen className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img src={candidates[idx]} alt={title}
      className="w-20 h-28 object-cover rounded-md border shrink-0"
      onError={() => { if (idx < candidates.length - 1) setIdx(i => i + 1); }}
    />
  );
}

function RuleTrace({ trace }: { trace: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md overflow-hidden text-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted text-muted-foreground font-medium transition-colors">
        <span>Rule trace</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1 text-xs text-muted-foreground bg-background">
          <p><span className="font-semibold text-foreground">Tier source:</span> {trace.tierSource || "—"}</p>
          <p><span className="font-semibold text-foreground">Bin source:</span> {trace.binSource || "—"}</p>
          <p><span className="font-semibold text-foreground">Signals aligned:</span> {trace.signalsAligned}</p>
          {trace.usedAIFallback && <p className="flex items-center gap-1 text-amber-600 font-medium"><Zap className="w-3 h-3" /> AI fallback was used</p>}
          {trace.notes?.map((n: string, i: number) => <p key={i} className="text-orange-600">⚠ {n}</p>)}
        </div>
      )}
    </div>
  );
}

function HistoryItem({ book, classification, onSelect }: { book: any; classification: any; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted transition-colors text-sm">
      <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate text-foreground">{book.title}</p>
        <p className="text-xs text-muted-foreground">{classification.ageTier} · {classification.themeBin}</p>
      </div>
    </button>
  );
}

export default function IsbnLookupPage() {
  const [isbnInput, setIsbnInput] = useState("");
  const [submittedIsbn, setSubmittedIsbn] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ book: any; classification: any; fromCache?: boolean }>>([]);
  const [selected, setSelected] = useState<{ book: any; classification: any; fromCache?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching, error } = trpc.isbn.classify.useQuery(
    { isbn: submittedIsbn! },
    { enabled: !!submittedIsbn, retry: false }
  );

  useEffect(() => {
    if (data) {
      setSelected(data);
      setHistory(h => [data, ...h.filter(r => r.book.isbn !== data.book.isbn)].slice(0, 20));
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      toast.error(error.message || "Lookup failed. Check the ISBN and try again.");
      setSubmittedIsbn(null);
    }
  }, [error]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const val = isbnInput.trim();
    if (!val) return;
    setSelected(null);
    setSubmittedIsbn(val);
  };

  return (
    <div className="flex h-full">
      {history.length > 0 && (
        <aside className="hidden lg:flex flex-col w-52 border-r bg-muted/20 p-2 gap-0.5 overflow-y-auto shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 mb-1">Recent</p>
          {history.map((r, i) => (
            <HistoryItem key={i} book={r.book} classification={r.classification}
              onSelect={() => { setSelected(r); setIsbnInput(r.book.isbn); }} />
          ))}
        </aside>
      )}

      <main className="flex-1 p-6 max-w-2xl mx-auto space-y-5 overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold">ISBN Lookup</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Look up any book by ISBN to get its age tier, bin, and tags.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input ref={inputRef} value={isbnInput} onChange={e => setIsbnInput(e.target.value)}
            placeholder="Enter ISBN (10 or 13 digits)…" className="flex-1" autoFocus disabled={isFetching} />
          <Button type="submit" disabled={isFetching || !isbnInput.trim()}>
            {isFetching
              ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Looking up…</span>
              : <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Look up</span>}
          </Button>
        </form>

        {isFetching && (
          <Card>
            <CardContent className="p-4 animate-pulse">
              <div className="flex gap-4">
                <div className="w-20 h-28 bg-muted rounded-md shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {selected && !isFetching && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex gap-4">
                <CoverImage title={selected.book.title} coverCandidates={selected.book.coverCandidates} coverUrl={selected.book.coverUrl} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-lg leading-snug line-clamp-2">{selected.book.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{selected.book.authors?.join(", ")}</p>
                  <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                    {selected.book.pageCount && <span>{selected.book.pageCount} pages</span>}
                    {selected.book.publishedDate && <span>· {selected.book.publishedDate.slice(0, 4)}</span>}
                    <span>· {selected.book.sources?.join(" + ")}</span>
                    {selected.fromCache && <span className="text-blue-500">· cached</span>}
                  </div>
                  {selected.book.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{selected.book.description}</p>}
                </div>
              </div>

              <div className="border-t pt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={TIER_COLORS[selected.classification.ageTier as AgeTier] ?? ""}>
                    {selected.classification.ageTier} ({selected.classification.ageTierRange})
                  </Badge>
                  <Badge className={BIN_COLORS[selected.classification.themeBin as ThemeBin] ?? ""}>
                    {selected.classification.themeBin}
                  </Badge>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_CONFIG[selected.classification.confidence as ConfidenceLevel]?.className ?? ""}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_CONFIG[selected.classification.confidence as ConfidenceLevel]?.dot ?? ""}`} />
                    {CONFIDENCE_CONFIG[selected.classification.confidence as ConfidenceLevel]?.label}
                  </span>
                </div>

                {selected.classification.supportingTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selected.classification.supportingTags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                    ))}
                  </div>
                )}

                <p className="text-xs text-muted-foreground italic">{selected.classification.reasoning}</p>
                <RuleTrace trace={selected.classification.trace} />
              </div>
            </CardContent>
          </Card>
        )}

        {!selected && !isFetching && (
          <div className="text-center text-muted-foreground py-16">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Enter an ISBN above to classify a book</p>
          </div>
        )}
      </main>
    </div>
  );
}