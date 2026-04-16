/**
 * IsbnLookupPage.tsx
 * Goes in: client/src/pages/IsbnLookupPage.tsx
 *
 * Calls trpc.isbn.classify — wired up in routers.ts as isbn: isbnRouter
 */

import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BookOpen, ChevronDown, ChevronUp, Search, Zap } from "lucide-react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgeTier = "Hatchlings" | "Fledglings" | "Soarers" | "Sky Readers";
type ThemeBin = "Adventure" | "Humor" | "Life" | "Learn" | "Identity" | "Nature" | "Seasonal";
type ConfidenceLevel = "high" | "medium" | "low" | "needs-review";

// ─── Style maps ───────────────────────────────────────────────────────────────

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
  high:           { label: "High confidence",   className: "text-green-700 bg-green-50 border-green-200",  dot: "bg-green-500" },
  medium:         { label: "Medium confidence", className: "text-yellow-700 bg-yellow-50 border-yellow-200", dot: "bg-yellow-500" },
  low:            { label: "Low confidence",    className: "text-orange-700 bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  "needs-review": { label: "Needs review",      className: "text-red-700 bg-red-50 border-red-200",         dot: "bg-red-500" },
};

// ─── Cover image with fallback chain ─────────────────────────────────────────

function CoverImage({ title, coverCandidates, coverUrl }: { title: string; coverCandidates: string[]; coverUrl: string | null }) {
  const [idx, setIdx] = useState(0);
  const candidates = coverCandidates.length ? coverCandidates : coverUrl ? [coverUrl] : [];

  if (!candidates.length) {
    return (
      <div className="w-20 h-28 rounded-md bg-muted border flex items-center justify-center flex-shrink-0">
        <BookOpen className="w-8 h-8 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={candidates[idx]}
      alt={title}
      className="w-20 h-28 object-cover rounded-md border flex-shrink-0"
      onError={() => { if (idx < candidates.length - 1) setIdx(i => i + 1); }}
    />
  );
}

// ─── Rule trace collapsible ───────────────────────────────────────────────────

function RuleTrace({ trace }: { trace: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-md overflow-hidden text-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted text-muted-foreground font-medium transition-colors"
      >
        <span>Rule trace</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-1 text-muted-foreground text-xs bg-background">
          <p><span className="font-semibold text-foreground">Tier source:</span> {trace.tierSource || "—"}</p>
          <p><span className="font-semibold text-foreground">Bin source:</span> {trace.binSource || "—"}</p>
          <p><span className="font-semibold text-foreground">Signals aligned:</span> {trace.signalsAligned}</p>
          {trace.usedAIFallback && (
            <p className="flex items-center gap-1 text-amber-600 font-medium">
              <Zap className="w-3 h-3" /> AI fallback was used
            </p>
          )}
          {trace.notes?.map((n: string, i: number) => (
            <p key={i} className="text-orange-600">⚠ {n}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── History sidebar item ─────────────────────────────────────────────────────

function HistoryItem({ book, classification, onSelect }: { book: any; classification: any; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-md hover:bg-muted transition-colors text-sm"
    >
      <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate text-foreground">{book.title}</p>
        <p className="text-xs text-muted-foreground">{classification.ageTier} · {classification.themeBin}</p>
      </div>
    </button>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function IsbnLookupPage() {
  const [isbnInput, setIsbnInput] = useState("");
  const [activeIsbn, setActiveIsbn] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ book: any; classification: any }>>([]);
  const [selected, setSelected] = useState<{ book: any; classification: any; fromCache?: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isFetching, error } = trpc.isbn.classify.useQuery(
    { isbn: activeIsbn! },
    {
      enabled: !!activeIsbn,
      retry: false,
      onSuccess: (result: any) => {
        setSelected(result);
        setHistory(h => [result, ...h.filter(r => r.book.isbn !== result.book.isbn)].slice(0, 20));
      },
      onError: (e: any) => {
        toast.error(e.message || "Lookup failed");
        setActiveIsbn(null);
      },
    }
  );

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const val = isbnInput.trim();
    if (!val) return;
    setSelected(null);
    setActiveIsbn(val);
  };

  const display = selected;

  return (
    <div className="flex h-full">
      {/* Sidebar history */}
      {history.length > 0 && (
        <aside className="hidden lg:flex flex-col w-52 border-r bg-muted/20 p-2 gap-0.5 overflow-y-auto shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1 mb-1">Recent</p>
          {history.map((r, i) => (
            <HistoryItem
              key={i}
              book={r.book}
              classification={r.classification}
              onSelect={() => {
                setSelected({ book: r.book, classification: r.classification });
                setIsbnInput(r.book.isbn);
              }}
            />
          ))}
        </aside>
      )}

      {/* Main content */}
      <main className="flex-1 p-6 max-w-2xl mx-auto space-y-5 overflow-y-auto">
        <div>
          <h1 className="text-2xl font-bold">ISBN Lookup</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Look up any book by ISBN to get its age tier, bin, and tags.</p>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            ref={inputRef}
            value={isbnInput}
            onChange={e => setIsbnInput(e.target.value)}
            placeholder="Enter ISBN (10 or 13 digits)…"
            className="flex-1"
            autoFocus
            disabled={isFetching}
          />
          <Button type="submit" disabled={isFetching || !isbnInput.trim()}>
            {isFetching ? (
              <span className="flex items-center gap-2"><span className="animate-spin">⏳</span> Looking up…</span>
            ) : (
              <span className="flex items-center gap-2"><Search className="w-4 h-4" /> Look up</span>
            )}
          </Button>
        </form>

        {/* Loading skeleton */}
        {isFetching && (
          <Card>
            <CardContent className="p-4 animate-pulse">
              <div className="flex gap-4">
                <div className="w-20 h-28 bg-muted rounded-md flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="h-4 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-1/4 mt-4" />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <div className="h-7 bg-muted rounded-full w-36" />
                <div className="h-7 bg-muted rounded-full w-24" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result */}
        {display && !isFetching && (
          <Card>
            <CardContent className="p-4 space-y-4">
              {/* Book header */}
              <div className="flex gap-4">
                <CoverImage title={display.book.title} coverCandidates={display.book.coverCandidates} coverUrl={display.book.coverUrl} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-lg leading-snug line-clamp-2">{display.book.title}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{display.book.authors.join(", ")}</p>
                  <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                    {display.book.pageCount && <span>{display.book.pageCount} pages</span>}
                    {display.book.publishedDate && <span>· {display.book.publishedDate.slice(0, 4)}</span>}
                    <span>· {display.book.sources.join(" + ")}</span>
                    {display.fromCache && <span className="text-blue-500">· cached</span>}
                  </div>
                  {display.book.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-3">{display.book.description}</p>
                  )}
                </div>
              </div>

              <div className="border-t pt-3 space-y-3">
                {/* Tier + Bin + Confidence */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={`${TIER_COLORS[display.classification.ageTier as AgeTier]} font-semibold`}>
                    {display.classification.ageTier} ({display.classification.ageTierRange})
                  </Badge>
                  <Badge className={`${BIN_COLORS[display.classification.themeBin as ThemeBin]}`}>
                    {display.classification.themeBin}
                  </Badge>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_CONFIG[display.classification.confidence as ConfidenceLevel].className}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_CONFIG[display.classification.confidence as ConfidenceLevel].dot}`} />
                    {CONFIDENCE_CONFIG[display.classification.confidence as ConfidenceLevel].label}
                  </span>
                </div>

                {/* Tags */}
                {display.classification.supportingTags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {display.classification.supportingTags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs font-normal">{tag}</Badge>
                    ))}
                  </div>
                )}

                {/* Reasoning */}
                <p className="text-xs text-muted-foreground italic">{display.classification.reasoning}</p>

                {/* Rule trace */}
                <RuleTrace trace={display.classification.trace} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Idle state */}
        {!display && !isFetching && (
          <div className="text-center text-muted-foreground py-16">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Enter an ISBN above to classify a book</p>
          </div>
        )}
      </main>
    </div>
  );
}