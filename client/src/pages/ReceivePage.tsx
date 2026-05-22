// BookNest Ops — Receive Books
// ISBN lookup uses trpc.isbn.classify to pre-fill age group, theme, and tags.

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  Search,
  Loader2,
  AlertCircle,
  RotateCcw,
  Pencil,
  X,
  Sparkles,
  Info,
  Tag,
  ClipboardCheck,
  Copy,
  Zap,
  ChevronDown,
  ChevronUp,
  Keyboard,
  ScanLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { useBarcodeScanner } from "@/components/useBarcodeScanner";
import {
  TAG_TAXONOMY,
  getCategoryForTag,
  buildBinName,
  type BinCategory,
} from "@/lib/tags";

const STEPS = ["Scan ISBN", "Confirm Details", "Theme & Tags", "Save"];

const TIER_TO_AGE_GROUP: Record<string, string> = {
  Hatchlings: "Hatchlings (0-2)",
  Fledglings: "Fledglings (3-5)",
  Soarers: "Soarers (6-8)",
  "Sky Readers": "Sky Readers (9-12)",
};

const BIN_TO_CATEGORY: Record<string, BinCategory> = {
  Adventure: "ADVENTURE",
  "Laughs & Chaos": "LAUGHS_CHAOS",
  "Heart & Home": "HEART_HOME",
  "Wonder & Imagination": "WONDER_IMAGINATION",
  "Wild & Wonderful": "WILD_WONDERFUL",
  "Discovery Den": "DISCOVERY_DEN",
  "Legends & Long Ago": "LEGENDS_LONG_AGO",
  "Seasons & Celebrations": "SEASONS_CELEBRATIONS",
};

const AGE_GROUPS = [
  "Hatchlings (0-2)",
  "Fledglings (3-5)",
  "Soarers (6-8)",
  "Sky Readers (9-12)",
];

const AGE_EMOJIS: Record<string, string> = {
  "Hatchlings (0-2)": "🐣",
  "Fledglings (3-5)": "🐦",
  "Soarers (6-8)": "🦅",
  "Sky Readers (9-12)": "🌟",
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

function getCategoryMeta(category: BinCategory) {
  return TAG_TAXONOMY.find((cat) => cat.id === category) ?? TAG_TAXONOMY[0];
}

function CoverImage({
  title,
  coverCandidates,
  coverUrl,
  size = "default",
}: {
  title: string;
  coverCandidates: string[];
  coverUrl: string | null;
  size?: "default" | "large";
}) {
  const [idx, setIdx] = useState(0);
  const candidates = coverCandidates?.length
    ? coverCandidates
    : coverUrl
      ? [coverUrl]
      : [];

  const sizeClass = size === "large" ? "w-28 h-40" : "w-24 h-32";

  if (!candidates.length) {
    return (
      <div
        className={cn(
          sizeClass,
          "rounded-2xl border border-border/70 flex flex-col items-center justify-center gap-1 shadow-sm"
        )}
        style={{ backgroundColor: "oklch(0.96 0.01 80)" }}
      >
        <BookOpen className="w-8 h-8 text-muted-foreground/50" />
        <span className="text-[10px] text-muted-foreground text-center px-2">
          No cover
        </span>
      </div>
    );
  }

  return (
    <img
      src={candidates[idx]}
      alt={title}
      className={cn(
        sizeClass,
        "object-cover rounded-2xl shadow-md border border-border/70 shrink-0"
      )}
      onError={() => {
        if (idx < candidates.length - 1) setIdx((i) => i + 1);
      }}
    />
  );
}

function BookSummaryCard({
  book,
  ageGroup,
  selectedCategory,
  selectedTags,
  currentBin,
  isTooOld,
}: {
  book: BookData | null;
  ageGroup: string;
  selectedCategory: BinCategory;
  selectedTags: string[];
  currentBin: string;
  isTooOld: boolean;
}) {
  const cat = getCategoryMeta(selectedCategory);

  if (!book) {
    return (
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "oklch(0.94 0.03 155)" }}
          >
            <BookOpen
              className="w-5 h-5"
              style={{ color: "oklch(0.42 0.11 155)" }}
            />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">
              Ready to receive
            </p>
            <p className="text-xs text-muted-foreground">
              Scan an ISBN to start.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="rounded-3xl border border-border/70 bg-card p-5 shadow-sm lg:sticky lg:top-6 space-y-4">
      <div className="flex gap-4">
        <CoverImage
          title={book.title}
          coverCandidates={book.coverCandidates}
          coverUrl={book.coverUrl}
          size="large"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Current book
            </p>
            <p className="text-base font-bold text-foreground leading-tight mt-1 line-clamp-3">
              {book.title}
            </p>
          
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {book.author}
            </p>
          </div>
{isTooOld && (
  <span
    className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-[10px] font-bold"
    style={{
      backgroundColor: "oklch(0.94 0.05 25)",
      color: "oklch(0.45 0.16 25)",
    }}
  >
    ⚠ Restricted / 13+
  </span>
)}
          {book.isbn && (
            <p className="text-[11px] text-muted-foreground font-mono">
              {book.isbn}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div
          className="rounded-2xl p-3"
          style={{ backgroundColor: "oklch(0.97 0.02 155)" }}
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Age
          </p>
          <p className="text-xs font-semibold mt-1 text-foreground">
            {AGE_EMOJIS[ageGroup]} {ageGroup || "Not set"}
          </p>
        </div>

        <div
          className="rounded-2xl p-3"
          style={{ backgroundColor: cat.color.bg }}
        >
          <p
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: cat.color.text }}
          >
            Theme
          </p>
          <p
            className="text-xs font-semibold mt-1"
            style={{ color: cat.color.text }}
          >
            {cat.emoji} {cat.label}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Tags
          </p>
          <span className="text-[10px] text-muted-foreground">
            {selectedTags.length}/7
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {selectedTags.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              No tags selected yet
            </span>
          ) : (
            selectedTags.slice(0, 7).map((tag) => {
              const tagCat = getCategoryForTag(tag);

              return (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                  style={{
                    backgroundColor: tagCat?.color.bg,
                    color: tagCat?.color.text,
                  }}
                >
                  {tagCat?.emoji} {tag}
                </span>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-border/60">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Shelf code
        </p>
        <p
          className="text-sm font-bold font-mono mt-1"
          style={{ color: "oklch(0.32 0.10 155)" }}
        >
          {currentBin}
        </p>
      </div>
    </aside>
  );
}

function TagSelector({
  selectedTags,
  onToggle,
  autoTags,
}: {
  selectedTags: string[];
  onToggle: (tag: string) => void;
  autoTags: string[];
}) {
  const [expandedCat, setExpandedCat] = useState<BinCategory | null>(null);
  const [search, setSearch] = useState("");

  const filteredTaxonomy = search.trim()
    ? TAG_TAXONOMY.map((cat) => ({
        ...cat,
        tags: cat.tags.filter((t) =>
          t.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((cat) => cat.tags.length > 0)
    : TAG_TAXONOMY;

  const applySuggestedTags = () => {
    autoTags.slice(0, 7).forEach((tag) => {
      if (!selectedTags.includes(tag)) onToggle(tag);
    });
  };

  return (
    <div className="space-y-4">
      {autoTags.length > 0 && (
        <div
          className="rounded-2xl p-4 text-xs leading-relaxed shadow-sm"
          style={{
            backgroundColor: "oklch(0.97 0.03 155)",
            color: "oklch(0.32 0.10 155)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <span className="font-semibold flex items-center gap-1.5">
              <Zap className="w-3 h-3" />
              Suggested tags
            </span>

            <button
              type="button"
              onClick={applySuggestedTags}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white border transition-colors hover:opacity-80"
              style={{
                borderColor: "oklch(0.85 0.06 155)",
                color: "oklch(0.32 0.10 155)",
              }}
            >
              Apply suggested tags
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {autoTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onToggle(tag)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium bg-white/80 border border-white transition hover:bg-white"
              >
                {selectedTags.includes(tag) ? (
                  <Check className="w-3 h-3" />
                ) : (
                  <span className="opacity-60">✦</span>
                )}
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-2xl p-4"
        style={{ backgroundColor: "oklch(0.985 0.006 80)" }}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
              Selected tags
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose up to 7 tags for matching and search.
            </p>
          </div>

          <span
            className="text-xs font-semibold"
            style={{ color: "oklch(0.42 0.11 155)" }}
          >
            {selectedTags.length}/7
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 min-h-8">
          {selectedTags.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              No tags selected yet.
            </span>
          ) : (
            selectedTags.map((tag) => {
              const cat = getCategoryForTag(tag);

              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onToggle(tag)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all hover:opacity-80"
                  style={{
                    backgroundColor: cat?.color.bg,
                    color: cat?.color.text,
                  }}
                >
                  {cat?.emoji} {tag}
                  <X className="w-3 h-3" />
                </button>
              );
            })
          )}
        </div>

        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={() => selectedTags.forEach((tag) => onToggle(tag))}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors mt-3"
          >
            Clear all tags
          </button>
        )}
      </div>
            <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all tags..."
          className="w-full pl-9 pr-4 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {filteredTaxonomy.map((cat) => {
          const isOpen = expandedCat === cat.id || !!search.trim();
          const selectedInCat = selectedTags.filter((tag) =>
            cat.tags.includes(tag)
          );

          return (
            <div
              key={cat.id}
              className="rounded-2xl overflow-hidden bg-card shadow-sm border border-border/60"
            >
              <button
                type="button"
                onClick={() => setExpandedCat(isOpen && !search ? null : cat.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40"
                style={{ backgroundColor: isOpen ? cat.color.bg : undefined }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{cat.emoji}</span>
                  <div>
                    <span
                      className="font-semibold text-sm"
                      style={{ color: cat.color.text }}
                    >
                      {cat.label}
                    </span>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {cat.tags.length} tags
                    </p>
                  </div>

                  {selectedInCat.length > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: cat.color.border,
                        color: cat.color.text,
                      }}
                    >
                      {selectedInCat.length}
                    </span>
                  )}
                </div>

                {!search &&
                  (isOpen ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ))}
              </button>

              {isOpen && (
                <div
                  className="px-4 pb-4 pt-2 flex flex-wrap gap-1.5"
                  style={{ backgroundColor: `${cat.color.bg}80` }}
                >
                  {cat.tags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    const isSuggested = autoTags.includes(tag);
                    const maxed = !isSelected && selectedTags.length >= 7;

                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => !maxed && onToggle(tag)}
                        disabled={maxed}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                          isSelected
                            ? "text-white border-transparent shadow-sm"
                            : maxed
                              ? "opacity-30 cursor-not-allowed border-border text-muted-foreground"
                              : "border-border/60 hover:border-current hover:shadow-sm"
                        )}
                        style={
                          isSelected
                            ? {
                                backgroundColor: cat.color.text,
                                borderColor: cat.color.text,
                              }
                            : {
                                color: cat.color.text,
                                backgroundColor: "white",
                              }
                        }
                      >
                        {isSuggested && !isSelected && (
                          <span className="mr-1 opacity-60">✦</span>
                        )}
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

      <p className="text-[10px] text-muted-foreground">
        ✦ = suggested tags
      </p>
    </div>
  );
}

function ThemePicker({
  ageGroup,
  suggestedCategory,
  selectedCategory,
  onSelectCategory,
  isManualOverride,
  onResetToAuto,
}: {
  ageGroup: string;
  suggestedCategory: BinCategory;
  selectedCategory: BinCategory;
  onSelectCategory: (cat: BinCategory) => void;
  isManualOverride: boolean;
  onResetToAuto: () => void;
}) {
  const selectedMeta = getCategoryMeta(selectedCategory);

  return (
    <div className="space-y-4">
      <div
        className="rounded-3xl p-5 shadow-sm"
        style={{
          backgroundColor: selectedMeta.color.bg,
          color: selectedMeta.color.text,
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold opacity-75">
              Assigned theme
            </p>

            <div className="flex items-center gap-2 mt-2">
              <span className="text-2xl">{selectedMeta.emoji}</span>
              <div>
                <p className="text-lg font-bold leading-none">
                  {selectedMeta.label}
                </p>
                <p className="text-xs font-mono mt-1 opacity-75">
                  {buildBinName(ageGroup, selectedCategory)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isManualOverride && (
              <button
                type="button"
                onClick={onResetToAuto}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/70 transition hover:bg-white"
              >
                Reset
              </button>
            )}

            {!isManualOverride && (
              <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-white/70">
                Suggested
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-foreground">
            Choose a different theme
          </h3>
          <span className="text-xs text-muted-foreground">
            Primary shelf category
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {TAG_TAXONOMY.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const isSuggested = suggestedCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className={cn(
                  "group p-4 rounded-2xl text-left transition-all border shadow-sm hover:-translate-y-0.5 hover:shadow-md",
                  isSelected
                    ? "border-current"
                    : "border-border/60 bg-card"
                )}
                style={
                  isSelected
                    ? {
                        borderColor: cat.color.text,
                        backgroundColor: cat.color.bg,
                      }
                    : {}
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0">{cat.emoji}</span>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-bold truncate"
                        style={{ color: cat.color.text }}
                      >
                        {cat.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                        {buildBinName(
                          ageGroup || "Fledglings (3-5)",
                          cat.id
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {isSuggested && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-white/80"
                        style={{ color: cat.color.text }}
                      >
                        Suggested
                      </span>
                    )}

                    {isSelected && (
                      <Check
                        className="w-4 h-4"
                        style={{ color: cat.color.text }}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ReceivePage() {
  const [step, setStep] = useState(0);
  const [isbnInput, setIsbnInput] = useState("");
  const [submittedIsbn, setSubmittedIsbn] = useState<string | null>(null);
  const [book, setBook] = useState<BookData | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [ageGroup, setAgeGroup] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [autoTags, setAutoTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] =
    useState<BinCategory>("HEART_HOME");
  const [suggestedCategory, setSuggestedCategory] =
    useState<BinCategory>("HEART_HOME");
  const [isManualCategoryOverride, setIsManualCategoryOverride] =
    useState(false);
  const [receivedCount, setReceivedCount] = useState(0);
  const [lastSku, setLastSku] = useState<string | null>(null);
  const [isbnCopied, setIsbnCopied] = useState(false);
  const [numpadMode, setNumpadMode] = useState(true);
  const [isTooOld, setIsTooOld] = useState(false);
  const [tooOldReason, setTooOldReason] = useState("");

  const [lookupId, setLookupId] = useState(0);

  const [, navigate] = useLocation();
  const isbnInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const currentBin = buildBinName(
    ageGroup || "Fledglings (3-5)",
    selectedCategory
  );

  const { open: openScanner, ScannerModal } = useBarcodeScanner({
  onScan: async (isbn) => {
    setIsbnInput(isbn);

    await utils.isbn.classify.invalidate({ isbn });

    setLookupId((id) => id + 1);

    setSubmittedIsbn(null);

    setTimeout(() => {
      setSubmittedIsbn(isbn);
    }, 0);
  },
});

  const classifyQuery = trpc.isbn.classify.useQuery(
  { isbn: submittedIsbn!, lookupId },
  {
    enabled: !!submittedIsbn && !isManualEntry,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  }
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

    const mappedAge =
      TIER_TO_AGE_GROUP[classification.ageTier] ?? "Fledglings (3-5)";

    setAgeGroup(mappedAge);
    setIsTooOld(classification.isTooOld ?? false);
    setTooOldReason(classification.tooOldReason ?? "");

    const mappedBin =
      BIN_TO_CATEGORY[classification.themeBin] ?? "HEART_HOME";

    setSelectedCategory(mappedBin);
    setSuggestedCategory(mappedBin);
    setIsManualCategoryOverride(false);

    setAutoTags(classification.supportingTags);
    setSelectedTags(classification.supportingTags.slice(0, 7));

    setStep(1);
  }, [classifyQuery.data]);

  useEffect(() => {
    if (classifyError) {
      toast.error(
        classifyError.message || "Lookup failed. Check the ISBN and try again."
      );
      setSubmittedIsbn(null);
    }
  }, [classifyError]);

  const { data: pendingLabels, refetch: refetchPendingCount } =
    trpc.labels.pending.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  const pendingCount = pendingLabels?.length ?? 0;
    const addBookMutation = trpc.receive.addBook.useMutation({
    onSuccess: (data) => {
      setLastSku(data.sku);

      toast.success(`✓ Book received — SKU: ${data.sku}`, {
        duration: 5000,
      });

      setReceivedCount((count) => count + 1);

      handleReset();
      refetchPendingCount();
    },

    onError: (err) =>
      toast.error(`Failed to save: ${err.message}`),
  });

  useEffect(() => {
    if (step === 0 && isbnInputRef.current) {
      isbnInputRef.current.focus();
    }
  }, [step]);

const handleScan = async (e: React.FormEvent) => {
  e.preventDefault();

  const val = isbnInput.trim();

  if (!val) return;

  await utils.isbn.classify.invalidate({ isbn: val });

  setSubmittedIsbn(null);

  setTimeout(() => {
    setLookupId((id) => id + 1);
    setSubmittedIsbn(val);
  }, 0);
};

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 7
          ? [...prev, tag]
          : prev
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
      page_count: book.pages
        ? parseInt(book.pages, 10) || undefined
        : undefined,
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
      title: "",
      author: "",
      isbn: isbnInput.trim().replace(/[^0-9X]/gi, ""),
      publisher: "",
      publishYear: "",
      pages: "",
      coverUrl: null,
      coverCandidates: [],
      subjects: [],
      openLibraryUrl: null,
    });

    setStep(1);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">

        <div className="page-header mb-0">
          <h1 className="page-title">Receive Books</h1>

          <p className="page-subtitle">
            Scan an ISBN to pull book details, suggest an age group, and organize inventory.
          </p>
        </div>

        <div className="flex flex-wrap lg:justify-end gap-2">

          {receivedCount > 0 && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{
                backgroundColor: "oklch(0.92 0.06 155)",
                color: "oklch(0.32 0.10 155)",
              }}
            >
              <Check className="w-3.5 h-3.5" />
              {receivedCount} received today
            </div>
          )}

          {lastSku && (
            <p className="text-xs text-muted-foreground font-mono self-center">
              Last SKU: {lastSku}
            </p>
          )}

          {pendingCount > 0 && (
            <button
              onClick={() => navigate("/labels")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:opacity-80"
              style={{
                backgroundColor: "oklch(0.97 0.04 75)",
                borderColor: "oklch(0.84 0.10 75)",
                color: "oklch(0.38 0.12 75)",
              }}
            >
              <Tag className="w-3 h-3" />
              {pendingCount} label{pendingCount !== 1 ? "s" : ""} pending
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-sm">
        <div className="flex items-center gap-0">

          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">

              <div className="flex flex-col items-center">

                <div
                  className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                    i <= step
                      ? "text-white"
                      : "bg-muted text-muted-foreground"
                  )}
                  style={
                    i <= step
                      ? { backgroundColor: "oklch(0.42 0.11 155)" }
                      : {}
                  }
                >
                  {i < step ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    i + 1
                  )}
                </div>

                <span
                  className={cn(
                    "text-[11px] mt-1 font-medium whitespace-nowrap",
                    i === step
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {s}
                </span>
              </div>

              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-px mb-4 mx-2 transition-colors"
                  style={{
                    backgroundColor:
                      i < step
                        ? "oklch(0.42 0.11 155)"
                        : "oklch(0.91 0.006 80)",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">

        <main className="space-y-6">

          {/* STEP 0 */}
          {step === 0 && (
            <div className="rounded-3xl bg-card border border-border/70 shadow-sm p-6 space-y-5">

              <div className="flex items-center gap-3">

                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "oklch(0.92 0.04 155)" }}
                >
                  <Search
                    className="w-5 h-5"
                    style={{ color: "oklch(0.42 0.11 155)" }}
                  />
                </div>

                <div>
                  <h2 className="font-semibold text-foreground">
                    Scan or enter ISBN
                  </h2>

                  <p className="text-xs text-muted-foreground">
                    ISBN-10 or ISBN-13 · details are suggested automatically.
                  </p>
                </div>
              </div>

              <form onSubmit={handleScan} className="space-y-4">

                <div className="flex items-center gap-2">

                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

                    <input
                      ref={isbnInputRef}
                      type={numpadMode ? "tel" : "text"}
                      inputMode={numpadMode ? "numeric" : "text"}
                      value={isbnInput}
                      onChange={(e) => setIsbnInput(e.target.value)}
                      placeholder="Enter ISBN…"
                      autoFocus
                      className="w-full pl-10 pr-4 py-3 rounded-2xl border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setNumpadMode((value) => !value)}
                    title={
                      numpadMode
                        ? "Switch to full keyboard"
                        : "Switch to numpad"
                    }
                    className="flex items-center justify-center w-12 h-12 rounded-2xl border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    {numpadMode ? (
                      <Keyboard className="w-4 h-4" />
                    ) : (
                      <span className="text-xs font-bold font-mono">
                        123
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={openScanner}
                    title="Scan barcode with camera"
                    className="flex items-center justify-center w-12 h-12 rounded-2xl text-white transition-colors shrink-0"
                    style={{
                      backgroundColor: "oklch(0.42 0.11 155)",
                    }}
                  >
                    <ScanLine className="w-4 h-4" />
                  </button>
                </div>

                {classifyError && (
                  <div
                    className="flex items-start gap-2.5 p-4 rounded-2xl"
                    style={{
                      backgroundColor: "oklch(0.97 0.04 25)",
                      color: "oklch(0.40 0.18 25)",
                    }}
                  >
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />

                    <div className="flex-1">
                      <p className="text-xs leading-relaxed">
                        {classifyError.message ||
                          "No book found for that ISBN."}
                      </p>

                      <button
                        type="button"
                        onClick={handleManualEntry}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors bg-white/80 hover:bg-white"
                        style={{
                          color: "oklch(0.35 0.10 75)",
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                        Enter details manually
                      </button>
                    </div>
                  </div>
                )}
                                <button
                  type="submit"
                  disabled={classifying || !isbnInput.trim()}
                  className="w-full py-3 rounded-2xl text-white font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-sm"
                  style={{
                    backgroundColor: "oklch(0.42 0.11 155)",
                  }}
                >
                  {classifying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Looking up book...
                    </>
                  ) : (
                    <>
                      <BookOpen className="w-4 h-4" />
                      Look up book
                    </>
                  )}
                </button>
              </form>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleManualEntry}
                  className="text-xs font-medium transition-colors hover:opacity-80 inline-flex items-center gap-1"
                  style={{
                    color: "oklch(0.42 0.11 155)",
                  }}
                >
                  <Pencil className="w-3 h-3" />
                  No ISBN? Enter details manually
                </button>
              </div>

              <ScannerModal />
            </div>
          )}

          {/* STEP 1: Confirm Details */}
          {step === 1 && book && !isManualEntry && (
            <div className="rounded-3xl bg-card border border-border/70 shadow-sm p-6 space-y-5">

              <div>
                <h2 className="font-semibold text-foreground">
                  Confirm book details
                </h2>

                <p className="text-sm text-muted-foreground mt-0.5">
                  Review the pulled metadata before choosing theme and tags.
                </p>
              </div>

              {isTooOld && (
                <div
                  className="flex items-start gap-3 p-4 rounded-2xl"
                  style={{
                    backgroundColor: "oklch(0.97 0.04 25)",
                  }}
                >
                  <AlertCircle
                    className="w-5 h-5 shrink-0 mt-0.5"
                    style={{
                      color: "oklch(0.50 0.18 25)",
                    }}
                  />

                  <div className="flex-1 space-y-3">
                    <div>
                      <p
  className="font-semibold text-sm"
  style={{ color: "oklch(0.35 0.18 25)" }}
>
  Restricted / Teen Content Detected
</p>

                      <div
  className="text-xs mt-1 space-y-1"
  style={{ color: "oklch(0.45 0.14 25)" }}
>
  <p>{tooOldReason}</p>

  <p>
    This title falls outside Book Nest age ranges and should
    not be included in member boxes.
  </p>
</div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          toast.info("Book marked for donation — scan next book.");
                          handleReset();
                        }}
                        className="flex-1 py-2 rounded-2xl text-sm font-semibold text-white transition-colors"
                        style={{
                          backgroundColor: "oklch(0.50 0.18 25)",
                        }}
                      >
                        Move to restricted inventory
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsTooOld(false);
                          toast.info("Overridden — verify age group manually.");
                        }}
                        className="flex-1 py-2 rounded-2xl text-sm font-semibold bg-white/70 transition-colors"
                        style={{
                          color: "oklch(0.40 0.18 25)",
                        }}
                      >
                        Override Manually
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div
                className="rounded-3xl p-5"
                style={{ backgroundColor: "oklch(0.985 0.006 80)" }}
              >
                <div className="flex gap-5">
                  <CoverImage
                    title={book.title}
                    coverCandidates={book.coverCandidates}
                    coverUrl={book.coverUrl}
                    size="large"
                  />

                  <div className="flex-1 min-w-0 space-y-4">

                    <div>
                      <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                        Title
                      </label>

                      <input
                        value={book.title}
                        onChange={(e) =>
                          setBook((prev) =>
                            prev && {
                              ...prev,
                              title: e.target.value,
                            }
                          )
                        }
                        className="w-full font-bold text-foreground text-lg leading-tight mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-1"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                        Author
                      </label>

                      <input
                        value={book.author}
                        onChange={(e) =>
                          setBook((prev) =>
                            prev && {
                              ...prev,
                              author: e.target.value,
                            }
                          )
                        }
                        className="w-full font-medium text-foreground text-sm mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-1"
                      />
                    </div>

                    <div className="grid sm:grid-cols-3 gap-4">

                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                          ISBN
                        </p>

                        <div className="flex items-center gap-1.5 mt-1">
                          <p className="font-mono text-xs text-foreground">
                            {book.isbn}
                          </p>

                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(book.isbn);
                              setIsbnCopied(true);
                              setTimeout(() => setIsbnCopied(false), 1500);
                            }}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          >
                            {isbnCopied ? (
                              <Check className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                          Pages
                        </label>

                        <input
                          value={book.pages}
                          onChange={(e) =>
                            setBook((prev) =>
                              prev && {
                                ...prev,
                                pages: e.target.value,
                              }
                            )
                          }
                          className="w-full text-sm text-foreground mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-1"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                          Published
                        </label>

                        <input
                          value={book.publishYear}
                          onChange={(e) =>
                            setBook((prev) =>
                              prev && {
                                ...prev,
                                publishYear: e.target.value,
                              }
                            )
                          }
                          className="w-full text-sm text-foreground mt-0.5 bg-transparent border-b border-border focus:border-foreground outline-none py-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="p-4 rounded-2xl text-xs space-y-2"
                style={{ backgroundColor: "oklch(0.97 0.03 155)" }}
              >
                <p
                  className="font-semibold flex items-center gap-1.5"
                  style={{ color: "oklch(0.32 0.10 155)" }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Suggested details — review before continuing
                </p>

                <div className="flex flex-wrap gap-2">
                  <span
                    className="px-2.5 py-1 rounded-full font-medium"
                    style={{
                      backgroundColor: "oklch(0.92 0.06 155)",
                      color: "oklch(0.28 0.10 155)",
                    }}
                  >
                    {AGE_EMOJIS[ageGroup]} {ageGroup}
                  </span>

                  {(() => {
                    const cat = getCategoryMeta(selectedCategory);

                    return (
                      <span
                        className="px-2.5 py-1 rounded-full font-medium"
                        style={{
                          backgroundColor: cat.color.bg,
                          color: cat.color.text,
                        }}
                      >
                        {cat.emoji} {cat.label}
                      </span>
                    );
                  })()}

                  {autoTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2.5 py-1 rounded-full bg-white/80 text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Scan again
                </button>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-2.5 rounded-2xl text-white text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "oklch(0.42 0.11 155)",
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}
                    {/* STEP 1: Manual Entry */}
          {step === 1 && book && isManualEntry && (
            <div className="rounded-3xl bg-card border border-border/70 shadow-sm p-6 space-y-5">

              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: "oklch(0.92 0.04 155)" }}
                >
                  <Pencil
                    className="w-5 h-5"
                    style={{ color: "oklch(0.42 0.11 155)" }}
                  />
                </div>

                <div>
                  <h2 className="font-semibold text-foreground">
                    Enter book details
                  </h2>

                  <p className="text-xs text-muted-foreground">
                    Title and author are required.
                  </p>
                </div>
              </div>

              <div className="space-y-3">

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                    Title *
                  </label>

                  <input
                    type="text"
                    value={book.title}
                    onChange={(e) =>
                      setBook({
                        ...book,
                        title: e.target.value,
                      })
                    }
                    placeholder="e.g. Where the Wild Things Are"
                    className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                    Author *
                  </label>

                  <input
                    type="text"
                    value={book.author}
                    onChange={(e) =>
                      setBook({
                        ...book,
                        author: e.target.value,
                      })
                    }
                    placeholder="e.g. Maurice Sendak"
                    className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                    ISBN
                  </label>

                  <input
                    type="text"
                    value={book.isbn}
                    onChange={(e) =>
                      setBook({
                        ...book,
                        isbn: e.target.value.replace(/[^0-9X]/gi, ""),
                      })
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">

                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                      Published
                    </label>

                    <input
                      type="text"
                      value={book.publishYear}
                      onChange={(e) =>
                        setBook({
                          ...book,
                          publishYear: e.target.value,
                        })
                      }
                      placeholder="Optional"
                      className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block mb-1">
                      Pages
                    </label>

                    <input
                      type="text"
                      value={book.pages}
                      onChange={(e) =>
                        setBook({
                          ...book,
                          pages: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="Optional"
                      className="w-full px-3 py-2.5 rounded-2xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2.5">
                  Age Group *
                </p>

                <div className="grid sm:grid-cols-2 gap-2">
                  {AGE_GROUPS.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setAgeGroup(group)}
                      className={cn(
                        "p-4 rounded-2xl text-left transition-all hover:shadow-sm border",
                        ageGroup === group
                          ? "border-primary"
                          : "border-border hover:border-primary/30"
                      )}
                      style={
                        ageGroup === group
                          ? {
                              borderColor: "oklch(0.42 0.11 155)",
                              backgroundColor: "oklch(0.96 0.04 155)",
                            }
                          : {}
                      }
                    >
                      <span className="text-xl mb-1 block">
                        {AGE_EMOJIS[group]}
                      </span>

                      <p className="font-semibold text-xs text-foreground">
                        {group.split(" (")[0]}
                      </p>

                      <p className="text-[10px] text-muted-foreground">
                        {group.match(/\(.*\)/)?.[0]}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="flex items-start gap-2.5 p-4 rounded-2xl"
                style={{
                  backgroundColor: "oklch(0.97 0.03 155)",
                  color: "oklch(0.32 0.10 155)",
                }}
              >
                <Info className="w-4 h-4 mt-0.5 shrink-0" />

                <p className="text-xs leading-relaxed">
                  Without an ISBN lookup, tags are selected manually in the next step.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Start over
                </button>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!book.title.trim() || !book.author.trim() || !ageGroup}
                  className="flex-1 py-2.5 rounded-2xl text-white text-sm font-medium transition-colors disabled:opacity-40"
                  style={{
                    backgroundColor: "oklch(0.42 0.11 155)",
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Theme & Tags */}
          {step === 2 && ageGroup && (
            <div className="rounded-3xl bg-card border border-border/70 shadow-sm p-6 space-y-6">

              <div>
                <h2 className="font-semibold text-foreground">
                  Theme & Tags
                </h2>

                <p className="text-sm text-muted-foreground mt-0.5">
                  Review the suggested classification, then adjust anything before saving.
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">
                  Age Group
                </p>

                <div className="flex flex-wrap gap-2">
                  {AGE_GROUPS.map((group) => (
                    <button
                      key={group}
                      type="button"
                      onClick={() => setAgeGroup(group)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                        ageGroup === group
                          ? "text-white"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      )}
                      style={
                        ageGroup === group
                          ? {
                              backgroundColor: "oklch(0.42 0.11 155)",
                              borderColor: "oklch(0.42 0.11 155)",
                            }
                          : {}
                      }
                    >
                      {AGE_EMOJIS[group]} {group.split(" (")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <ThemePicker
                ageGroup={ageGroup}
                suggestedCategory={suggestedCategory}
                selectedCategory={selectedCategory}
                onSelectCategory={(cat) => {
                  setSelectedCategory(cat);
                  setIsManualCategoryOverride(true);
                }}
                isManualOverride={isManualCategoryOverride}
                onResetToAuto={() => {
                  setSelectedCategory(suggestedCategory);
                  setIsManualCategoryOverride(false);
                }}
              />

              <div className="border-t border-border/60 pt-5">
                <h3 className="font-semibold text-sm text-foreground mb-3">
                  Tags
                </h3>

                <TagSelector
                  selectedTags={selectedTags}
                  onToggle={toggleTag}
                  autoTags={autoTags}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="flex-1 py-2.5 rounded-2xl text-white text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "oklch(0.42 0.11 155)",
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}
                    {/* STEP 3: Save */}
          {step === 3 && (
            <div className="rounded-3xl bg-card border border-border/70 shadow-sm p-6 space-y-5">

              <div>
                <h2 className="font-semibold text-foreground">
                  Save Book
                </h2>

                <p className="text-sm text-muted-foreground mt-0.5">
                  Final review before adding this copy to your intake queue.
                </p>
              </div>

              <div
                className="rounded-3xl p-5"
                style={{ backgroundColor: "oklch(0.985 0.006 80)" }}
              >
                <div className="flex gap-4">

                  {book && (
                    <CoverImage
                      title={book.title}
                      coverCandidates={book.coverCandidates}
                      coverUrl={book.coverUrl}
                      size="large"
                    />
                  )}

                  <div className="flex-1 min-w-0 space-y-3">

                    <div>
                      <p className="font-bold text-foreground leading-tight text-lg">
                        {book?.title}
                      </p>

                      <p className="text-sm text-muted-foreground mt-1">
                        {book?.author}
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
                      <p className="font-mono">{book?.isbn}</p>
                      <p>{ageGroup}</p>
                      {book?.pages && <p>{book.pages} pages</p>}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">
                  Tags
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {selectedTags.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                      No tags
                    </span>
                  ) : (
                    selectedTags.map((tag) => {
                      const cat = getCategoryForTag(tag);

                      return (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: cat?.color.bg,
                            color: cat?.color.text,
                          }}
                        >
                          {cat?.emoji} {tag}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              <div
                className="rounded-3xl p-5"
                style={{ backgroundColor: "oklch(0.97 0.03 155)" }}
              >
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                  Theme
                </p>

                <p
                  className="text-xl font-bold font-mono mt-1"
                  style={{ color: "oklch(0.32 0.10 155)" }}
                >
                  {currentBin}
                </p>

                {(() => {
                  const cat = getCategoryMeta(selectedCategory);

                  return (
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold mt-3"
                      style={{
                        backgroundColor: cat.color.bg,
                        color: cat.color.text,
                      }}
                    >
                      {cat.emoji} {cat.label}
                    </span>
                  );
                })()}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-2.5 rounded-2xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={addBookMutation.isPending}
                  className="flex-1 py-2.5 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                  style={{
                    backgroundColor: "oklch(0.42 0.11 155)",
                  }}
                >
                  {addBookMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save book
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Sidebar */}
        <BookSummaryCard
          book={book}
          ageGroup={ageGroup}
          selectedCategory={selectedCategory}
          selectedTags={selectedTags}
          currentBin={currentBin}
          isTooOld={isTooOld}
        />
      </div>

      {/* Label Queue Prompt */}
      {step === 0 && receivedCount > 0 && pendingCount > 0 && (
        <div
          className="rounded-3xl p-4 flex items-center justify-between gap-4 shadow-sm"
          style={{ backgroundColor: "oklch(0.97 0.04 75)" }}
        >
          <div className="flex items-center gap-3">

            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: "oklch(0.90 0.08 75)" }}
            >
              <Tag
                className="w-4 h-4"
                style={{ color: "oklch(0.45 0.14 75)" }}
              />
            </div>

            <div>
              <p
                className="text-sm font-semibold"
                style={{ color: "oklch(0.32 0.10 75)" }}
              >
                {pendingCount} label
                {pendingCount !== 1 ? "s" : ""} waiting to print
              </p>

              <p
                className="text-xs"
                style={{ color: "oklch(0.50 0.10 75)" }}
              >
                Including {receivedCount} just received this session
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate("/labels")}
            className="shrink-0 px-4 py-2 rounded-2xl text-sm font-semibold text-white transition-colors"
            style={{
              backgroundColor: "oklch(0.55 0.14 75)",
            }}
          >
            Go to Label Queue
          </button>
        </div>
      )}

      {/* QC Queue Prompt */}
      {receivedCount > 0 && (
        <div
          className="flex items-center gap-4 p-4 rounded-3xl shadow-sm"
          style={{ backgroundColor: "oklch(0.96 0.02 155)" }}
        >
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "oklch(0.88 0.06 155)" }}
          >
            <ClipboardCheck
              className="w-4 h-4"
              style={{ color: "oklch(0.38 0.12 155)" }}
            />
          </div>

          <div className="flex-1">
            <p
              className="text-sm font-semibold"
              style={{ color: "oklch(0.28 0.10 155)" }}
            >
              {receivedCount} book
              {receivedCount !== 1 ? "s" : ""} waiting for QC
            </p>

            <p
              className="text-xs"
              style={{ color: "oklch(0.45 0.08 155)" }}
            >
              Inspect, clean, and grade before shelving
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/qc")}
            className="shrink-0 px-4 py-2 rounded-2xl text-sm font-semibold text-white transition-colors"
            style={{
              backgroundColor: "oklch(0.42 0.11 155)",
            }}
          >
            Go to QC Queue
          </button>
        </div>
      )}
    </div>
  );
}