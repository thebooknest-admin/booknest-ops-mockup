/**
 * BookDetailDrawer
 * Slide-over panel for viewing/editing title metadata and physical copies.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  X,
  BookOpen,
  Save,
  Loader2,
  ChevronDown,
  ExternalLink,
  FlaskConical,
  Tags,
  Sparkles,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatInventoryLocation,
  normalizeShelvingSection,
  requiresShelvingSection,
} from "@shared/booknest";

type BookCopy = {
  id: string;
  sku: string;
  isbn: string | null;
  age_group: string;
  bin_id: string;
  section: string | null;
  location: string | null;
  status: string;
  condition: string | null;
  label_status: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type BookTag = {
  id: string;
  bin_theme: string;
  tag: string;
};

type BookDetail = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  age_group: string | null;
  suggested_age_tier: string | null;
  bin_theme: string | null;
  tag_ids: string[] | null;
  tags: BookTag[];
  cover_url: string | null;
  publisher: string | null;
  published_date: string | null;
  page_count: number | null;
  description: string | null;
  subjects: string[] | null;
  metadata_source: string | null;
  classification_version: string | null;
  copies: BookCopy[];
};

const STATUS_OPTIONS = [
  { value: "in_house", label: "Available" },
  { value: "pending_qc", label: "QC" },
  { value: "pending_label", label: "Labels" },
  { value: "pending_stock", label: "Stock" },
  { value: "in_transit", label: "With Members" },
  { value: "returned", label: "Returns" },
  { value: "restricted", label: "Restricted" },
  { value: "donated_lfl", label: "Donated (LFL)" },
  { value: "lost", label: "Lost" },
  { value: "withdrawn", label: "Withdrawn" },
];

const STATUS_COLORS: Record<string, string> = {
  in_house: "bg-green-100 text-green-800 border-green-200",
  pending_qc: "bg-amber-100 text-amber-800 border-amber-200",
  pending_label: "bg-purple-100 text-purple-800 border-purple-200",
  pending_stock: "bg-slate-100 text-slate-700 border-slate-200",
  in_transit: "bg-emerald-100 text-emerald-800 border-emerald-200",
  returned: "bg-blue-100 text-blue-800 border-blue-200",
  restricted: "bg-red-100 text-red-800 border-red-200",
  donated_lfl: "bg-rose-100 text-rose-800 border-rose-200",
  lost: "bg-red-100 text-red-800 border-red-200",
  withdrawn: "bg-gray-100 text-gray-600 border-gray-200",
};

const AGE_GROUP_OPTIONS = [
  { value: "hatchlings", label: "Hatchlings (0-2)" },
  { value: "fledglings", label: "Fledglings (3-5)" },
  { value: "soarers", label: "Soarers (6-8)" },
  { value: "sky_readers", label: "Sky Readers (9-12)" },
  { value: "13+", label: "13+" },
];

const THEME_OPTIONS = [
  "Adventure",
  "Laughs & Chaos",
  "Heart & Home",
  "Discovery Den",
  "Wild & Wonderful",
  "Wonder & Imagination",
  "Legends & Long Ago",
  "Seasons & Celebrations",
].map(theme => ({ value: theme, label: theme }));

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

function normalizeAgeGroupValue(age: string) {
  const normalized = age.toLowerCase().trim();

  if (normalized.includes("hatchlings")) return "hatchlings";
  if (normalized.includes("fledglings")) return "fledglings";
  if (normalized.includes("soarers")) return "soarers";
  if (
    normalized.includes("sky readers") ||
    normalized.includes("sky_readers")
  ) {
    return "sky_readers";
  }

  if (normalized.includes("13")) return "13+";

  return age;
}

function getStatusLabel(status: string | null | undefined) {
  if (!status) return "Unknown";

  return (
    STATUS_OPTIONS.find(option => option.value === status)?.label ??
    status.replace(/_/g, " ")
  );
}

function getStatusColor(status: string | null | undefined) {
  return (
    STATUS_COLORS[status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200"
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
          mono && "font-mono"
        )}
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full text-sm px-3 py-2 border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary appearance-none pr-8"
        >
          <option value="">— select —</option>
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}

function InfoPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-xs px-2 py-0.5 rounded-full border font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}
function CopyRow({ copy, onSaved }: { copy: BookCopy; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [sku, setSku] = useState(copy.sku);
  const [bin, setBin] = useState(copy.bin_id);
  const [section, setSection] = useState(copy.section ?? "");
  const [status, setStatus] = useState(copy.status);
  const [condition, setCondition] = useState(copy.condition ?? "");
  const [notes, setNotes] = useState(copy.notes ?? "");

  useEffect(() => {
    if (editing) return;

    setSku(copy.sku);
    setBin(copy.bin_id);
    setSection(copy.section ?? "");
    setStatus(copy.status);
    setCondition(copy.condition ?? "");
    setNotes(copy.notes ?? "");
  }, [copy, editing]);

  const updateCopy = trpc.inventory.updateCopy.useMutation({
    onSuccess: () => {
      toast.success(`${sku} updated`);
      setEditing(false);
      onSaved();
    },
    onError: e => toast.error(e.message),
  });

  const sendToQC = trpc.inventory.updateCopy.useMutation({
    onSuccess: () => {
      toast.success(`${copy.sku} sent to QC queue`);
      onSaved();
    },
    onError: e => toast.error(e.message),
  });

  const save = () => {
    if (requiresShelvingSection(copy.age_group) && !normalizeShelvingSection(section)) {
      toast.error("Section is required for Soarers and Sky Readers.");
      return;
    }

    updateCopy.mutate({
      id: copy.id,
      sku: sku !== copy.sku ? sku : undefined,
      bin_id: bin !== copy.bin_id ? bin : undefined,
      section: section !== (copy.section ?? "") ? section : undefined,
      status: status !== copy.status ? status : undefined,
      condition: condition !== (copy.condition ?? "") ? condition : undefined,
      notes: notes !== (copy.notes ?? "") ? notes : undefined,
    });
  };

  const cancel = () => {
    setSku(copy.sku);
    setBin(copy.bin_id);
    setSection(copy.section ?? "");
    setStatus(copy.status);
    setCondition(copy.condition ?? "");
    setNotes(copy.notes ?? "");
    setEditing(false);
  };

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        editing ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      )}
    >
      {!editing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-foreground">
                {copy.sku}
              </span>

              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full border font-medium",
                  getStatusColor(status)
                )}
              >
                {getStatusLabel(status)}
              </span>

              <span className="text-xs font-mono text-foreground bg-muted border border-border rounded-md px-2 py-0.5">
                {copy.location ?? copy.bin_id ?? "No bin"}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {copy.condition && (
                <span className="capitalize">{copy.condition}</span>
              )}

              {copy.received_at && (
                <span>
                  Received {new Date(copy.received_at).toLocaleDateString()}
                </span>
              )}

              {copy.notes && <span className="italic">"{copy.notes}"</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:justify-end">
            {copy.status !== "pending_qc" && (
              <button
                onClick={() =>
                  sendToQC.mutate({ id: copy.id, status: "pending_qc" })
                }
                disabled={sendToQC.isPending}
                title="Send to QC queue"
                className="min-h-9 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {sendToQC.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FlaskConical className="w-3 h-3" />
                )}
                QC
              </button>
            )}

            <button
              onClick={() => setEditing(true)}
              className="min-h-9 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Edit
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FieldInput label="SKU" value={sku} onChange={setSku} mono />

            <FieldInput label="Bin" value={bin} onChange={setBin} mono />

            {requiresShelvingSection(copy.age_group) && (
              <FieldInput
                label="Section"
                value={section}
                onChange={value =>
                  setSection(normalizeShelvingSection(value) ?? "")
                }
                placeholder="A"
                mono
              />
            )}

            <FieldSelect
              label="Status"
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
            />

            <FieldSelect
              label="Condition"
              value={condition}
              options={[
                { value: "new", label: "New" },
                { value: "good", label: "Good" },
                { value: "fair", label: "Fair" },
                { value: "poor", label: "Poor" },
              ]}
              onChange={setCondition}
            />
          </div>

          <FieldInput
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="QC notes, damage description…"
          />

          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              Location preview
            </p>
            <p className="text-sm font-mono font-bold text-foreground mt-0.5">
              {formatInventoryLocation(bin, section) ?? "No bin"}
            </p>
          </div>

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
              {updateCopy.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
interface BookDetailDrawerProps {
  bookId: string | null;
  onClose: () => void;
}

export function BookDetailDrawer({ bookId, onClose }: BookDetailDrawerProps) {
  const utils = trpc.useUtils();

  const {
    data: book,
    isLoading,
    refetch,
  } = trpc.inventory.getBookDetail.useQuery(
    { id: bookId! },
    { enabled: !!bookId }
  );

  const [titleEdit, setTitleEdit] = useState<Partial<BookDetail>>({});
  const [titleDirty, setTitleDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "copies">("overview");

  useEffect(() => {
    setTitleEdit({});
    setTitleDirty(false);
    setActiveTab("overview");
  }, [bookId]);

  const updateTitle = trpc.inventory.updateBookTitle.useMutation({
    onSuccess: () => {
      toast.success("Book details saved");
      setTitleDirty(false);
      setTitleEdit({});
      refetch();
      utils.inventory.bookTitles.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const handleTitleChange = (field: keyof BookDetail, value: string) => {
    setTitleEdit(prev => ({ ...prev, [field]: value }));
    setTitleDirty(true);
  };

  const saveTitle = () => {
    if (!book) return;
    updateTitle.mutate({ id: book.id, ...titleEdit } as any);
  };

  const display = book ? ({ ...book, ...titleEdit } as BookDetail) : null;
  const open = !!bookId;

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 bg-black/30 z-40 transition-opacity duration-200",
          open
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          "fixed top-0 right-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-2xl z-50 flex flex-col transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">
              Book Details
            </h2>
            <p className="text-xs text-muted-foreground">
              Metadata, classification, and physical copies
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="flex gap-4 items-start">
                  <div className="w-20 h-28 rounded-lg overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
                    {display.cover_url ? (
                      <img
                        src={display.cover_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <BookOpen className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-bold text-foreground leading-tight">
                      {display.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {display.author || "Unknown author"}
                    </p>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <InfoPill className="bg-primary/10 text-primary border-primary/20">
                        {formatAgeTier(display.age_group)}
                      </InfoPill>

                      {display.bin_theme && (
                        <InfoPill className="bg-emerald-50 text-emerald-800 border-emerald-200">
                          <Sparkles className="inline w-3 h-3 mr-1" />
                          {display.bin_theme}
                        </InfoPill>
                      )}

                      <span className="text-xs text-muted-foreground">
                        {book.copies.length}{" "}
                        {book.copies.length === 1 ? "copy" : "copies"}
                      </span>
                    </div>

                    {display.tags?.length > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                          <Tags className="w-3.5 h-3.5" />
                          Tags
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {display.tags.map(tag => (
                            <span
                              key={tag.id}
                              className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border"
                            >
                              {tag.tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {display.description && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Description
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                      {display.description}
                    </p>
                  </div>
                )}
              </section>

              <div className="flex gap-2 border-b border-border overflow-x-auto">
                {[
                  { value: "overview", label: "Details", icon: BookOpen },
                  { value: "copies", label: "Copies", icon: Copy },
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.value;

                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() =>
                        setActiveTab(tab.value as "overview" | "copies")
                      }
                      className={cn(
                        "min-h-11 flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === "overview" && (
                <section>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Title Information
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <FieldInput
                        label="Title"
                        value={display.title ?? ""}
                        onChange={value => handleTitleChange("title", value)}
                      />
                    </div>

                    <div className="col-span-2">
                      <FieldInput
                        label="Author"
                        value={display.author ?? ""}
                        onChange={value => handleTitleChange("author", value)}
                      />
                    </div>

                    <FieldInput
                      label="ISBN"
                      value={display.isbn ?? ""}
                      onChange={value => handleTitleChange("isbn", value)}
                      placeholder="978-…"
                      mono
                    />

                    <FieldSelect
                      label="Age Tier"
                      value={display.age_group ?? ""}
                      options={AGE_GROUP_OPTIONS}
                      onChange={value =>
                        handleTitleChange(
                          "age_group",
                          normalizeAgeGroupValue(value)
                        )
                      }
                    />

                    <FieldSelect
                      label="Theme"
                      value={display.bin_theme ?? ""}
                      options={THEME_OPTIONS}
                      onChange={value => handleTitleChange("bin_theme", value)}
                    />

                    <details className="col-span-2 rounded-lg border border-border bg-muted/20 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Publishing and cover
                      </summary>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <FieldInput
                          label="Publisher"
                          value={display.publisher ?? ""}
                          onChange={value =>
                            handleTitleChange("publisher", value)
                          }
                        />

                        <FieldInput
                          label="Published Date"
                          value={display.published_date ?? ""}
                          onChange={value =>
                            handleTitleChange("published_date", value)
                          }
                          placeholder="2023-01-01"
                        />

                        <FieldInput
                          label="Page Count"
                          value={display.page_count?.toString() ?? ""}
                          onChange={value =>
                            handleTitleChange("page_count", value)
                          }
                        />

                        <div className="col-span-2">
                          <label className="text-xs font-medium text-muted-foreground block mb-1">
                            Cover Image URL
                          </label>

                          <div className="flex gap-2">
                            <input
                              value={display.cover_url ?? ""}
                              onChange={e =>
                                handleTitleChange("cover_url", e.target.value)
                              }
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
                    </details>
                  </div>

                  <details className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Classification metadata
                    </summary>

                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-3">
                      <div>
                        <span className="font-medium text-foreground">
                          Theme:
                        </span>{" "}
                        {display.bin_theme ?? "—"}
                      </div>

                      <div>
                        <span className="font-medium text-foreground">
                          AI Age:
                        </span>{" "}
                        {formatAgeTier(display.suggested_age_tier)}
                      </div>

                      <div>
                        <span className="font-medium text-foreground">
                          Source:
                        </span>{" "}
                        {display.metadata_source ?? "—"}
                      </div>

                      <div>
                        <span className="font-medium text-foreground">
                          Version:
                        </span>{" "}
                        {display.classification_version ?? "—"}
                      </div>
                    </div>

                    {Array.isArray(display.subjects) &&
                      display.subjects.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-foreground mb-1">
                            Subjects
                          </p>

                          <div className="flex flex-wrap gap-1.5">
                            {display.subjects.slice(0, 12).map(subject => (
                              <span
                                key={subject}
                                className="text-xs px-2 py-0.5 rounded-md bg-background border border-border text-muted-foreground"
                              >
                                {subject}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </details>

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
              )}

              {activeTab === "copies" && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Physical Copies ({book.copies.length})
                    </h3>

                    <div className="flex gap-1.5 flex-wrap justify-end">
                      {(() => {
                        const counts: Record<string, number> = {};

                        book.copies.forEach((copy: BookCopy) => {
                          counts[copy.status] = (counts[copy.status] ?? 0) + 1;
                        });

                        return Object.entries(counts).map(
                          ([statusKey, count]) => (
                            <span
                              key={statusKey}
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full border",
                                getStatusColor(statusKey)
                              )}
                            >
                              {count} {getStatusLabel(statusKey)}
                            </span>
                          )
                        );
                      })()}
                    </div>
                  </div>

                  {book.copies.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No copies on record.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {book.copies.map((copy: BookCopy) => (
                        <CopyRow
                          key={copy.id}
                          copy={copy}
                          onSaved={() => {
                            refetch();
                            utils.inventory.bookTitles.invalidate();
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
