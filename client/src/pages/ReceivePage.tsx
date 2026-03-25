// BookNest Ops — Receive Books (multi-step wizard with live ISBN lookup + smart tag matching + age inference)
// Design: Warm Linen Artisan Light — forest green primary, warm linen bg

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  BookOpen, Check, Search, Loader2, AlertCircle, RotateCcw,
  ExternalLink, ChevronDown, ChevronUp, Pencil, X, Sparkles, Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import {
  TAG_TAXONOMY, autoAssignTags, getCategoryForTag, buildBinName,
  type BinCategory, type TagCategory
} from "@/lib/tags";
import {
  inferAgeGroup, AGE_GROUP_INFO,
  type AgeGroupKey, type AgeInferenceResult
} from "@/lib/ageInference";

const STEPS = ["Scan ISBN", "Confirm Details", "Age Group", "Tags & Bin", "Confirm"];

const AGE_GROUPS = ["Hatchlings (0-2)", "Fledglings (3-5)", "Soarers (6-8)", "Sky Readers (9-12)"];
const AGE_EMOJIS: Record<string, string> = {
  "Hatchlings (0-2)": "🐣",
  "Fledglings (3-5)": "🐦",
  "Soarers (6-8)": "🦅",
  "Sky Readers (9-12)": "🌟",
};

const CONFIDENCE_COLORS = {
  high:   { bg: "oklch(0.96 0.04 155)", border: "oklch(0.82 0.09 155)", text: "oklch(0.30 0.12 155)", badge: "oklch(0.42 0.11 155)" },
  medium: { bg: "oklch(0.97 0.05 80)",  border: "oklch(0.84 0.10 80)",  text: "oklch(0.38 0.12 75)",  badge: "oklch(0.55 0.14 75)"  },
  low:    { bg: "oklch(0.97 0.02 260)", border: "oklch(0.85 0.05 260)", text: "oklch(0.38 0.08 260)", badge: "oklch(0.52 0.12 260)" },
};

interface BookData {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  publishYear: string;
  pages: string;
  coverUrl: string | null;
  subjects: string[];
  openLibraryUrl: string | null;
}

async function lookupISBN(isbn: string): Promise<BookData> {
  const clean = isbn.replace(/[^0-9X]/gi, "");
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("NETWORK");
  const data = await res.json();
  const key = `ISBN:${clean}`;
  const book = data[key];
  if (!book) throw new Error("NOT_FOUND");

  return {
    title: book.title || "Unknown Title",
    author: book.authors?.map((a: { name: string }) => a.name).join(", ") || "Unknown Author",
    isbn: clean,
    publisher: book.publishers?.map((p: { name: string }) => p.name).join(", ") || "Unknown",
    publishYear: book.publish_date || "—",
    pages: book.number_of_pages ? String(book.number_of_pages) : "—",
    coverUrl: book.cover?.large || book.cover?.medium || book.cover?.small || null,
    subjects: (book.subjects || []).slice(0, 12).map((s: { name?: string } | string) =>
      typeof s === "string" ? s : s.name || "").filter(Boolean),
    openLibraryUrl: book.url || null,
  };
}

// ─── TAG SELECTOR COMPONENT ───────────────────────────────────────────────────

function TagSelector({
  selectedTags,
  onToggle,
  autoTags,
  subjects,
}: {
  selectedTags: string[];
  onToggle: (tag: string) => void;
  autoTags: string[];
  subjects: string[];
}) {
  const [expandedCat, setExpandedCat] = useState<BinCategory | null>(null);
  const [search, setSearch] = useState("");

  const filteredTaxonomy = search.trim()
    ? TAG_TAXONOMY.map(cat => ({
        ...cat,
        tags: cat.tags.filter(t => t.toLowerCase().includes(search.toLowerCase())),
      })).filter(cat => cat.tags.length > 0)
    : TAG_TAXONOMY;

  return (
    <div className="space-y-3">
      {/* Auto-assigned banner */}
      {autoTags.length > 0 && (
        <div className="p-3 rounded-lg border text-xs leading-relaxed"
          style={{ backgroundColor: "oklch(0.97 0.03 155)", borderColor: "oklch(0.85 0.06 155)", color: "oklch(0.32 0.10 155)" }}>
          <span className="font-semibold">Auto-matched from Open Library subjects:</span>{" "}
          {subjects.slice(0, 5).join(", ")}
          <br />
          <span className="font-semibold mt-1 block">Suggested tags:</span>{" "}
          {autoTags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 mr-1.5 px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.28 0.10 155)" }}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Selected tags summary */}
      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {selectedTags.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">No tags selected yet — pick from categories below</span>
        ) : selectedTags.map(tag => {
          const cat = getCategoryForTag(tag);
          return (
            <button key={tag} onClick={() => onToggle(tag)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
              style={{ backgroundColor: cat?.color.bg, color: cat?.color.text }}>
              {cat?.emoji} {tag}
              <X className="w-3 h-3" />
            </button>
          );
        })}
      </div>

      {/* Tag count indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selectedTags.length}/4 tags selected
          {selectedTags.length >= 4 && <span className="ml-1 font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>(max reached)</span>}
        </span>
        {selectedTags.length > 0 && (
          <button onClick={() => selectedTags.forEach(t => onToggle(t))}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors">
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search all tags..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      </div>

      {/* Category accordion */}
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {filteredTaxonomy.map(cat => {
          const isOpen = expandedCat === cat.id || !!search.trim();
          const selectedInCat = selectedTags.filter(t => cat.tags.includes(t));
          return (
            <div key={cat.id} className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setExpandedCat(isOpen && !search ? null : cat.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                style={{ backgroundColor: isOpen ? cat.color.bg : undefined }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.emoji}</span>
                  <span className="font-semibold text-sm" style={{ color: cat.color.text }}>{cat.label}</span>
                  {selectedInCat.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: cat.color.border, color: cat.color.text }}>
                      {selectedInCat.length}
                    </span>
                  )}
                </div>
                {!search && (isOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-wrap gap-1.5"
                  style={{ backgroundColor: cat.color.bg + "80" }}>
                  {cat.tags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    const isAuto = autoTags.includes(tag);
                    const maxed = !isSelected && selectedTags.length >= 4;
                    return (
                      <button key={tag} onClick={() => !maxed && onToggle(tag)}
                        disabled={maxed}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                          isSelected
                            ? "text-white border-transparent shadow-sm"
                            : maxed
                            ? "opacity-30 cursor-not-allowed border-border text-muted-foreground"
                            : "border-border/60 hover:border-current hover:shadow-sm"
                        )}
                        style={isSelected
                          ? { backgroundColor: cat.color.text, borderColor: cat.color.text }
                          : { color: cat.color.text, backgroundColor: "white" }
                        }
                        title={isAuto ? "Auto-matched from Open Library" : undefined}
                      >
                        {isAuto && !isSelected && <span className="mr-1 opacity-60">✦</span>}
                        {tag}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">✦ = auto-matched from Open Library subjects</p>
    </div>
  );
}

// ─── BIN OVERRIDE COMPONENT ───────────────────────────────────────────────────

function BinOverride({
  ageGroup,
  suggestedCategory,
  selectedCategory,
  onSelectCategory,
  categoryScores,
}: {
  ageGroup: string;
  suggestedCategory: BinCategory;
  selectedCategory: BinCategory;
  onSelectCategory: (cat: BinCategory) => void;
  categoryScores: Record<BinCategory, number>;
}) {
  const [overriding, setOverriding] = useState(false);
  const maxScore = Math.max(...Object.values(categoryScores), 1);

  return (
    <div className="space-y-3">
      {/* Current bin display */}
      <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Assigned Bin</p>
          <button onClick={() => setOverriding(!overriding)}
            className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: "oklch(0.42 0.11 155)" }}>
            <Pencil className="w-3 h-3" />
            {overriding ? "Close" : "Override"}
          </button>
        </div>
        <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>
          {buildBinName(ageGroup, selectedCategory)}
        </p>
        <div className="flex items-center gap-2">
          {(() => {
            const cat = TAG_TAXONOMY.find(c => c.id === selectedCategory);
            return cat ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>
                {cat.emoji} {cat.label}
              </span>
            ) : null;
          })()}
          {selectedCategory !== suggestedCategory && (
            <span className="text-xs text-muted-foreground italic">(manually overridden)</span>
          )}
          {selectedCategory === suggestedCategory && (
            <span className="text-xs" style={{ color: "oklch(0.42 0.11 155)" }}>✓ auto-suggested</span>
          )}
        </div>
      </div>

      {/* Override panel */}
      {overriding && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Select a different bin category
          </p>
          <div className="grid grid-cols-2 gap-2">
            {TAG_TAXONOMY.map(cat => {
              const score = categoryScores[cat.id] || 0;
              const pct = Math.round((score / maxScore) * 100);
              const isSelected = selectedCategory === cat.id;
              const isSuggested = suggestedCategory === cat.id;
              return (
                <button key={cat.id} onClick={() => { onSelectCategory(cat.id); setOverriding(false); }}
                  className={cn(
                    "p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm",
                    isSelected ? "border-current" : "border-border hover:border-current/40"
                  )}
                  style={isSelected ? { borderColor: cat.color.text, backgroundColor: cat.color.bg } : {}}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm">{cat.emoji}</span>
                    <div className="flex items-center gap-1">
                      {isSuggested && <span className="text-[9px] px-1 rounded font-bold"
                        style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>AUTO</span>}
                      {isSelected && <Check className="w-3.5 h-3.5" style={{ color: cat.color.text }} />}
                    </div>
                  </div>
                  <p className="text-xs font-semibold" style={{ color: cat.color.text }}>{cat.label}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {buildBinName(ageGroup, cat.id)}
                  </p>
                  {/* Confidence bar */}
                  {score > 0 && (
                    <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: cat.color.text }} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ReceivePage() {
  const [step, setStep] = useState(0);
  const [isbn, setIsbn] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [book, setBook] = useState<BookData | null>(null);
  const [ageGroup, setAgeGroup] = useState("");
  const [ageInference, setAgeInference] = useState<AgeInferenceResult | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<BinCategory>("LIFE");
  const [suggestedCategory, setSuggestedCategory] = useState<BinCategory>("LIFE");
  const [categoryScores, setCategoryScores] = useState<Record<BinCategory, number>>({
    ADVENTURE: 0, HUMOR: 0, LIFE: 0, LEARN: 0,
    IDENTITY: 0, NATURE: 0, SEASONAL: 0, CLASSICS: 0,
  });
  const [receivedCount, setReceivedCount] = useState(0);
  const [lastSku, setLastSku] = useState<string | null>(null);
  const isbnInputRef = useRef<HTMLInputElement>(null);

  const addBookMutation = trpc.receive.addBook.useMutation({
    onSuccess: (data) => {
      setLastSku(data.sku);
      toast.success(`✓ Book received — SKU: ${data.sku}`, { duration: 5000 });
      setReceivedCount(c => c + 1);
      setStep(0);
      setIsbn("");
      setBook(null);
      setAgeGroup("");
      setSelectedTags([]);
      setAutoTags([]);
      setLookupError(null);
      setAgeInference(null);
    },
    onError: (err) => {
      toast.error("Failed to save: " + err.message);
    },
  });

  useEffect(() => {
    if (step === 0 && isbnInputRef.current) isbnInputRef.current.focus();
  }, [step]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = isbn.trim();
    if (!trimmed) return;
    setLoading(true);
    setLookupError(null);
    try {
      const found = await lookupISBN(trimmed);
      setBook(found);
      setStep(1);
      toast.success(`Found: ${found.title}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      setLookupError(msg === "NOT_FOUND"
        ? "No book found for that ISBN. Check the number and try again."
        : "Could not reach the book database. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // Run age inference when we arrive at step 2
  useEffect(() => {
    if (step === 2 && book) {
      const result = inferAgeGroup({
        subjects: book.subjects,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        pages: book.pages,
      });
      setAgeInference(result);
    }
  }, [step, book]);

  const handleAgeGroup = (ag: string) => {
    setAgeGroup(ag);
    // Run auto-tag matching when age group is selected
    if (book) {
      const result = autoAssignTags(book.subjects, book.title, book.author);
      setAutoTags(result.suggestedTags);
      setSelectedTags(result.suggestedTags.slice(0, 4));
      setSuggestedCategory(result.suggestedCategory);
      setSelectedCategory(result.suggestedCategory);
      setCategoryScores(result.categoryScores);
    }
    setStep(3);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 4 ? [...prev, tag] : prev
    );
  };

  const handleConfirm = () => {
    if (!book) return;
    const bin = buildBinName(ageGroup, selectedCategory);
    addBookMutation.mutate({
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      cover_url: book.coverUrl ?? undefined,
      publisher: book.publisher !== "Unknown" ? book.publisher : undefined,
      published_date: book.publishYear !== "—" ? book.publishYear : undefined,
      page_count: book.pages !== "—" ? parseInt(book.pages, 10) || undefined : undefined,
      subjects: book.subjects,
      age_group: ageGroup,
      bin_id: bin,
      condition: "good",
      tags: selectedTags,
    });
  };

  const handleReset = () => {
    setStep(0);
    setIsbn("");
    setBook(null);
    setAgeGroup("");
    setSelectedTags([]);
    setAutoTags([]);
    setLookupError(null);
    setAgeInference(null);
  };

  const currentBin = buildBinName(ageGroup || "Fledglings (3-5)", selectedCategory);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Receive Books</h1>
          <p className="page-subtitle">ISBN auto-fills details · subjects auto-match to your tag taxonomy</p>
        </div>
        {receivedCount > 0 && (
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.32 0.10 155)" }}>
              <Check className="w-3.5 h-3.5" />
              {receivedCount} received today
            </div>
            {lastSku && (
              <p className="text-xs text-muted-foreground font-mono">Last SKU: {lastSku}</p>
            )}
          </div>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                i < step ? "text-white" : i === step ? "text-white" : "bg-muted text-muted-foreground"
              )} style={i <= step ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn("text-[10px] mt-1 font-medium whitespace-nowrap",
                i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-px mb-4 mx-1 transition-colors"
                style={{ backgroundColor: i < step ? "oklch(0.42 0.11 155)" : "oklch(0.91 0.006 80)" }} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP 0: Scan ISBN ── */}
      {step === 0 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "oklch(0.92 0.04 155)" }}>
              <Search className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Scan or Enter ISBN</h2>
              <p className="text-xs text-muted-foreground">ISBN-10 or ISBN-13 accepted</p>
            </div>
          </div>
          <form onSubmit={handleScan} className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input ref={isbnInputRef} type="text" value={isbn}
                onChange={e => { setIsbn(e.target.value); setLookupError(null); }}
                placeholder="e.g. 9780061124952 or 0061124958"
                autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            {lookupError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border"
                style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.88 0.08 25)", color: "oklch(0.40 0.18 25)" }}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed">{lookupError}</p>
              </div>
            )}
            <button type="submit" disabled={loading || !isbn.trim()}
              className="w-full py-3 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Looking up ISBN…</> : <><BookOpen className="w-4 h-4" />Look Up Book</>}
            </button>
          </form>
          <p className="text-xs text-muted-foreground text-center">
            Powered by{" "}
            <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground">Open Library</a>
            {" "}— title, author, cover, and subjects auto-fill.
          </p>
        </div>
      )}

      {/* ── STEP 1: Confirm Details ── */}
      {step === 1 && book && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Confirm Book Details</h2>
          <div className="flex gap-5">
            <div className="shrink-0">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title}
                  className="w-24 h-32 object-cover rounded-lg shadow-md border border-border"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-24 h-32 rounded-lg border border-border flex flex-col items-center justify-center gap-1"
                  style={{ backgroundColor: "oklch(0.95 0.01 80)" }}>
                  <BookOpen className="w-8 h-8 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground text-center px-1">No cover</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Title</p>
                <p className="font-bold text-foreground text-base leading-tight mt-0.5">{book.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Author</p>
                <p className="font-medium text-foreground text-sm mt-0.5">{book.author}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">ISBN</p>
                  <p className="font-mono text-xs text-foreground mt-0.5">{book.isbn}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pages</p>
                  <p className="text-sm text-foreground mt-0.5">{book.pages}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Publisher</p>
                  <p className="text-xs text-foreground mt-0.5 truncate">{book.publisher}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Published</p>
                  <p className="text-sm text-foreground mt-0.5">{book.publishYear}</p>
                </div>
              </div>
            </div>
          </div>
          {book.subjects.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">
                Open Library Subjects <span className="normal-case font-normal">(used for tag matching)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {book.subjects.map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs border border-border text-muted-foreground bg-muted/50">{s}</span>
                ))}
              </div>
            </div>
          )}
          {book.openLibraryUrl && (
            <a href={book.openLibraryUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="w-3 h-3" />View on Open Library
            </a>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={handleReset}
              className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />Scan Again
            </button>
            <button onClick={() => setStep(2)}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Confirm & Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Age Group ── */}
      {step === 2 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-foreground">Select Age Group</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tags will be auto-matched after you select the nest for <strong>{book?.title}</strong>
            </p>
          </div>

          {/* ── AI Recommendation Card ── */}
          {ageInference && (() => {
            const rec = AGE_GROUP_INFO.find(g => g.key === ageInference.recommended)!;
            const colors = CONFIDENCE_COLORS[ageInference.confidence];
            return (
              <div className="rounded-xl border-2 p-4 space-y-3"
                style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0" style={{ color: colors.badge }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.text }}>
                      Smart Recommendation
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: colors.badge }}>
                    {ageInference.confidence} confidence
                  </span>
                </div>

                {/* Recommended tier */}
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{rec.emoji}</span>
                  <div>
                    <p className="font-bold text-lg leading-tight" style={{ color: colors.text }}>
                      {rec.label}
                    </p>
                    <p className="text-sm" style={{ color: colors.text, opacity: 0.75 }}>Ages {rec.range}</p>
                  </div>
                  {/* Confidence bar */}
                  <div className="ml-auto text-right">
                    <p className="text-2xl font-bold" style={{ color: colors.badge }}>
                      {ageInference.confidencePct}%
                    </p>
                    <p className="text-[10px] uppercase tracking-wide" style={{ color: colors.text, opacity: 0.6 }}>match</p>
                  </div>
                </div>

                {/* Score bars for all tiers */}
                <div className="space-y-1.5">
                  {AGE_GROUP_INFO.map(g => {
                    const score = ageInference.scores[g.key];
                    const maxScore = Math.max(...Object.values(ageInference.scores), 1);
                    const pct = Math.round((score / maxScore) * 100);
                    const isTop = g.key === ageInference.recommended;
                    return (
                      <div key={g.key} className="flex items-center gap-2">
                        <span className="text-sm w-4">{g.emoji}</span>
                        <span className="text-xs w-20 shrink-0" style={{ color: colors.text, fontWeight: isTop ? 700 : 400 }}>
                          {g.label}
                        </span>
                        <div className="flex-1 h-1.5 rounded-full" style={{ backgroundColor: "oklch(0.88 0.02 80)" }}>
                          <div className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: isTop ? colors.badge : "oklch(0.75 0.04 80)",
                            }} />
                        </div>
                        <span className="text-[10px] w-6 text-right" style={{ color: colors.text, opacity: 0.6 }}>{score}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Reasons */}
                {ageInference.reasons.length > 0 && (
                  <div className="pt-1 border-t" style={{ borderColor: colors.border }}>
                    <div className="flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: colors.badge }} />
                      <ul className="space-y-0.5">
                        {ageInference.reasons.map((r, i) => (
                          <li key={i} className="text-xs" style={{ color: colors.text, opacity: 0.85 }}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* One-click accept button */}
                <button
                  onClick={() => handleAgeGroup(rec.displayLabel)}
                  className="w-full py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ backgroundColor: colors.badge }}>
                  <Check className="w-4 h-4" />
                  Use {rec.emoji} {rec.label} — Accept Recommendation
                </button>
              </div>
            );
          })()}

          {/* Manual override grid */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2.5">
              {ageInference ? "Or choose manually:" : "Select a nest tier:"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {AGE_GROUPS.map(ag => {
                const info = AGE_GROUP_INFO.find(g => g.displayLabel === ag)!;
                const isRecommended = ageInference?.recommended === info?.key;
                return (
                  <button key={ag} onClick={() => handleAgeGroup(ag)}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left transition-all hover:shadow-sm",
                      isRecommended ? "border-primary/40" : "border-border hover:border-primary/30"
                    )}>
                    <div className="flex items-start justify-between">
                      <span className="text-2xl mb-1 block">{AGE_EMOJIS[ag]}</span>
                      {isRecommended && (
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>AI Pick</span>
                      )}
                    </div>
                    <p className="font-semibold text-sm text-foreground">{ag.split(" (")[0]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ag.match(/\(.*\)/)?.[0]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => setStep(1)}
            className="w-full py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            ← Back
          </button>
        </div>
      )}

      {/* ── STEP 3: Tags & Bin ── */}
      {step === 3 && ageGroup && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-foreground">Tags & Bin Assignment</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tags auto-matched from Open Library subjects. Override any tag or bin below.
            </p>
          </div>

          <TagSelector
            selectedTags={selectedTags}
            onToggle={toggleTag}
            autoTags={autoTags}
            subjects={book?.subjects || []}
          />

          <div className="border-t border-border/60 pt-4">
            <h3 className="font-semibold text-sm text-foreground mb-3">Bin Assignment</h3>
            <BinOverride
              ageGroup={ageGroup}
              suggestedCategory={suggestedCategory}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              categoryScores={categoryScores}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setStep(2)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              ← Back
            </button>
            <button onClick={() => setStep(4)} disabled={selectedTags.length === 0}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Confirm ── */}
      {step === 4 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Confirm Receipt</h2>

          {/* Book summary */}
          <div className="flex gap-4 p-4 rounded-xl border border-border/60"
            style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
            {book?.coverUrl && (
              <img src={book.coverUrl} alt={book.title}
                className="w-14 h-20 object-cover rounded-md shadow-sm border border-border shrink-0"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground leading-tight">{book?.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{book?.author}</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{book?.isbn}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ageGroup}</p>
            </div>
          </div>

          {/* Tags */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map(tag => {
                const cat = getCategoryForTag(tag);
                return (
                  <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: cat?.color.bg, color: cat?.color.text }}>
                    {cat?.emoji} {tag}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Bin */}
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Bin</p>
            <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>
              {currentBin}
            </p>
            {(() => {
              const cat = TAG_TAXONOMY.find(c => c.id === selectedCategory);
              return cat ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>
                  {cat.emoji} {cat.label}
                </span>
              ) : null;
            })()}
          </div>

          <div className="text-sm space-y-2 border-t border-border/60 pt-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Publisher</span>
              <span className="font-medium text-right max-w-xs truncate">{book?.publisher}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Published</span>
              <span className="font-medium">{book?.publishYear}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pages</span>
              <span className="font-medium">{book?.pages}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              ← Back
            </button>
            <button onClick={handleConfirm}
              disabled={addBookMutation.isPending}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {addBookMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                : <><Check className="w-4 h-4" /> Confirm Receipt</>}
            </button>
          </div>
        </div>
      )}

      {step === 0 && receivedCount === 0 && (
        <p className="text-center text-xs text-muted-foreground">
          After each book is received, the scanner auto-resets for fast batch processing.
        </p>
      )}
    </div>
  );
}
