import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  PackageCheck,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Search,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No ship date";

const stateLabel: Record<string, string> = {
  out: "Out",
  received: "Received",
  missing: "Missing",
  issue: "Issue",
  kept: "Kept/Paid",
};

const stateClass: Record<string, string> = {
  out: "bg-sky-50 text-sky-700 border-sky-100",
  received: "bg-emerald-50 text-emerald-700 border-emerald-100",
  missing: "bg-rose-50 text-rose-700 border-rose-100",
  issue: "bg-amber-50 text-amber-700 border-amber-100",
  kept: "bg-violet-50 text-violet-700 border-violet-100",
};

export default function ReturnsPage() {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bundleNotes, setBundleNotes] = useState<Record<string, string>>({});
  const [bookNotes, setBookNotes] = useState<Record<string, string>>({});
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const utils = trpc.useUtils();
  const {
    data: bundles = [],
    isLoading,
    refetch: refetchBundles,
  } = trpc.returns.bundles.useQuery(
    { search: search.trim() || undefined },
    { refetchInterval: 60_000 }
  );
  const { data: history, isLoading: historyLoading, refetch: refetchHistory } =
    trpc.returns.history.useQuery({ limit: 20 });

  const invalidateReturns = () => {
    utils.returns.bundles.invalidate();
    utils.returns.openRequests.invalidate();
    utils.returns.history.invalidate();
    utils.inventory.summary.invalidate();
    utils.inventory.bookTitles.invalidate();
    utils.picking.dailyOrders.invalidate();
  };

  const processBundle = trpc.returns.processBundle.useMutation({
    onSuccess: result => {
      if (result.next_shipment?.created) {
        toast.success(
          `${result.processed_count} books checked in; new order ${result.next_shipment.order_number} added to Picking`
        );
      } else if (result.next_shipment_error) {
        toast.warning(
          `${result.processed_count} books checked in; no new order created: ${result.next_shipment_error}`
        );
      } else {
        toast.success(
          result.processed_count
            ? `${result.processed_count} books checked in`
            : "No outstanding books in that bundle"
        );
      }
      invalidateReturns();
    },
    onError: (err: any) => toast.error(`Failed to check in bundle: ${err.message}`),
  });

  const processBook = trpc.returns.processBundleBook.useMutation({
    onSuccess: (_result, variables) => {
      if (_result.next_shipment?.created) {
        toast.success(`Book checked in; new order ${_result.next_shipment.order_number} added to Picking`);
      } else if (_result.next_shipment_error) {
        toast.warning(`Book checked in; no new order created: ${_result.next_shipment_error}`);
      } else {
        toast.success(
          variables.outcome === "missing"
            ? "Book marked missing"
            : variables.outcome === "issue"
              ? "Book checked in with issue noted"
              : "Book checked in"
        );
      }
      invalidateReturns();
    },
    onError: (err: any) => toast.error(`Failed to update book: ${err.message}`),
  });

  const pendingAction =
    processBundle.isPending || processBook.isPending || isLoading;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="page-header">
          <h1 className="page-title">Process Returns</h1>
          <p className="page-subtitle">
            Find an active bundle, expand it, then check books in together or one by one
          </p>
        </div>
        <button
          onClick={() => refetchBundles()}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          title="Refresh bundles"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search member, bundle ID, shipment number, tracking number, title, or SKU"
            autoFocus
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <PackageSearch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium text-foreground">No active bundles found</p>
          <p className="text-xs mt-1">
            Try a different search, or refresh once new bundles are out with members.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bundles.map((bundle: any) => {
            const isExpanded = expandedId === bundle.id;
            const bundleLabel =
              bundle.shipment_number ??
              bundle.order_number ??
              bundle.id.slice(0, 8).toUpperCase();
            const outstandingBooks = bundle.books.filter(
              (book: any) => book.return_state === "out"
            );

            return (
              <div
                key={bundle.id}
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : bundle.id)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <PackageCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">
                          {bundle.member_name}
                        </p>
                        <span className="text-xs font-mono text-muted-foreground">
                          {bundleLabel}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {bundle.total_count} books · {bundle.out_count} out ·{" "}
                        {bundle.received_count} checked in
                        {bundle.missing_count ? ` · ${bundle.missing_count} missing` : ""}
                        {bundle.kept_count ? ` · ${bundle.kept_count} kept/paid` : ""}
                        {bundle.issue_count ? ` · ${bundle.issue_count} issue` : ""} ·{" "}
                        shipped {formatDate(bundle.actual_ship_date)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        "text-xs px-2 py-0.5 rounded-full border font-medium",
                        bundle.out_count
                          ? "bg-sky-50 text-sky-700 border-sky-100"
                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                      )}
                    >
                      {bundle.out_count ? "Open" : "Handled"}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-5 py-5 space-y-5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {[
                        ["Bundle", bundleLabel],
                        ["Tracking", bundle.tracking_number ?? "None"],
                        ["Carrier", bundle.carrier ?? "None"],
                        ["Return", bundle.return_number ?? "Not started"],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                            {label}
                          </p>
                          <p className="font-medium text-foreground mt-0.5 truncate">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {outstandingBooks.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Bundle Notes
                        </p>
                        <textarea
                          rows={2}
                          value={bundleNotes[bundle.id] ?? ""}
                          onChange={e =>
                            setBundleNotes(prev => ({
                              ...prev,
                              [bundle.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional note for bulk check-in"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                        />
                        <button
                          onClick={() =>
                            processBundle.mutate({
                              shipment_id: bundle.id,
                              notes: bundleNotes[bundle.id]?.trim() || undefined,
                            })
                          }
                          disabled={pendingAction}
                          className="w-full md:w-auto px-4 py-2 rounded-lg text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                        >
                          {processBundle.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                          Check In All Outstanding
                        </button>
                      </div>
                    )}

                    <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                      {bundle.books.map((book: any) => {
                        const noteKey = `${bundle.id}:${book.copy_id}`;
                        const isHandled = book.return_state !== "out";

                        return (
                          <div key={book.shipment_book_id} className="p-4 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-semibold text-foreground">
                                    {book.sku ?? "No SKU"}
                                  </span>
                                  <span
                                    className={cn(
                                      "text-[11px] px-2 py-0.5 rounded-full border font-medium",
                                      stateClass[book.return_state] ?? stateClass.out
                                    )}
                                  >
                                    {stateLabel[book.return_state] ?? book.return_state}
                                  </span>
                                </div>
                                <p className="text-sm font-medium text-foreground mt-1">
                                  {book.title}
                                </p>
                                {book.author && (
                                  <p className="text-xs text-muted-foreground">
                                    {book.author}
                                  </p>
                                )}
                                {book.return_notes && (
                                  <p className="text-xs text-muted-foreground mt-1 italic">
                                    {book.return_notes}
                                  </p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {book.location ??
                                  book.bin_id ??
                                  book.copy_status?.replace(/_/g, " ") ??
                                  "No bin"}
                              </span>
                            </div>

                            {!isHandled && (
                              <div className="space-y-3">
                                <textarea
                                  rows={2}
                                  value={bookNotes[noteKey] ?? ""}
                                  onChange={e =>
                                    setBookNotes(prev => ({
                                      ...prev,
                                      [noteKey]: e.target.value,
                                    }))
                                  }
                                  placeholder="Optional note for missing books or issues"
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() =>
                                      processBook.mutate({
                                        shipment_id: bundle.id,
                                        shipment_book_id: book.shipment_book_id,
                                        copy_id: book.copy_id,
                                        outcome: "received",
                                        notes:
                                          bookNotes[noteKey]?.trim() || undefined,
                                      })
                                    }
                                    disabled={pendingAction}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 disabled:opacity-60 transition-colors"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Received
                                  </button>
                                  <button
                                    onClick={() =>
                                      processBook.mutate({
                                        shipment_id: bundle.id,
                                        shipment_book_id: book.shipment_book_id,
                                        copy_id: book.copy_id,
                                        outcome: "issue",
                                        notes:
                                          bookNotes[noteKey]?.trim() || undefined,
                                      })
                                    }
                                    disabled={pendingAction}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 disabled:opacity-60 transition-colors"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Issue
                                  </button>
                                  <button
                                    onClick={() =>
                                      processBook.mutate({
                                        shipment_id: bundle.id,
                                        shipment_book_id: book.shipment_book_id,
                                        copy_id: book.copy_id,
                                        outcome: "missing",
                                        notes:
                                          bookNotes[noteKey]?.trim() || undefined,
                                      })
                                    }
                                    disabled={pendingAction}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 disabled:opacity-60 transition-colors"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Missing
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => {
            setHistoryExpanded(v => !v);
            if (!historyExpanded) refetchHistory();
          }}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            <span className="font-semibold text-foreground text-sm">Return History</span>
            {history && history.length > 0 && (
              <span className="text-xs text-muted-foreground">({history.length} records)</span>
            )}
          </div>
          {historyExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {historyExpanded && (
          <div className="border-t border-border">
            {historyLoading ? (
              <div className="p-6 text-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading history...</p>
              </div>
            ) : !history || history.length === 0 ? (
              <div className="p-6 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-foreground">No return records yet</p>
                <p className="text-xs text-muted-foreground mt-1">Returns you process will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
                {history.map((r: any) => (
                  <div key={r.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-semibold text-foreground">
                            {r.return_number}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700">
                            {r.status}
                          </span>
                        </div>
                        {r.books?.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {r.books.map((rb: any, i: number) => (
                              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{rb.copy?.sku ?? "-"}</span>
                                <span className="text-border">·</span>
                                <span className="truncate">{rb.copy?.book_title?.title ?? "Unknown title"}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {r.notes && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{r.notes}"</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDate(r.actual_return_date)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
