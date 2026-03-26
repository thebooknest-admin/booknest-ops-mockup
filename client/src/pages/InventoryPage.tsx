// BookNest Ops — Inventory Snapshot (wired to real Supabase data)
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search, BookOpen, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookDetailDrawer } from "@/components/BookDetailDrawer";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState("all");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = trpc.inventory.bookTitles.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const { data: summary } = trpc.inventory.summary.useQuery();

  const books = data?.data ?? [];

  // Static age group list — avoids duplicates from mixed casing in DB
  const AGE_FILTER_OPTIONS = [
    { label: "Hatchlings", value: "hatchlings" },
    { label: "Fledglings", value: "fledglings" },
    { label: "Sky Readers", value: "sky_readers" },
    { label: "Soarers", value: "soarers" },
  ];

  // Normalize age group for comparison (handles both "Sky Readers" and "sky_readers")
  const normalizeAge = (ag: string | null | undefined) =>
    (ag ?? "").toLowerCase().replace(/\s+/g, "_");

  const filtered = books.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.isbn?.includes(search) ||
      b.bin_id?.toLowerCase().includes(q) ||
      b.sku_min?.toLowerCase().includes(q) ||
      b.sku_max?.toLowerCase().includes(q);
    const matchesAge = ageFilter === "all" || normalizeAge(b.age_group) === ageFilter;
    return matchesSearch && matchesAge;
  });

  return (
    <>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Inventory Snapshot</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading ? "Loading..." : `${data?.total ?? 0} titles · ${summary?.total ?? 0} total copies`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
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
            <p className="text-3xl font-bold text-foreground mt-1">{summary?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">across all bins</p>
          </div>
          <div className="stat-card">
            <span className="section-label">In House</span>
            <p className="text-3xl font-bold text-foreground mt-1">{summary?.in_house ?? 0}</p>
            <p className="text-xs text-muted-foreground">available to ship</p>
          </div>
          <div className="stat-card">
            <span className="section-label">In Transit</span>
            <p className="text-3xl font-bold text-foreground mt-1">{summary?.in_transit ?? 0}</p>
            <p className="text-xs text-muted-foreground">with members</p>
          </div>
          <div className="stat-card">
            <span className="section-label">Returned</span>
            <p className="text-3xl font-bold text-foreground mt-1">{summary?.returned ?? 0}</p>
            <p className="text-xs text-muted-foreground">back in warehouse</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by title, author, ISBN, SKU, or bin…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
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
            {AGE_FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAgeFilter(opt.value)}
                className={cn(
                  "px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
                  ageFilter === opt.value
                    ? "border-primary text-primary bg-primary/5"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Books Table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading inventory…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No books found</p>
            </div>
          ) : (
            <>
              {/* Table Header */}
              <div className="grid grid-cols-12 px-5 py-3 bg-muted/30 border-b border-border">
                <span className="col-span-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Author</span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bin</span>
                <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Copies</span>
                <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">SKU(s)</span>
              </div>

              <div className="divide-y divide-border/50">
                {filtered.map((book) => (
                  <button
                    key={book.id}
                    onClick={() => setSelectedBookId(book.id)}
                    className="w-full grid grid-cols-12 px-5 py-3 items-center hover:bg-muted/30 transition-colors text-left group"
                  >
                    {/* Title */}
                    <div className="col-span-4 min-w-0 pr-2">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {book.title}
                      </p>
                    </div>
                    {/* Author */}
                    <div className="col-span-2 min-w-0 pr-2">
                      <p className="text-sm text-muted-foreground truncate">{book.author}</p>
                    </div>
                    {/* Age Group */}
                    <div className="col-span-1">
                      <span className="text-xs text-foreground capitalize">
                        {book.age_group?.replace("_", " ") ?? "—"}
                      </span>
                    </div>
                    {/* Bin */}
                    <div className="col-span-2">
                      <span className="text-xs font-mono text-foreground">{book.bin_id ?? "—"}</span>
                    </div>
                    {/* Copies */}
                    <div className="col-span-1 text-center">
                      <span className="text-sm font-bold text-foreground">{book.copy_count ?? 0}</span>
                    </div>
                    {/* SKU(s) */}
                    <div className="col-span-2 min-w-0">
                      {book.sku_min ? (
                        <span className="text-xs font-mono text-muted-foreground">
                          {book.sku_max && book.sku_max !== book.sku_min
                            ? `${book.sku_min} – ${book.sku_max.replace(/^.*-/, "")}`
                            : book.sku_min}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {!isLoading && (
          <p className="text-xs text-muted-foreground text-center">
            Showing {filtered.length} of {books.length} titles · Click any row to view and edit details
          </p>
        )}
      </div>

      {/* Detail drawer */}
      <BookDetailDrawer
        bookId={selectedBookId}
        onClose={() => setSelectedBookId(null)}
      />
    </>
  );
}
