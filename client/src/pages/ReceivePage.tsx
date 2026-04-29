// BookNest Ops — Receive Books (merged with ISBN classifier)
// ISBN lookup now uses trpc.isbn.classify — pre-fills tier, bin, and tags from classifier

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  BookOpen, Check, Search, Loader2, AlertCircle, RotateCcw,
  Pencil, X, Sparkles, Info, Tag, ClipboardCheck, Copy, Zap,
  ChevronDown, ChevronUp, Keyboard, ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useBarcodeScanner } from "@/components/useBarcodeScanner";
import {
  TAG_TAXONOMY, getCategoryForTag, buildBinName,
  type BinCategory,
} from "@/lib/tags";

const STEPS = ["Scan ISBN", "Confirm Details", "Tags & Bin", "Confirm"];

const TIER_TO_AGE_GROUP: Record<string, string> = {
  "Hatchlings":  "Hatchlings (0-2)",
  "Fledglings":  "Fledglings (3-5)",
  "Soarers":     "Soarers (6-8)",
  "Sky Readers": "Sky Readers (9-12)",
};

const BIN_TO_CATEGORY: Record<string, BinCategory> = {
  Adventure: "ADVENTURE",
  Humor:     "HUMOR",
  Life:      "LIFE",
  Learn:     "LEARN",
  Identity:  "IDENTITY",
  Nature:    "NATURE",
  Seasonal:  "SEASONAL",
};

const AGE_GROUPS = ["Hatchlings (0-2)", "Fledglings (3-5)", "Soarers (6-8)", "Sky Readers (9-12)"];
const AGE_EMOJIS: Record<string, string> = {
  "Hatchlings (0-2)":  "🐣",
  "Fledglings (3-5)":  "🐦",
  "Soarers (6-8)":     "🦅",
  "Sky Readers (9-12)":"🌟",
};

interface BookData {
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  publishYear: string;
  pages: string;
  coverUrl: string | null;
  coverCandidates: string[];
  subjects: string[];
  openLibraryUrl: string | null;
}

// ─── COVER IMAGE with fallback chain ─────────────────────────────────────────

function CoverImage({ title, coverCandidates, coverUrl }: { title: string; coverCandidates: string[]; coverUrl: string | null }) {
  const [idx, setIdx] = useState(0);
  const candidates = coverCandidates?.length ? coverCandidates : coverUrl ? [coverUrl] : [];
  if (!candidates.length) {
    return (
      <div className="w-24 h-32 rounded-lg border border-border flex flex-col items-center justify-center gap-1"
        style={{ backgroundColor: "oklch(0.95 0.01 80)" }}>
        <BookOpen className="w-8 h-8 text-muted-foreground/50" />
        <span className="text-[10px] text-muted-foreground text-center px-1">No cover</span>
      </div>
    );
  }
  return (
    <img src={candidates[idx]} alt={title}
      className="w-24 h-32 object-cover rounded-lg shadow-md border border-border shrink-0"
      onError={() => { if (idx < candidates.length - 1) setIdx(i => i + 1); }}
    />
  );
}

// ─── TAG SELECTOR ─────────────────────────────────────────────────────────────

function TagSelector({
  selectedTags, onToggle, autoTags,
}: {
  selectedTags: string[]; onToggle: (tag: string) => void; autoTags: string[];
}) {
  const [expandedCat, setExpandedCat] = useState<BinCategory | null>(null);
  const [search, setSearch] = useState("");

  const filteredTaxonomy = search.trim()
    ? TAG_TAXONOMY.map(cat => ({ ...cat, tags: cat.tags.filter(t => t.toLowerCase().includes(search.toLowerCase())) })).filter(cat => cat.tags.length > 0)
    : TAG_TAXONOMY;

  return (
    <div className="space-y-3">
      {autoTags.length > 0 && (
        <div className="p-3 rounded-lg border text-xs leading-relaxed"
          style={{ backgroundColor: "oklch(0.97 0.03 155)", borderColor: "oklch(0.85 0.06 155)", color: "oklch(0.32 0.10 155)" }}>
          <span className="font-semibold flex items-center gap-1.5 mb-1"><Zap className="w-3 h-3" /> Classifier suggested tags:</span>
          {autoTags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 mr-1.5 px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.28 0.10 155)" }}>{t}</span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
        {selectedTags.length === 0
          ? <span className="text-xs text-muted-foreground italic">No tags selected — pick from categories below</span>
          : selectedTags.map(tag => {
              const cat = getCategoryForTag(tag);
              return (
                <button key={tag} onClick={() => onToggle(tag)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
                  style={{ backgroundColor: cat?.color.bg, color: cat?.color.text }}>
                  {cat?.emoji} {tag}<X className="w-3 h-3" />
                </button>
              );
            })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selectedTags.length}/4 tags selected
          {selectedTags.length >= 4 && <span className="ml-1 font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>(max)</span>}
        </span>
        {selectedTags.length > 0 && (
          <button onClick={() => selectedTags.forEach(t => onToggle(t))}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors">Clear all</button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search all tags..."
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {filteredTaxonomy.map(cat => {
          const isOpen = expandedCat === cat.id || !!search.trim();
          const selectedInCat = selectedTags.filter(t => cat.tags.includes(t));
          return (
            <div key={cat.id} className="rounded-xl border border-border overflow-hidden">
              <button onClick={() => setExpandedCat(isOpen && !search ? null : cat.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                style={{ backgroundColor: isOpen ? cat.color.bg : undefined }}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.emoji}</span>
                  <span className="font-semibold text-sm" style={{ color: cat.color.text }}>{cat.label}</span>
                  {selectedInCat.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ backgroundColor: cat.color.border, color: cat.color.text }}>{selectedInCat.length}</span>
                  )}
                </div>
                {!search && (isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />)}
              </button>
              {isOpen && (
                <div className="px-3 pb-3 pt-2 flex flex-wrap gap-1.5" style={{ backgroundColor: cat.color.bg + "80" }}>
                  {cat.tags.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    const isAuto = autoTags.includes(tag);
                    const maxed = !isSelected && selectedTags.length >= 4;
                    return (
                      <button key={tag} onClick={() => !maxed && onToggle(tag)} disabled={maxed}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                          isSelected ? "text-white border-transparent shadow-sm" : maxed ? "opacity-30 cursor-not-allowed border-border text-muted-foreground" : "border-border/60 hover:border-current hover:shadow-sm"
                        )}
                        style={isSelected ? { backgroundColor: cat.color.text, borderColor: cat.color.text } : { color: cat.color.text, backgroundColor: "white" }}>
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
      <p className="text-[10px] text-muted-foreground">✦ = suggested by classifier</p>
    </div>
  );
}

// ─── BIN OVERRIDE ─────────────────────────────────────────────────────────────

function BinOverride({
  ageGroup, suggestedCategory, selectedCategory, onSelectCategory, isManualOverride, onResetToAuto,
}: {
  ageGroup: string; suggestedCategory: BinCategory; selectedCategory: BinCategory;
  onSelectCategory: (cat: BinCategory) => void; isManualOverride: boolean; onResetToAuto: () => void;
}) {
  const [overriding, setOverriding] = useState(false);
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Assigned Bin</p>
          <div className="flex items-center gap-2">
            {isManualOverride && (
              <button onClick={() => { onResetToAuto(); setOverriding(false); }}
                className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                style={{ color: "oklch(0.52 0.12 260)" }}>
                <RotateCcw className="w-3 h-3" />Reset to auto
              </button>
            )}
            <button onClick={() => setOverriding(!overriding)}
              className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: "oklch(0.42 0.11 155)" }}>
              <Pencil className="w-3 h-3" />{overriding ? "Close" : "Override"}
            </button>
          </div>
        </div>
        <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>
          {buildBinName(ageGroup, selectedCategory)}
        </p>
        <div className="flex items-center gap-2">
          {(() => { const cat = TAG_TAXONOMY.find(c => c.id === selectedCategory); return cat ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>{cat.emoji} {cat.label}</span>
          ) : null; })()}
          {isManualOverride && <span className="text-xs text-muted-foreground italic">(manually overridden)</span>}
          {!isManualOverride && <span className="text-xs" style={{ color: "oklch(0.42 0.11 155)" }}>✓ from classifier</span>}
        </div>
      </div>
      {overriding && (
        <div className="rounded-xl border border-border p-4 space-y-3 bg-card">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select a different bin category</p>
          <div className="grid grid-cols-2 gap-2">
            {TAG_TAXONOMY.map(cat => {
              const isSelected = selectedCategory === cat.id;
              const isSuggested = suggestedCategory === cat.id;
              return (
                <button key={cat.id} onClick={() => { onSelectCategory(cat.id); setOverriding(false); }}
                  className={cn("p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm", isSelected ? "border-current" : "border-border hover:border-current/40")}
                  style={isSelected ? { borderColor: cat.color.text, backgroundColor: cat.color.bg } : {}}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm">{cat.emoji}</span>
                    <div className="flex items-center gap-1">
                      {isSuggested && <span className="text-[9px] px-1 rounded font-bold" style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>AUTO</span>}
                      {isSelected && <Check className="w-3.5 h-3.5" style={{ color: cat.color.text }} />}
                    </div>
                  </div>
                  <p className="text-xs font-semibold" style={{ color: cat.color.text }}>{cat.label}</p>
                  <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{buildBinName(ageGroup, cat.id)}</p>
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
  const [isbnInput, setIsbnInput] = useState("");
  const [submittedIsbn, setSubmittedIsbn] = useState<string | null>(null);
  const [book, setBook] = useState<BookData | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [ageGroup, setAgeGroup] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<BinCategory>("LIFE");
  const [suggestedCategory, setSuggestedCategory] = useState<BinCategory>("LIFE");
  const [isManualCategoryOverride, setIsManualCategoryOverride] = useState(false);
  const [receivedCount, setReceivedCount] = useState(0);
  const [lastSku, setLastSku] = useState<string | null>(null);
  const [isbnCopied, setIsbnCopied] = useState(false);
  const [numpadMode, setNumpadMode] = useState(true);
  const [, navigate] = useLocation();
  const isbnInputRef = useRef<HTMLInputElement>(null);
  const [isTooOld, setIsTooOld] = useState(false);      // ← ADD HERE
  const [tooOldReason, setTooOldReason] = useState(""); // ← ADD HERE

  // ── Barcode scanner ───────────────────────────────────────────────────────
  const { open: openScanner, ScannerModal } = useBarcodeScanner({
    onScan: (isbn) => {
      setIsbnInput(isbn);
      setSubmittedIsbn(isbn);
    },
  });

  // ── tRPC: ISBN classify ───────────────────────────────────────────────────
  const classifyQuery = trpc.isbn.classify.useQuery(
    { isbn: submittedIsbn! },
    { enabled: !!submittedIsbn && !isManualEntry, retry: false }
  );
  const { isFetching: classifying, error: classifyError } = classifyQuery;

  useEffect(() => {
    if (!classifyQuery.data) return;
    const { book: b, classification } = classifyQuery.data;

    setBook({
      title: b.title,
      author: b.authors.join(", "),
      isbn: b.isbn,
      publisher: "",
      publishYear: b.publishedDate?.slice(0, 4) ?? "",
      pages: b.pageCount ? String(b.pageCount) : "",
      coverUrl: b.coverUrl,
      coverCandidates: b.coverCandidates ?? [],
      subjects: b.categories ?? [],
      openLibraryUrl: null,
    });

    const mappedAge = TIER_TO_AGE_GROUP[classification.ageTier] ?? "Fledglings (3-5)";
    setAgeGroup(mappedAge);

    setIsTooOld(classification.isTooOld ?? false);
setTooOldReason(classification.tooOldReason ?? "");

    const mappedBin = BIN_TO_CATEGORY[classification.themeBin] ?? "LIFE";
    setSelectedCategory(mappedBin);
    setSuggestedCategory(mappedBin);
    setIsManualCategoryOverride(false);

    setAutoTags(classification.supportingTags);
    setSelectedTags(classification.supportingTags.slice(0, 4));

    setStep(1);
  }, [classifyQuery.data]);

  useEffect(() => {
    if (classifyError) {
      toast.error(classifyError.message || "Lookup failed. Check the ISBN and try again.");
      setSubmittedIsbn(null);
    }
  }, [classifyError]);

  // ── tRPC: pending labels ──────────────────────────────────────────────────
  const { data: pendingLabels, refetch: refetchPendingCount } = trpc.labels.pending.useQuery(
    undefined, { refetchOnWindowFocus: false }
  );
  const pendingCount = pendingLabels?.length ?? 0;

  // ── tRPC: add book ────────────────────────────────────────────────────────
  const addBookMutation = trpc.receive.addBook.useMutation({
    onSuccess: (data) => {
      setLastSku(data.sku);
      toast.success(`✓ Book received — SKU: ${data.sku}`, { duration: 5000 });
      setReceivedCount(c => c + 1);
      handleReset();
      refetchPendingCount();
    },
    onError: (err) => toast.error("Failed to save: " + err.message),
  });

  useEffect(() => {
    if (step === 0 && isbnInputRef.current) isbnInputRef.current.focus();
  }, [step]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    const val = isbnInput.trim();
    if (!val) return;
    setSubmittedIsbn(val);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 4 ? [...prev, tag] : prev
    );
  };

  const handleConfirm = () => {
    if (!book) return;
    addBookMutation.mutate({
      isbn: book.isbn.trim() || `MANUAL-${Date.now()}`,
      title: book.title,
      author: book.author,
      cover_url: book.coverUrl ?? undefined,
      published_date: book.publishYear || undefined,
      page_count: book.pages ? parseInt(book.pages, 10) || undefined : undefined,
      subjects: book.subjects,
      age_group: ageGroup,
      bin_id: buildBinName(ageGroup, selectedCategory),
      condition: "good",
      tags: selectedTags,
    });
  };

  const handleReset = () => {
    setStep(0);
    setIsbnInput("");
    setSubmittedIsbn(null);
    setBook(null);
    setAgeGroup("");
    setSelectedTags([]);
    setAutoTags([]);
    setIsManualEntry(false);
    setIsManualCategoryOverride(false);
    setIsTooOld(false);
setTooOldReason("");
  };

  const handleManualEntry = () => {
    setIsManualEntry(true);
    setSubmittedIsbn(null);
    setBook({
      title: "", author: "",
      isbn: isbnInput.trim().replace(/[^0-9X]/gi, ""),
      publisher: "", publishYear: "", pages: "",
      coverUrl: null, coverCandidates: [], subjects: [], openLibraryUrl: null,
    });
    setStep(1);
  };

  const currentBin = buildBinName(ageGroup || "Fledglings (3-5)", selectedCategory);

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Receive Books</h1>
          <p className="page-subtitle">Scan an ISBN — tier, bin, and tags auto-fill from the classifier</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {receivedCount > 0 && (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.32 0.10 155)" }}>
                <Check className="w-3.5 h-3.5" />{receivedCount} received today
              </div>
              {lastSku && <p className="text-xs text-muted-foreground font-mono">Last SKU: {lastSku}</p>}
            </>
          )}
          {pendingCount > 0 && (
            <button onClick={() => navigate("/labels")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80"
              style={{ backgroundColor: "oklch(0.97 0.04 75)", borderColor: "oklch(0.84 0.10 75)", color: "oklch(0.38 0.12 75)" }}>
              <Tag className="w-3 h-3" />{pendingCount} label{pendingCount !== 1 ? "s" : ""} pending
            </button>
          )}
        </div>
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
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "oklch(0.92 0.04 155)" }}>
              <Search className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Scan or Enter ISBN</h2>
              <p className="text-xs text-muted-foreground">ISBN-10 or ISBN-13 · tier, bin & tags auto-fill</p>
            </div>
          </div>

          <form onSubmit={handleScan} className="space-y-3">
            {/* ISBN input + keyboard toggle + camera button */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={isbnInputRef}
                  type={numpadMode ? "tel" : "text"}
                  inputMode={numpadMode ? "numeric" : "text"}
                  value={isbnInput}
                  onChange={e => setIsbnInput(e.target.value)}
                  placeholder="Enter ISBN…"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {/* Keyboard/numpad toggle */}
              <button
                type="button"
                onClick={() => setNumpadMode(v => !v)}
                title={numpadMode ? "Switch to full keyboard" : "Switch to numpad"}
                className="flex items-center justify-center w-11 h-11 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
              >
                {numpadMode
                  ? <Keyboard className="w-4 h-4" />
                  : <span className="text-xs font-bold font-mono">123</span>}
              </button>

              {/* Live camera scan button */}
              <button
                type="button"
                onClick={openScanner}
                title="Scan barcode with camera"
                className="flex items-center justify-center w-11 h-11 rounded-lg text-white transition-colors flex-shrink-0"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                <ScanLine className="w-4 h-4" />
              </button>
            </div>

            {classifyError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border"
                style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.88 0.08 25)", color: "oklch(0.40 0.18 25)" }}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs leading-relaxed">{classifyError.message || "No book found for that ISBN."}</p>
                  <button type="button" onClick={handleManualEntry}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
                    style={{ backgroundColor: "oklch(0.97 0.03 75)", borderColor: "oklch(0.84 0.08 75)", color: "oklch(0.35 0.10 75)" }}>
                    <Pencil className="w-3 h-3" />Enter Details Manually
                  </button>
                </div>
              </div>
            )}

            <button type="submit" disabled={classifying || !isbnInput.trim()}
              className="w-full py-3 rounded-lg text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {classifying
                ? <><Loader2 className="w-4 h-4 animate-spin" />Classifying…</>
                : <><BookOpen className="w-4 h-4" />Look Up & Classify</>}
            </button>
          </form>

          <div className="text-center">
            <button type="button" onClick={handleManualEntry}
              className="text-xs font-medium transition-colors hover:opacity-80 inline-flex items-center gap-1"
              style={{ color: "oklch(0.42 0.11 155)" }}>
              <Pencil className="w-3 h-3" />No ISBN? Enter details manually
            </button>
          </div>

          {/* Camera scanner modal */}
          <ScannerModal />
        </div>
      )}

     {/* ── STEP 1: Confirm Details ── */}
{step === 1 && book && !isManualEntry && (
  <div className="bg-card rounded-xl border border-border p-6 space-y-5">
    <h2 className="font-semibold text-foreground">Confirm Book Details</h2>

    {/* Too Old Warning */}
    {isTooOld && (
      <div className="flex items-start gap-3 p-4 rounded-xl border-2"
        style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.75 0.18 25)" }}>
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "oklch(0.50 0.18 25)" }} />
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-semibold text-sm" style={{ color: "oklch(0.35 0.18 25)" }}>
              ⚠️ This book may be outside your age range (13+)
            </p>
            <p className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.14 25)" }}>
              {tooOldReason}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                toast.info("Book marked for donation — scan next book.");
                handleReset();
              }}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "oklch(0.50 0.18 25)" }}
            >
              Donate Out
            </button>
            <button
              onClick={() => {
                setIsTooOld(false);
                toast.info("Overridden — verify age group manually.");
              }}
              className="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-colors"
              style={{ borderColor: "oklch(0.75 0.18 25)", color: "oklch(0.40 0.18 25)" }}
            >
              Override — Keep It
            </button>
          </div>
        </div>
      </div>
    )}

    <div className="flex gap-5">
      <div className="shrink-0">
        <CoverImage title={book.title} coverCandidates={book.coverCandidates} coverUrl={book.coverUrl} />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Title</label>
          <input value={book.title} onChange={e => setBook(prev => prev && ({ ...prev, title: e.target.value }))}
            className="w-full font-bold text-foreground text-base leading-tight mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-0.5" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Author</label>
          <input value={book.author} onChange={e => setBook(prev => prev && ({ ...prev, author: e.target.value }))}
            className="w-full font-medium text-foreground text-sm mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-0.5" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">ISBN</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="font-mono text-xs text-foreground">{book.isbn}</p>
              <button onClick={() => { navigator.clipboard.writeText(book.isbn); setIsbnCopied(true); setTimeout(() => setIsbnCopied(false), 1500); }}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                {isbnCopied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Pages</label>
            <input value={book.pages} onChange={e => setBook(prev => prev && ({ ...prev, pages: e.target.value }))}
              className="w-full text-sm text-foreground mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-0.5" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Published</label>
            <input value={book.publishYear} onChange={e => setBook(prev => prev && ({ ...prev, publishYear: e.target.value }))}
              className="w-full text-sm text-foreground mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-0.5" />
          </div>
        </div>
      </div>
    </div>

    {/* Classifier pre-fills summary */}
    <div className="p-3 rounded-lg border text-xs space-y-1.5"
      style={{ backgroundColor: "oklch(0.97 0.03 155)", borderColor: "oklch(0.85 0.06 155)" }}>
      <p className="font-semibold flex items-center gap-1.5" style={{ color: "oklch(0.32 0.10 155)" }}>
        <Sparkles className="w-3.5 h-3.5" />Classifier results — edit in next step if needed
      </p>
      <div className="flex flex-wrap gap-2">
        <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.28 0.10 155)" }}>
          {AGE_EMOJIS[ageGroup]} {ageGroup}
        </span>
        {(() => { const cat = TAG_TAXONOMY.find(c => c.id === selectedCategory); return cat ? (
          <span className="px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>
            {cat.emoji} {cat.label}
          </span>
        ) : null; })()}
        {autoTags.map(t => (
          <span key={t} className="px-2 py-0.5 rounded-full border border-border text-muted-foreground">{t}</span>
        ))}
      </div>
    </div>

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
      {/* ── STEP 1: Manual Entry ── */}
      {step === 1 && book && isManualEntry && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "oklch(0.92 0.04 155)" }}>
              <Pencil className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Enter Book Details</h2>
              <p className="text-xs text-muted-foreground">Title and author are required</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Title *</label>
              <input type="text" value={book.title} onChange={e => setBook({ ...book, title: e.target.value })}
                placeholder="e.g. Where the Wild Things Are"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Author *</label>
              <input type="text" value={book.author} onChange={e => setBook({ ...book, author: e.target.value })}
                placeholder="e.g. Maurice Sendak"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">ISBN</label>
              <input type="text" value={book.isbn} onChange={e => setBook({ ...book, isbn: e.target.value.replace(/[^0-9X]/gi, "") })}
                placeholder="Optional"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Published</label>
                <input type="text" value={book.publishYear} onChange={e => setBook({ ...book, publishYear: e.target.value })}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">Pages</label>
                <input type="text" value={book.pages} onChange={e => setBook({ ...book, pages: e.target.value.replace(/\D/g, "") })}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </div>
            </div>
          </div>

          {/* Age group selection for manual entry */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2.5">Age Group *</p>
            <div className="grid grid-cols-2 gap-2">
              {AGE_GROUPS.map(ag => (
                <button key={ag} onClick={() => setAgeGroup(ag)}
                  className={cn("p-3 rounded-xl border-2 text-left transition-all hover:shadow-sm",
                    ageGroup === ag ? "border-primary" : "border-border hover:border-primary/30")}
                  style={ageGroup === ag ? { borderColor: "oklch(0.42 0.11 155)", backgroundColor: "oklch(0.96 0.04 155)" } : {}}>
                  <span className="text-xl mb-1 block">{AGE_EMOJIS[ag]}</span>
                  <p className="font-semibold text-xs text-foreground">{ag.split(" (")[0]}</p>
                  <p className="text-[10px] text-muted-foreground">{ag.match(/\(.*\)/)?.[0]}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-lg border"
            style={{ backgroundColor: "oklch(0.97 0.03 155)", borderColor: "oklch(0.85 0.06 155)", color: "oklch(0.32 0.10 155)" }}>
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed">Without an ISBN lookup, tags won't be auto-suggested — you'll pick them manually in the next step.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={handleReset}
              className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />Start Over
            </button>
            <button onClick={() => setStep(2)}
              disabled={!book.title.trim() || !book.author.trim() || !ageGroup}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Tags & Bin ── */}
      {step === 2 && ageGroup && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-foreground">Tags & Bin Assignment</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {autoTags.length > 0
                ? "Tags pre-filled from classifier. Override anything below."
                : "Select tags manually — no classifier data available."}
            </p>
          </div>

          {/* Age group override */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Age Group</p>
            <div className="flex flex-wrap gap-2">
              {AGE_GROUPS.map(ag => (
                <button key={ag} onClick={() => setAgeGroup(ag)}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all",
                    ageGroup === ag ? "border-primary text-white" : "border-border text-muted-foreground hover:border-primary/40")}
                  style={ageGroup === ag ? { backgroundColor: "oklch(0.42 0.11 155)", borderColor: "oklch(0.42 0.11 155)" } : {}}>
                  {AGE_EMOJIS[ag]} {ag.split(" (")[0]}
                </button>
              ))}
            </div>
          </div>

          <TagSelector selectedTags={selectedTags} onToggle={toggleTag} autoTags={autoTags} />

          <div className="border-t border-border/60 pt-4">
            <h3 className="font-semibold text-sm text-foreground mb-3">Bin Assignment</h3>
            <BinOverride
              ageGroup={ageGroup}
              suggestedCategory={suggestedCategory}
              selectedCategory={selectedCategory}
              onSelectCategory={(cat) => { setSelectedCategory(cat); setIsManualCategoryOverride(true); }}
              isManualOverride={isManualCategoryOverride}
              onResetToAuto={() => { setSelectedCategory(suggestedCategory); setIsManualCategoryOverride(false); }}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">← Back</button>
            <button onClick={() => setStep(3)}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Confirm ── */}
      {step === 3 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Confirm Receipt</h2>

          <div className="flex gap-4 p-4 rounded-xl border border-border/60" style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
            {book && (
              <CoverImage title={book.title} coverCandidates={book.coverCandidates} coverUrl={book.coverUrl} />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground leading-tight">{book?.title}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{book?.author}</p>
              <p className="text-xs text-muted-foreground mt-1 font-mono">{book?.isbn}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ageGroup}</p>
              {book?.pages && <p className="text-xs text-muted-foreground">{book.pages} pages</p>}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.length === 0
                ? <span className="text-xs text-muted-foreground italic">No tags</span>
                : selectedTags.map(tag => {
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

          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Bin</p>
            <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>{currentBin}</p>
            {(() => { const cat = TAG_TAXONOMY.find(c => c.id === selectedCategory); return cat ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ backgroundColor: cat.color.bg, color: cat.color.text }}>{cat.emoji} {cat.label}</span>
            ) : null; })()}
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setStep(2)}
              className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">← Back</button>
            <button onClick={handleConfirm} disabled={addBookMutation.isPending}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {addBookMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                : <><Check className="w-4 h-4" />Confirm Receipt</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom shortcuts ── */}
      {step === 0 && receivedCount > 0 && pendingCount > 0 && (
        <div className="rounded-xl border p-4 flex items-center justify-between gap-4"
          style={{ backgroundColor: "oklch(0.97 0.04 75)", borderColor: "oklch(0.84 0.10 75)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "oklch(0.90 0.08 75)" }}>
              <Tag className="w-4 h-4" style={{ color: "oklch(0.45 0.14 75)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "oklch(0.32 0.10 75)" }}>{pendingCount} label{pendingCount !== 1 ? "s" : ""} waiting to print</p>
              <p className="text-xs" style={{ color: "oklch(0.50 0.10 75)" }}>Including {receivedCount} just received this session</p>
            </div>
          </div>
          <button onClick={() => navigate("/labels")}
            className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "oklch(0.55 0.14 75)" }}>
            Go to Label Queue →
          </button>
        </div>
      )}

      {receivedCount > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-xl border"
          style={{ backgroundColor: "oklch(0.96 0.02 155)", borderColor: "oklch(0.85 0.05 155)" }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "oklch(0.88 0.06 155)" }}>
            <ClipboardCheck className="w-4 h-4" style={{ color: "oklch(0.38 0.12 155)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "oklch(0.28 0.10 155)" }}>{receivedCount} book{receivedCount !== 1 ? "s" : ""} waiting for QC</p>
            <p className="text-xs" style={{ color: "oklch(0.45 0.08 155)" }}>Inspect, clean, and grade before shelving</p>
          </div>
          <button onClick={() => navigate("/qc")}
            className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
            Go to QC Queue →
          </button>
        </div>
      )}
    </div>
  );
}