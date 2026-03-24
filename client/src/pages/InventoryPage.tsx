// BookNest Ops — Inventory Snapshot (wired to real Supabase data)
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Search, BookOpen, RefreshCw, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const AGE_GROUP_OPTIONS = ["hatchlings", "fledglings", "sky readers", "soarers"];

interface EditState {
  id: string;
  title: string;
  author: string;
  age_group: string;
  bin_id: string;
  isbn: string;
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);

  const utils = trpc.useUtils();
  const { data, isLoading, refetch, isRefetching } = trpc.inventory.bookTitles.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const { data: summary } = trpc.inventory.summary.useQuery();

  const updateMutation = trpc.inventory.updateBookTitle.useMutation({
    onSuccess: () => {
      toast.success("Book updated");
      setEditingId(null);
      setEditState(null);
      utils.inventory.bookTitles.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to update: " + err.message);
    },
  });

  const books = data?.data ?? [];

  const ageGroups = Array.from(
    new Set(books.map((b) => b.age_group).filter(Boolean) as string[])
  ).sort();

  const filtered = books.filter((b) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q) ||
      b.isbn?.includes(search) ||
      b.bin_id?.toLowerCase().includes(q);
    const matchesAge = ageFilter === "all" || b.age_group === ageFilter;
    return matchesSearch && matchesAge;
  });

  const startEdit = (book: (typeof books)[0]) => {
    setEditingId(book.id);
    setEditState({
      id: book.id,
      title: book.title ?? "",
      author: book.author ?? "",
      age_group: book.age_group ?? "",
      bin_id: book.bin_id ?? "",
      isbn: book.isbn ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditState(null);
  };

  const saveEdit = () => {
    if (!editState) return;
    updateMutation.mutate({
      id: editState.id,
      title: editState.title,
      author: editState.author,
      age_group: editState.age_group,
      bin_id: editState.bin_id,
      isbn: editState.isbn,
    });
  };

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
          {ageGroups.map((age) => (
            <button
              key={age}
              onClick={() => setAgeFilter(age)}
              className={cn(
                "px-3 py-2 text-xs font-medium rounded-lg border transition-colors capitalize",
                ageFilter === age
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:bg-muted"
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
              <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Author</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age Group</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Bin</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center">Copies</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">ISBN</span>
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Edit</span>
            </div>

            <div className="divide-y divide-border/50">
              {filtered.map((book) => {
                const isEditing = editingId === book.id;

                if (isEditing && editState) {
                  return (
                    <div key={book.id} className="grid grid-cols-12 px-5 py-2.5 items-center bg-primary/5 gap-x-2">
                      {/* Title */}
                      <div className="col-span-3 min-w-0">
                        <input
                          value={editState.title}
                          onChange={(e) => setEditState({ ...editState, title: e.target.value })}
                          className="w-full text-sm px-2 py-1 border border-primary/40 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      {/* Author */}
                      <div className="col-span-2 min-w-0">
                        <input
                          value={editState.author}
                          onChange={(e) => setEditState({ ...editState, author: e.target.value })}
                          className="w-full text-sm px-2 py-1 border border-primary/40 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      {/* Age Group */}
                      <div className="col-span-2">
                        <select
                          value={editState.age_group}
                          onChange={(e) => setEditState({ ...editState, age_group: e.target.value })}
                          className="w-full text-sm px-2 py-1 border border-primary/40 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary capitalize"
                        >
                          <option value="">—</option>
                          {AGE_GROUP_OPTIONS.map((ag) => (
                            <option key={ag} value={ag} className="capitalize">{ag}</option>
                          ))}
                        </select>
                      </div>
                      {/* Bin */}
                      <div className="col-span-2">
                        <input
                          value={editState.bin_id}
                          onChange={(e) => setEditState({ ...editState, bin_id: e.target.value })}
                          className="w-full text-sm px-2 py-1 border border-primary/40 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                          placeholder="BIN-ID"
                        />
                      </div>
                      {/* Copies (read-only in edit) */}
                      <div className="col-span-1 text-center">
                        <span className="text-sm font-bold text-foreground">{book.copy_count ?? 0}</span>
                      </div>
                      {/* ISBN */}
                      <div className="col-span-1">
                        <input
                          value={editState.isbn}
                          onChange={(e) => setEditState({ ...editState, isbn: e.target.value })}
                          className="w-full text-xs px-2 py-1 border border-primary/40 rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                        />
                      </div>
                      {/* Save / Cancel */}
                      <div className="col-span-1 flex justify-end gap-1">
                        <button
                          onClick={saveEdit}
                          disabled={updateMutation.isPending}
                          className="p-1.5 rounded-md text-white transition-colors disabled:opacity-50"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={book.id}
                    className="grid grid-cols-12 px-5 py-3 items-center hover:bg-muted/20 transition-colors"
                  >
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{book.title}</p>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <p className="text-sm text-muted-foreground truncate">{book.author || "—"}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-foreground capitalize">{book.age_group || "—"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground font-mono">{book.bin_id || "—"}</span>
                    </div>
                    <div className="col-span-1 text-center">
                      <span className="text-sm font-bold text-foreground">{book.copy_count ?? 0}</span>
                    </div>
                    <div className="col-span-1">
                      <p className="text-xs text-muted-foreground font-mono truncate">{book.isbn || "—"}</p>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <button
                        onClick={() => startEdit(book)}
                        className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        title="Edit book"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
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
