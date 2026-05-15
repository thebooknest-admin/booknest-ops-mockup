// BookNest Ops — Label Queue
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Tag, Download, Printer, CheckCircle2, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

type LabelCopy = {
  id: string;
  sku: string;
  isbn: string | null;
  age_group: string | null;
  bin_id: string | null;
  label_status: string | null;
  received_at: string | null;
  book_title: {
    title: string;
    author: string;
    isbn: string | null;
    bin_theme?: string | null;
  } | null;
};

function LabelCard({ copy }: { copy: LabelCopy }) {
  const title = copy.book_title?.title ?? "—";
  const isbn = copy.isbn ?? copy.book_title?.isbn ?? "";
  const sku = copy.sku ?? "";
  const bin = copy.bin_id ?? "";

  return (
    <div className="label-card">
      <div>
        <strong>{title}</strong>
        <div>ISBN: {isbn || "—"}</div>
        <div>{sku}</div>
        <div>Bin: {bin || "—"}</div>
      </div>
      {sku && <QRCodeSVG value={sku} size={72} level="M" />}
    </div>
  );
}

export default function LabelsPage() {
  const utils = trpc.useUtils();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ageFilter, setAgeFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");

  const { data: pendingCopies = [], isLoading, refetch } =
    trpc.labels.pending.useQuery(undefined, {
      refetchInterval: 60_000,
    });

  const filteredCopies = useMemo(() => {
    return pendingCopies.filter((copy) => {
      const ageMatches =
        ageFilter === "all" || copy.age_group === ageFilter;

      const themeMatches =
        themeFilter === "all" ||
        copy.book_title?.bin_theme === themeFilter;

      return ageMatches && themeMatches;
    });
  }, [pendingCopies, ageFilter, themeFilter]);

  const ageOptions = useMemo(() => {
    return Array.from(
      new Set(pendingCopies.map((c) => c.age_group).filter(Boolean))
    ).sort();
  }, [pendingCopies]);

  const themeOptions = useMemo(() => {
    return Array.from(
      new Set(pendingCopies.map((c) => c.book_title?.bin_theme).filter(Boolean))
    ).sort();
  }, [pendingCopies]);

  const markPrinted = trpc.labels.markPrinted.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`${vars.ids.length} label${vars.ids.length > 1 ? "s" : ""} marked as printed`);
      setSelected(new Set());
      utils.labels.pending.invalidate();
    },
    onError: (err) => toast.error("Failed: " + err.message),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    if (selected.size === filteredCopies.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredCopies.map((c) => c.id)));
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Title", "Author", "SKU"],
      ...filteredCopies.map((c) => [
        c.book_title?.title ?? "",
        c.book_title?.author ?? "",
        c.sku ?? "",
      ]),
    ];

    const csv = rows
      .map((r) =>
        r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `label-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const printSelected = () => window.print();

  const someSelected = selected.size > 0;
  const allFilteredSelected =
    filteredCopies.length > 0 && selected.size === filteredCopies.length;

  const copiesToPrint = someSelected
    ? filteredCopies.filter((c) => selected.has(c.id))
    : filteredCopies;

  return (
    <>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #label-print-sheet { display: flex !important; }
          @page { margin: 0.25in; size: letter; }
        }

        #label-print-sheet {
          display: none;
          flex-wrap: wrap;
          gap: 8px;
          align-content: flex-start;
        }

        .label-card {
          width: 2.5in;
          height: 1.5in;
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 6px 8px;
          display: flex;
          justify-content: space-between;
          gap: 6px;
          background: white;
          font-family: monospace;
          page-break-inside: avoid;
          box-sizing: border-box;
          font-size: 7pt;
        }
      `}</style>

      <div id="label-print-sheet">
        {copiesToPrint.map((copy) => (
          <LabelCard key={copy.id} copy={copy} />
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Label Queue</h1>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading…"
                : `${filteredCopies.length} of ${pendingCopies.length} copies showing`}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <select
              value={ageFilter}
              onChange={(e) => {
                setAgeFilter(e.target.value);
                setSelected(new Set());
              }}
              className="text-xs px-3 py-2 rounded-lg border border-border bg-background"
            >
              <option value="all">All Ages</option>
              {ageOptions.map((age) => (
                <option key={age} value={age ?? ""}>
                  {age}
                </option>
              ))}
            </select>

            <select
              value={themeFilter}
              onChange={(e) => {
                setThemeFilter(e.target.value);
                setSelected(new Set());
              }}
              className="text-xs px-3 py-2 rounded-lg border border-border bg-background"
            >
              <option value="all">All Themes</option>
              {themeOptions.map((theme) => (
                <option key={theme} value={theme ?? ""}>
                  {theme}
                </option>
              ))}
            </select>

            <button
              onClick={() => refetch()}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              Refresh
            </button>

            <button
              onClick={exportCSV}
              disabled={filteredCopies.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>

            <button
              onClick={printSelected}
              disabled={filteredCopies.length === 0}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted disabled:opacity-40"
            >
              <Tag className="w-3.5 h-3.5" />
              {someSelected ? `Print ${selected.size}` : "Print Showing"}
            </button>

            {someSelected && (
              <button
                onClick={() => markPrinted.mutate({ ids: Array.from(selected) })}
                disabled={markPrinted.isPending}
                className="flex items-center gap-1.5 text-xs font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                <Printer className="w-3.5 h-3.5" />
                Mark {selected.size} Printed
              </button>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading label queue…</p>
            </div>
          ) : filteredCopies.length === 0 ? (
            <div className="p-10 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-3" />
              <p className="text-sm font-medium">No labels match those filters.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 px-5 py-3 bg-muted/30 border-b border-border items-center">
                <div className="col-span-1">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAllFiltered}
                    className="w-4 h-4 rounded accent-primary cursor-pointer"
                  />
                </div>
                <span className="col-span-3 text-xs font-semibold uppercase">Title</span>
                <span className="col-span-2 text-xs font-semibold uppercase">Author</span>
                <span className="col-span-2 text-xs font-semibold uppercase">SKU</span>
                <span className="col-span-2 text-xs font-semibold uppercase">Theme</span>
                <span className="col-span-1 text-xs font-semibold uppercase">Age</span>
                <span className="col-span-1 text-xs font-semibold uppercase">Bin</span>
              </div>

              <div className="divide-y divide-border/50">
                {filteredCopies.map((copy) => {
                  const isChecked = selected.has(copy.id);

                  return (
                    <div
                      key={copy.id}
                      onClick={() => toggleSelect(copy.id)}
                      className={cn(
                        "grid grid-cols-12 px-5 py-3 items-center cursor-pointer",
                        isChecked ? "bg-primary/5" : "hover:bg-muted/20"
                      )}
                    >
                      <div className="col-span-1">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelect(copy.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded accent-primary cursor-pointer"
                        />
                      </div>

                      <div className="col-span-3 truncate text-sm font-medium">
                        {copy.book_title?.title ?? "—"}
                      </div>

                      <div className="col-span-2 truncate text-xs text-muted-foreground">
                        {copy.book_title?.author ?? "—"}
                      </div>

                      <div className="col-span-2 text-xs font-mono font-semibold">
                        {copy.sku ?? "—"}
                      </div>

                      <div className="col-span-2 text-xs text-muted-foreground">
                        {copy.book_title?.bin_theme ?? "—"}
                      </div>

                      <div className="col-span-1 text-xs capitalize">
                        {copy.age_group ?? "—"}
                      </div>

                      <div className="col-span-1 text-xs font-mono text-muted-foreground">
                        {copy.bin_id ?? "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}