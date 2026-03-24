// BookNest Ops — Receive Books (multi-step wizard with live ISBN lookup)
// Design: Warm Linen Artisan Light — forest green primary, warm linen bg
// ISBN API: Open Library (https://openlibrary.org/api/books?bibkeys=ISBN:...&format=json&jscmd=data)

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Search, Loader2, AlertCircle, RotateCcw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Scan ISBN", "Confirm Details", "Age Group", "Tags", "Confirm Bin"];

const ageGroups = ["Hatchlings (0-2)", "Fledglings (3-5)", "Soarers (6-8)", "Sky Readers (9-12)"];

const tagsByAge: Record<string, string[]> = {
  "Hatchlings (0-2)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal"],
  "Fledglings (3-5)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
  "Soarers (6-8)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
  "Sky Readers (9-12)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
};

const ageGroupPrefix: Record<string, string> = {
  "Hatchlings (0-2)": "HATC",
  "Fledglings (3-5)": "FLED",
  "Soarers (6-8)": "SOAR",
  "Sky Readers (9-12)": "SKY",
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
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, "");
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Network error");

  const data = await res.json();
  const key = `ISBN:${cleanIsbn}`;
  const book = data[key];

  if (!book) throw new Error("NOT_FOUND");

  const author =
    book.authors?.map((a: { name: string }) => a.name).join(", ") || "Unknown Author";

  const publisher =
    book.publishers?.map((p: { name: string }) => p.name).join(", ") || "Unknown Publisher";

  const coverUrl =
    book.cover?.large ||
    book.cover?.medium ||
    book.cover?.small ||
    null;

  const subjects: string[] = (book.subjects || [])
    .slice(0, 8)
    .map((s: { name?: string } | string) => (typeof s === "string" ? s : s.name || ""))
    .filter(Boolean);

  return {
    title: book.title || "Unknown Title",
    author,
    isbn: cleanIsbn,
    publisher,
    publishYear: book.publish_date || "—",
    pages: book.number_of_pages ? String(book.number_of_pages) : "—",
    coverUrl,
    subjects,
    openLibraryUrl: book.url || null,
  };
}

export default function ReceivePage() {
  const [step, setStep] = useState(0);
  const [isbn, setIsbn] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [book, setBook] = useState<BookData | null>(null);
  const [ageGroup, setAgeGroup] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bin, setBin] = useState("");
  const [receivedCount, setReceivedCount] = useState(0);
  const isbnInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus ISBN input on step 0
  useEffect(() => {
    if (step === 0 && isbnInputRef.current) {
      isbnInputRef.current.focus();
    }
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
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg === "NOT_FOUND") {
        setLookupError("No book found for that ISBN. Check the number and try again, or enter details manually.");
      } else {
        setLookupError("Could not reach the book database. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAgeGroup = (ag: string) => {
    setAgeGroup(ag);
    const prefix = ageGroupPrefix[ag] || "FLED";
    // Use first selected tag or default to LIFE
    const topicBin = selectedTags[0]?.toUpperCase() || "LIFE";
    setBin(`${prefix}-${topicBin}-01`);
    setStep(3);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : prev.length < 3 ? [...prev, tag] : prev
    );
  };

  const updateBin = (tags: string[], ag: string) => {
    const prefix = ageGroupPrefix[ag] || "FLED";
    const topicBin = tags[0]?.toUpperCase() || "LIFE";
    setBin(`${prefix}-${topicBin}-01`);
  };

  const handleConfirm = () => {
    toast.success(`✓ ${book?.title} received → ${bin}`, { duration: 4000 });
    setReceivedCount(c => c + 1);
    // Reset for next scan
    setStep(0);
    setIsbn("");
    setBook(null);
    setAgeGroup("");
    setSelectedTags([]);
    setBin("");
    setLookupError(null);
  };

  const handleReset = () => {
    setStep(0);
    setIsbn("");
    setBook(null);
    setAgeGroup("");
    setSelectedTags([]);
    setBin("");
    setLookupError(null);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Receive Books</h1>
          <p className="page-subtitle">Scan or enter an ISBN — book details auto-fill from Open Library</p>
        </div>
        {receivedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.32 0.10 155)" }}>
            <Check className="w-3.5 h-3.5" />
            {receivedCount} received today
          </div>
        )}
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                i < step ? "text-white" : i === step ? "text-white" : "bg-muted text-muted-foreground"
              )} style={i <= step ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn(
                "text-[10px] mt-1 font-medium whitespace-nowrap",
                i === step ? "text-foreground" : "text-muted-foreground"
              )}>{s}</span>
            </div>
            {i < steps.length - 1 && (
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
              <input
                ref={isbnInputRef}
                type="text"
                value={isbn}
                onChange={e => { setIsbn(e.target.value); setLookupError(null); }}
                placeholder="e.g. 9780061124952 or 0061124958"
                autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            {lookupError && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg border"
                style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.88 0.08 25)", color: "oklch(0.40 0.18 25)" }}>
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-xs leading-relaxed">{lookupError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isbn.trim()}
              className="w-full py-3 rounded-lg text-white font-medium text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Looking up ISBN…
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" />
                  Look Up Book
                </>
              )}
            </button>
          </form>

          <div className="pt-1 border-t border-border/60">
            <p className="text-xs text-muted-foreground text-center leading-relaxed">
              Book data is pulled live from{" "}
              <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors">
                Open Library
              </a>
              {" "}— title, author, publisher, page count, and cover art are auto-filled.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 1: Confirm Details ── */}
      {step === 1 && book && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Confirm Book Details</h2>

          {/* Book card with cover */}
          <div className="flex gap-5">
            {/* Cover Art */}
            <div className="shrink-0">
              {book.coverUrl ? (
                <img
                  src={book.coverUrl}
                  alt={`Cover of ${book.title}`}
                  className="w-24 h-32 object-cover rounded-lg shadow-md border border-border"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <div className="w-24 h-32 rounded-lg border border-border flex flex-col items-center justify-center gap-1"
                  style={{ backgroundColor: "oklch(0.95 0.01 80)" }}>
                  <BookOpen className="w-8 h-8 text-muted-foreground/50" />
                  <span className="text-[10px] text-muted-foreground text-center px-1">No cover</span>
                </div>
              )}
            </div>

            {/* Details */}
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

          {/* Subjects from Open Library */}
          {book.subjects.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Subjects (from Open Library)</p>
              <div className="flex flex-wrap gap-1.5">
                {book.subjects.map(s => (
                  <span key={s} className="px-2 py-0.5 rounded-full text-xs border border-border text-muted-foreground bg-muted/50">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Open Library link */}
          {book.openLibraryUrl && (
            <a href={book.openLibraryUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ExternalLink className="w-3 h-3" />
              View on Open Library
            </a>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={handleReset}
              className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              <RotateCcw className="w-3.5 h-3.5" />
              Scan Again
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
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-foreground">Select Age Group</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Which nest does <strong>{book?.title}</strong> belong in?</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {ageGroups.map(ag => {
              const emojis: Record<string, string> = {
                "Hatchlings (0-2)": "🐣",
                "Fledglings (3-5)": "🐦",
                "Soarers (6-8)": "🦅",
                "Sky Readers (9-12)": "🌟",
              };
              return (
                <button
                  key={ag}
                  onClick={() => handleAgeGroup(ag)}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all hover:shadow-sm",
                    ageGroup === ag ? "border-primary" : "border-border hover:border-primary/40"
                  )}
                  style={ageGroup === ag ? { borderColor: "oklch(0.42 0.11 155)", backgroundColor: "oklch(0.97 0.03 155)" } : {}}
                >
                  <span className="text-2xl mb-1 block">{emojis[ag]}</span>
                  <p className="font-semibold text-sm text-foreground">{ag.split(" (")[0]}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{ag.match(/\(.*\)/)?.[0]}</p>
                </button>
              );
            })}
          </div>
          <button onClick={() => setStep(1)}
            className="w-full py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
            ← Back
          </button>
        </div>
      )}

      {/* ── STEP 3: Tags ── */}
      {step === 3 && ageGroup && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div>
            <h2 className="font-semibold text-foreground">Select Tags</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose up to 3 tags for <strong>{book?.title}</strong>
              {selectedTags.length > 0 && (
                <span className="ml-2 text-xs" style={{ color: "oklch(0.42 0.11 155)" }}>
                  ({selectedTags.length}/3 selected)
                </span>
              )}
            </p>
          </div>

          {/* Hint from Open Library subjects */}
          {book && book.subjects.length > 0 && (
            <div className="p-3 rounded-lg text-xs"
              style={{ backgroundColor: "oklch(0.97 0.03 155)", color: "oklch(0.35 0.10 155)" }}>
              <span className="font-semibold">Open Library suggests: </span>
              {book.subjects.slice(0, 4).join(", ")}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {(tagsByAge[ageGroup] || []).map(tag => (
              <button
                key={tag}
                onClick={() => {
                  const next = selectedTags.includes(tag)
                    ? selectedTags.filter(t => t !== tag)
                    : selectedTags.length < 3 ? [...selectedTags, tag] : selectedTags;
                  setSelectedTags(next);
                  updateBin(next, ageGroup);
                }}
                disabled={!selectedTags.includes(tag) && selectedTags.length >= 3}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                  selectedTags.includes(tag)
                    ? "text-white border-transparent"
                    : selectedTags.length >= 3
                    ? "border-border text-muted-foreground/40 cursor-not-allowed"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
                style={selectedTags.includes(tag) ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
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

      {/* ── STEP 4: Confirm Bin ── */}
      {step === 4 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Confirm Bin Assignment</h2>

          {/* Book summary with cover */}
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
            </div>
          </div>

          {/* Bin assignment */}
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Suggested Bin</p>
            <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>{bin}</p>
            <p className="text-sm text-muted-foreground">{ageGroup} · {selectedTags.join(", ")}</p>
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
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              <Check className="w-4 h-4" />
              Confirm Receipt
            </button>
          </div>
        </div>
      )}

      {/* Batch tip */}
      {step === 0 && receivedCount === 0 && (
        <div className="text-center text-xs text-muted-foreground">
          After each book is received, the scanner auto-resets for fast batch processing.
        </div>
      )}
    </div>
  );
}
