/**
 * BookDetailDrawer
 * Slide-over panel that opens when a row is clicked in the Inventory Snapshot.
 * - Editable title metadata: title, author, age group, ISBN, bin, cover URL, publisher, published date
 * - Lists every physical copy with its SKU, bin, status, and condition
 * - Per-copy actions: change status (any value), edit bin/SKU inline
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { X, BookOpen, Save, Loader2, ChevronDown, ExternalLink, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type BookCopy = {
  id: string;
  sku: string;
  isbn: string | null;
  age_group: string;
  bin_id: string;
  status: string;
  condition: string | null;
  label_status: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type BookDetail = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  age_group: string | null;
  bin_id: string | null;
  cover_url: string | null;
  publisher: string | null;
  published_date: string | null;
  page_count: number | null;
  copies: BookCopy[];
};

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "in_house", label: "In House" },
  { value: "pending_qc", label: "Pending QC" },
  { value: "pending_stock", label: "Pending Stock" },
  { value: "in_transit", label: "In Transit" },
  { value: "returned", label: "Returned" },
  { value: "donated_lfl", label: "Donated (LFL)" },
  { value: "lost", label: "Lost" },
  { value: "withdrawn", label: "Withdrawn" },
];

const STATUS_COLORS: Record<string, string> = {
  in_house: "bg-green-100 text-green-800 border-green-200",
  pending_qc: "bg-amber-100 text-amber-800 border-amber-200",
  pending_stock: "bg-blue-100 text-blue-800 border-blue-200",
  in_transit: "bg-purple-100 text-purple-800 border-purple-200",
  returned: "bg-slate-100 text-slate-700 border-slate-200",
  donated_lfl: "bg-rose-100 text-rose-800 border-rose-200",
  lost: "bg-red-100 text-red-800 border-red-200",
  withdrawn: "bg-gray-100 text-gray-600 border-gray-200",
};

const AGE_GROUP_OPTIONS = [
  { value: "hatchlings", label: "Hatchlings" },
  { value: "fledglings", label: "Fledglings" },
  { value: "sky_readers", label: "Sky Readers" },
  { value: "soarers", label: "Soarers" },
];

// ─── CopyRow ─────────────────────────────────────────────────────────────────

function CopyRow({ copy, titleId, onSaved }: { copy: BookCopy; titleId: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [sku, setSku] = useState(copy.sku);
  const [bin, setBin] = useState(copy.bin_id);
  const [status, setStatus] = useState(copy.status);
  const [condition, setCondition] = useState(copy.condition ?? "");
  const [notes, setNotes] = useState(copy.notes ?? "");

  const updateCopy = trpc.inventory.updateCopy.useMutation({
    onSuccess: () => {
      toast.success(`${sku} updated`);
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const sendToQC = trpc.inventory.updateCopy.useMutation({
    onSuccess: () => {
      toast.success(`${copy.sku} sent to QC queue`);
      onSaved();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = () => {
    updateCopy.mutate({
      id: copy.id,
      sku: sku !== copy.sku ? sku : undefined,
      bin_id: bin !== copy.bin_id ? bin : undefined,
      status: status !== copy.status ? status : undefined,
      condition: condition !== (copy.condition ?? "") ? condition : undefined,
      notes: notes !== (copy.notes ?? "") ? notes : undefined,
    });
  };

  const cancel = () => {
    setSku(copy.sku);
    setBin(copy.bin_id);
    setStatus(copy.status);
    setCondition(copy.condition ?? "");
    setNotes(copy.notes ?? "");
    setEditing(false);
  };

  const statusColor = STATUS_COLORS[status] ?? "bg-gray-100 text-gray-600 border-gray-200";

  return (
    <div className={cn("rounded-lg border p-3 transition-colors", editing ? "border-primary/40 bg-primary/5" : "border-border bg-card")}>
      {!editing ? (
        <div className="flex items-center gap-3">
          {/* SKU */}
          <span className="font-mono text-xs font-semibold text-foreground w-28 shrink-0">{copy.sku}</span>
          {/* Status badge */}
          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium shrink-0", statusColor)}>
            {STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status}
          </span>
          {/* Bin */}
          <span className="text-xs font-mono text-muted-foreground shrink-0">{copy.bin_id}</span>
          {/* Condition */}
          {copy.condition && (
            <span className="text-xs text-muted-foreground capitalize shrink-0">{copy.condition}</span>
          )}
          {/* QC notes */}
          {copy.notes && (
            <span className="text-xs text-muted-foreground truncate flex-1 italic">"{copy.notes}"</span>
          )}
          <div className="flex-1" />
          {/* Received date */}
          {copy.received_at && (
            <span className="text-xs text-muted-foreground/60 shrink-0">
              {new Date(copy.received_at).toLocaleDateString()}
            </span>
          )}
          {/* Send to QC button — only shown when not already pending_qc */}
          {copy.status !== "pending_qc" && (
            <button
              onClick={() => sendToQC.mutate({ id: copy.id, status: "pending_qc" })}
              disabled={sendToQC.isPending}
              title="Send to QC queue"
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50 shrink-0"
            >
              {sendToQC.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <FlaskConical className="w-3 h-3" />}
              QC
            </button>
          )}
          {/* Edit button */}
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-primary hover:underline shrink-0"
          >
            Edit
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* SKU */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">SKU</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full text-sm font-mono px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            {/* Bin */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Bin</label>
              <input
                value={bin}
                onChange={(e) => setBin(e.target.value)}
                className="w-full text-sm font-mono px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            {/* Status */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none pr-7"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {/* Condition */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Condition</label>
              <div className="relative">
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full text-sm px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none pr-7"
                >
                  <option value="">—</option>
                  <option value="new">New</option>
                  <option value="good">Good</option>
                  <option value="fair">Fair</option>
                  <option value="poor">Poor</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          </div>
          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="QC notes, damage description…"
              className="w-full text-sm px-2 py-1.5 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={cancel}
              className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={updateCopy.isPending}
              className="text-xs px-3 py-1.5 rounded-md text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              {updateCopy.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

interface BookDetailDrawerProps {
  bookId: string | null;
  onClose: () => void;
}

export function BookDetailDrawer({ bookId, onClose }: BookDetailDrawerProps) {
  const utils = trpc.useUtils();

  const { data: book, isLoading, refetch } = trpc.inventory.getBookDetail.useQuery(
    { id: bookId! },
    { enabled: !!bookId }
  );

  // Title edit state
  const [titleEdit, setTitleEdit] = useState<Partial<BookDetail>>({});
  const [titleDirty, setTitleDirty] = useState(false);

  // Reset edit state when a different book opens
  useEffect(() => {
    setTitleEdit({});
    setTitleDirty(false);
  }, [bookId]);

  const updateTitle = trpc.inventory.updateBookTitle.useMutation({
    onSuccess: () => {
      toast.success("Book details saved");
      setTitleDirty(false);
      setTitleEdit({});
      refetch();
      utils.inventory.bookTitles.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleTitleChange = (field: keyof BookDetail, value: string) => {
    setTitleEdit((prev) => ({ ...prev, [field]: value }));
    setTitleDirty(true);
  };

  const saveTitle = () => {
    if (!book) return;
    updateTitle.mutate({ id: book.id, ...titleEdit } as any);
  };

  // Merged display values (live edits override fetched data)
  const display = book ? { ...book, ...titleEdit } : null;

  const open = !!bookId;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/30 z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-xl bg-background border-l border-border shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-bold text-foreground">Book Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Loading…</span>
            </div>
          )}

          {!isLoading && !book && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <BookOpen className="w-10 h-10 opacity-30" />
              <p className="text-sm">Book not found</p>
            </div>
          )}

          {display && (
            <>
              {/* Cover + title hero */}
              <div className="flex gap-4 items-start">
                <div className="w-16 h-22 rounded-md overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
                  {display.cover_url ? (
                    <img src={display.cover_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <BookOpen className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-foreground leading-tight">{display.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{display.author}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {display.age_group && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize">
                        {display.age_group.replace("_", " ")}
                      </span>
                    )}
                    {display.bin_id && (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        {display.bin_id}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {book.copies.length} {book.copies.length === 1 ? "copy" : "copies"}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Title metadata editor ── */}
              <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Title Information
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* Title */}
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Title</label>
                    <input
                      value={display.title ?? ""}
                      onChange={(e) => handleTitleChange("title", e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  {/* Author */}
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Author</label>
                    <input
                      value={display.author ?? ""}
                      onChange={(e) => handleTitleChange("author", e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  {/* ISBN */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">ISBN</label>
                    <input
                      value={display.isbn ?? ""}
                      onChange={(e) => handleTitleChange("isbn", e.target.value)}
                      className="w-full text-sm font-mono px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="978-…"
                    />
                  </div>
                  {/* Age Group */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Age Group</label>
                    <div className="relative">
                      <select
                        value={display.age_group ?? ""}
                        onChange={(e) => handleTitleChange("age_group", e.target.value)}
                        className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none pr-7"
                      >
                        <option value="">— select —</option>
                        {AGE_GROUP_OPTIONS.map((ag) => (
                          <option key={ag.value} value={ag.value}>{ag.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>
                  {/* Default Bin */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Default Bin</label>
                    <input
                      value={display.bin_id ?? ""}
                      onChange={(e) => handleTitleChange("bin_id", e.target.value)}
                      className="w-full text-sm font-mono px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="BIN-A1"
                    />
                  </div>
                  {/* Publisher */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Publisher</label>
                    <input
                      value={display.publisher ?? ""}
                      onChange={(e) => handleTitleChange("publisher", e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  {/* Published Date */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Published Date</label>
                    <input
                      value={display.published_date ?? ""}
                      onChange={(e) => handleTitleChange("published_date", e.target.value)}
                      className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      placeholder="2023-01-01"
                    />
                  </div>
                  {/* Cover URL */}
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Cover Image URL</label>
                    <div className="flex gap-2">
                      <input
                        value={display.cover_url ?? ""}
                        onChange={(e) => handleTitleChange("cover_url", e.target.value)}
                        className="flex-1 text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        placeholder="https://…"
                      />
                      {display.cover_url && (
                        <a
                          href={display.cover_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground"
                          title="Open cover URL"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* Save title button */}
                {titleDirty && (
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={saveTitle}
                      disabled={updateTitle.isPending}
                      className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50"
                      style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                    >
                      {updateTitle.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Changes
                    </button>
                  </div>
                )}
              </section>

              {/* ── Copies ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Physical Copies ({book.copies.length})
                  </h3>
                  {/* Status summary pills */}
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {(() => {
                        const counts: Record<string, number> = {};
                        book.copies.forEach((c: BookCopy) => { counts[c.status] = (counts[c.status] ?? 0) + 1; });
                        return Object.entries(counts).map(([st, count]) => (
                      <span
                        key={st}
                        className={cn("text-xs px-2 py-0.5 rounded-full border", STATUS_COLORS[st] ?? "bg-gray-100 text-gray-600 border-gray-200")}
                      >
                        {count as number} {STATUS_OPTIONS.find((s) => s.value === st)?.label ?? st}
                      </span>
                    ));
                    })()}
                  </div>
                </div>

                {book.copies.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No copies on record.</p>
                ) : (
                  <div className="space-y-2">
                    {book.copies.map((copy: BookCopy) => (
                      <CopyRow
                        key={copy.id}
                        copy={copy}
                        titleId={book.id}
                        onSaved={() => {
                          refetch();
                          utils.inventory.bookTitles.invalidate();
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
