// BookNest Ops — Inventory Snapshot
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search, BookOpen, RefreshCw, XCircle, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookDetailDrawer } from "@/components/BookDetailDrawer";

const AGE_FILTER_OPTIONS = [
  { label: "Hatchlings", value: "hatchlings" },
  { label: "Fledglings", value: "fledglings" },
  { label: "Soarers", value: "soarers" },
  { label: "Sky Readers", value: "sky_readers" },
];

const THEME_FILTER_OPTIONS = [
  "Adventure",
  "Laughs & Chaos",
  "Heart & Home",
  "Wonder & Imagination",
  "Wild & Wonderful",
  "Discovery Den",
  "Legends & Long Ago",
  "Seasons & Celebrations",
];

function normalizeAge(age: string | null | undefined) {
  return (age ?? "").toLowerCase().replace(/\s+/g, "_");
}

function formatAgeTier(age: string | null | undefined) {
  if (!age) return "—";

  const normalized = age.toLowerCase().replace(/_/g, " ");

  if (normalized.includes("hatchlings")) return "Hatchlings (0-2)";
  if (normalized.includes("fledglings")) return "Fledglings (3-5)";
  if (normalized.includes("soarers")) return "Soarers (6-8)";
  if (normalized.includes("sky readers")) return "Sky Readers (9-12)";
  if (normalized.includes("13")) return "13+";

  return age;
}

function ThemeBadge({ theme }: { theme: string | null | undefined }) {
  if (!theme) {
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
      <Sparkles className="w-3 h-3" />
      {theme}
    </span>
  );
}

function TagPreview({
  tags,
}: {
  tags?: { id: string; bin_theme: string; tag: string }[] | null;
}) {
  if (!tags || tags.length === 0) {
    return <span className="text-xs text-muted-foreground/50">—</span>;
  }

  const shown = tags.slice(0, 3);
  const remaining = tags.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((tag) => (
        <span
          key={tag.id}
          className="text-xs px-2 py-0.5 rounded-md bg-muted text-muted-foreground border border-border whitespace-nowrap"
        >
          {tag.tag}
        </span>
      ))}

      {remaining > 0 && (
        <span className="text-xs px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border whitespace-nowrap">
          +{remaining}
        </span>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showInTransit, setShowInTransit] = useState(false);

  const { data, isLoading, refetch, isRefetching } =
    trpc.inventory.bookTitles.useQuery(undefined, {
      refetchInterval: 120_000,
    });

  const { data: summary } = trpc.inventory.summary.useQuery();

  const { data: inTransitGroups } = trpc.inventory.inTransit.useQuery(
    undefined,
    { enabled: showInTransit }
  );

  const books = data?.data ?? [];

  const filtered = books.filter((book) => {
    const q = search.toLowerCase();

    const tagText =
      book.tags?.map((tag) => tag.tag.toLowerCase()).join(" ") ?? "";

    const matchesSearch =
      !search ||
      book.title?.toLowerCase().includes(q) ||
      book.author?.toLowerCase().includes(q) ||
      book.isbn?.includes(search) ||
      book.bin_id?.toLowerCase().includes(q) ||
      book.sku_min?.toLowerCase().includes(q) ||
      book.sku_max?.toLowerCase().includes(q) ||
      book.bin_theme?.toLowerCase().includes(q) ||
      tagText.includes(q);

    const matchesAge =
      ageFilter === "all" || normalizeAge(book.age_group) === ageFilter;

    const matchesTheme =
      themeFilter === "all" || book.bin_theme === themeFilter;

    return matchesSearch && matchesAge && matchesTheme;
  });

  const totalInFlight =
    inTransitGroups?.reduce((sum, group) => sum + group.books.length, 0) ??
    summary?.in_transit ??
    0;

  const totalMembers = inTransitGroups?.length ?? 0;
    return (
    <>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Inventory Stock
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading
                ? "Loading..."
                : `${data?.total ?? 0} titles · ${
                    summary?.total ?? 0
                  } total copies`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5",
                  (isLoading || isRefetching) && "animate-spin"
                )}
              />
              Refresh
            </button>

            <Link href="/receive">
              <button
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                <BookOpen className="w-4 h-4" />
                Receive Books
              </button>
            </Link>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <span className="section-label">Total Copies</span>
            <p className="text-3xl font-bold text-foreground mt-1">
              {summary?.total ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">across all bins</p>
          </div>

          <div className="stat-card">
            <span className="section-label">In House</span>
            <p className="text-3xl font-bold text-foreground mt-1">
              {summary?.in_house ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">available to ship</p>
          </div>

          <button
            onClick={() => setShowInTransit(true)}
            className="stat-card text-left hover:border-primary hover:shadow-sm transition-all cursor-pointer w-full"
          >
            <span className="section-label">In Flight</span>
            <p className="text-3xl font-bold text-foreground mt-1">
              {summary?.in_transit ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              with members · click to view
            </p>
          </button>

          <div className="stat-card">
            <span className="section-label">Returned</span>
            <p className="text-3xl font-bold text-foreground mt-1">
              {summary?.returned ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">back in warehouse</p>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title, author, ISBN, SKU, bin, theme, or tag…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setAgeFilter("all")}
                className={cn(
                  "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                  ageFilter === "all"
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                All Ages
              </button>

              {AGE_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setAgeFilter(option.value)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                    ageFilter === option.value
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setThemeFilter("all")}
                className={cn(
                  "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                  themeFilter === "all"
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                All Themes
              </button>

              {THEME_FILTER_OPTIONS.map((theme) => (
                <button
                  key={theme}
                  onClick={() => setThemeFilter(theme)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                    themeFilter === theme
                      ? "border-primary text-primary bg-primary/5"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </div>
                {/* Books Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Loading inventory…
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No books found</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 px-5 py-3 bg-muted/30 border-b border-border gap-3">
                <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Title
                </span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Age
                </span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Theme
                </span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Tags
                </span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Bin
                </span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">
                  Copies
                </span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Status
                </span>
              </div>

              <div className="divide-y divide-border/50">
                {filtered.map((book) => {
                  const hasStatuses =
                    (book.in_transit_count ?? 0) > 0 ||
                    (book.pending_qc_count ?? 0) > 0 ||
                    (book.returned_count ?? 0) > 0;

                  return (
                    <button
                      key={book.id}
                      onClick={() => setSelectedBookId(book.id)}
                      className="w-full grid grid-cols-12 px-5 py-4 items-center hover:bg-muted/30 transition-colors text-left group gap-3"
                    >
                      {/* Title + Author + SKU */}
                      <div className="col-span-3 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {book.title}
                        </p>

                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {book.author || "Unknown author"}
                        </p>

                        <div className="mt-1">
                          {book.sku_min ? (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {book.sku_max && book.sku_max !== book.sku_min
                                ? `${book.sku_min} – ${book.sku_max.replace(
                                    /^.*-/,
                                    ""
                                  )}`
                                : book.sku_min}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50">
                              No SKU
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Age */}
                      <div className="col-span-1">
                        <span className="text-xs text-foreground">
                          {formatAgeTier(book.age_group)}
                        </span>
                      </div>

                      {/* Theme */}
                      <div className="col-span-2 min-w-0">
                        <ThemeBadge theme={book.bin_theme} />
                      </div>

                      {/* Tags */}
                      <div className="col-span-2 min-w-0">
                        <TagPreview tags={book.tags} />
                      </div>

                      {/* Bin */}
                      <div className="col-span-1 min-w-0">
                        <span className="text-xs font-mono text-foreground bg-muted border border-border rounded-md px-2 py-1 whitespace-nowrap">
                          {book.bin_id ?? "—"}
                        </span>
                      </div>

                      {/* Copies */}
                      <div className="col-span-1 text-center">
                        <span className="inline-flex items-center justify-center min-w-8 text-sm font-bold text-foreground bg-muted rounded-full px-2 py-1">
                          {book.copy_count ?? 0}
                        </span>
                      </div>

                      {/* Status badges */}
                      <div className="col-span-2 flex items-center gap-1 flex-wrap">
                        {!hasStatuses && (
                          <span className="text-xs text-muted-foreground/50">
                            —
                          </span>
                        )}

                        {(book.in_transit_count ?? 0) > 0 && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{
                              backgroundColor: "oklch(0.92 0.06 155)",
                              color: "oklch(0.35 0.12 155)",
                            }}
                          >
                            ✈ {book.in_transit_count} In Flight
                          </span>
                        )}

                        {(book.pending_qc_count ?? 0) > 0 && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-100 text-amber-700">
                            {book.pending_qc_count} QC
                          </span>
                        )}

                        {(book.returned_count ?? 0) > 0 && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-blue-50 text-blue-600">
                            {book.returned_count} Returned
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {!isLoading && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {filtered.length} of {books.length} titles · Click any row
            to view and edit details
          </p>
        )}
      </div>
            {/* Detail drawer */}
      <BookDetailDrawer
        bookId={selectedBookId}
        onClose={() => setSelectedBookId(null)}
      />

      {/* In Flight Drawer */}
      {showInTransit && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/40"
            onClick={() => setShowInTransit(false)}
          />

          <div className="w-full max-w-md bg-background border-l border-border flex flex-col h-full shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="font-bold text-foreground">In Flight</h2>

                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalInFlight} book
                  {totalInFlight !== 1 ? "s" : ""} with {totalMembers} member
                  {totalMembers !== 1 ? "s" : ""}
                </p>
              </div>

              <button
                onClick={() => setShowInTransit(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {!inTransitGroups ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mx-auto mb-2" />

                  <p className="text-sm text-muted-foreground">
                    Loading…
                  </p>
                </div>
              ) : inTransitGroups.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No books in flight
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {inTransitGroups.map((group) => (
                    <div
                      key={group.member_id}
                      className="px-6 py-4 space-y-2.5"
                    >
                      {/* Member Header */}
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          ✈ {group.member_name}
                        </p>

                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: "oklch(0.92 0.06 155)",
                            color: "oklch(0.35 0.12 155)",
                          }}
                        >
                          {group.books.length} book
                          {group.books.length !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Books */}
                      <div className="space-y-2 pl-2 border-l-2 border-border ml-1">
                        {group.books.map((book) => (
                          <div
                            key={book.id}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm text-foreground leading-snug truncate">
                                {book.title}
                              </p>

                              <p className="text-xs text-muted-foreground">
                                {book.author}
                              </p>
                            </div>

                            <span className="text-xs font-mono text-muted-foreground shrink-0 mt-0.5">
                              {book.sku}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}