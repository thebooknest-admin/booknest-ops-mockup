// BookNest Ops — Inventory Page (wired to real Supabase data)
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Search, BookOpen, RefreshCw, AlertTriangle, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState("all");

  const { data, isLoading, refetch, isRefetching } = trpc.inventory.bookTitles.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const { data: summary } = trpc.inventory.summary.useQuery();

  const books = data?.data ?? [];

  const ageGroups = Array.from(new Set(books.map((b) => b.age_group).filter(Boolean) as string[])).sort();

  const filtered = books.filter((b) => {
    const matchesSearch =
      !search ||
      b.title?.toLowerCase().includes(search.toLowerCase()) ||
      b.author?.toLowerCase().includes(search.toLowerCase()) ||
      b.isbn?.includes(search);
    const matchesAge = ageFilter === "all" || b.age_group === ageFilter;
    return matchesSearch && matchesAge;
  });

  const lowBooks = books.filter((b) => (b.copy_count ?? 0) > 0 && (b.copy_count ?? 0) <= 2);
  const emptyBooks = books.filter((b) => (b.copy_count ?? 0) === 0);

  return (
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
            <button className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
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

      {/* Needs Attention */}
      {(lowBooks.length > 0 || emptyBooks.length > 0) && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <TrendingDown className="w-4 h-4" style={{ color: "oklch(0.55 0.22 25)" }} />
            <h2 className="font-semibold text-sm text-foreground">Needs Restocking</h2>
            <span className="ml-auto text-xs text-muted-foreground">
              {emptyBooks.length} empty · {lowBooks.length} low
            </span>
          </div>
          <div className="divide-y divide-border/50 max-h-48 overflow-y-auto">
            {[...emptyBooks, ...lowBooks].slice(0, 15).map((book) => (
              <div key={book.id} className="px-5 py-3 flex items-center gap-4">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  (book.copy_count ?? 0) === 0 ? "bg-red-500" : "bg-amber-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground">{book.age_group} · {book.bin_id || "no bin"}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={cn(
                    "text-sm font-bold",
                    (book.copy_count ?? 0) === 0 ? "text-red-600" : "text-amber-600"
                  )}>
                    {book.copy_count ?? 0}
                  </span>
                  <p className="text-xs text-muted-foreground">copies</p>
                </div>
                <Link href="/receive">
                  <button className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors shrink-0"
                    style={{ backgroundColor: "oklch(0.92 0.04 155)", color: "oklch(0.32 0.10 155)" }}>
                    Restock
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by title, author, or ISBN..."
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
              ageFilter === "all" ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            All Ages
          </button>
          {ageGroups.map((age) => (
            <button
              key={age}
              onClick={() => setAgeFilter(age)}
              className={cn(
                "px-3 py-2 text-xs font-medium rounded-lg border transition-colors capitalize",
                ageFilter === age ? "border-primary text-primary bg-primary/5" : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {age}
            </button>
          ))}
        </div>
      </div>

      {/* Books Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading inventory...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No books found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-12 px-5 py-3 bg-muted/30">
              <span className="col-span-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Author</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age Group</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Copies</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bin</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
            </div>
            <div className="divide-y divide-border/50">
              {filtered.map((book) => {
                const isLow = (book.copy_count ?? 0) <= 2 && (book.copy_count ?? 0) > 0;
                const isEmpty = (book.copy_count ?? 0) === 0;
                return (
                  <div
                    key={book.id}
                    className={cn(
                      "grid grid-cols-12 px-5 py-3 items-center",
                      isEmpty && "bg-red-50/40",
                      isLow && !isEmpty && "bg-amber-50/40"
                    )}
                  >
                    <div className="col-span-4 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{book.title}</p>
                      {book.isbn && (
                        <p className="text-xs text-muted-foreground font-mono">{book.isbn}</p>
                      )}
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">{book.author || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-foreground capitalize">{book.age_group || "—"}</span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className={cn(
                        "text-sm font-bold",
                        isEmpty ? "text-red-600" : isLow ? "text-amber-600" : "text-foreground"
                      )}>
                        {book.copy_count ?? 0}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground font-mono">{book.bin_id || "—"}</span>
                    </div>
                    <div className="col-span-1">
                      {isEmpty ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3" /> Empty
                        </span>
                      ) : isLow ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> Low
                        </span>
                      ) : (
                        <span className="text-xs text-green-600">OK</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {!isLoading && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {books.length} titles
        </p>
      )}
    </div>
  );
}
