/**
 * BookNest Ops — Batch Picking Page (Pharmacy-style)
 *
 * Morning workflow:
 * 1. See all members due to ship today
 * 2. Each member shows AI-suggested books (matched by age group + interests)
 * 3. Swap any suggestion if needed
 * 4. "Confirm All Picks" locks in assignments and creates shipments
 * 5. Navigate to the bin-sorted pick list, then ship each bundle
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Shuffle,
  ClipboardList,
  ArrowRight,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  "little-nest": "Little Nest",
  "cozy-nest": "Cozy Nest",
  "story-nest": "Story Nest",
};

const AGE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Hatchlings: { bg: "oklch(0.97 0.04 60)", text: "oklch(0.45 0.15 60)", border: "oklch(0.88 0.08 60)" },
  Fledglings: { bg: "oklch(0.97 0.04 155)", text: "oklch(0.42 0.11 155)", border: "oklch(0.85 0.06 155)" },
  "Sky Readers": { bg: "oklch(0.97 0.04 250)", text: "oklch(0.42 0.11 250)", border: "oklch(0.85 0.06 250)" },
  Soarers: { bg: "oklch(0.97 0.04 300)", text: "oklch(0.42 0.11 300)", border: "oklch(0.85 0.06 300)" },
};

// ─── Per-member book suggestion row ──────────────────────────────────────────

interface MemberPickCardProps {
  order: {
    member_id: string;
    member_name: string;
    tier: string | null;
    age_group: string;
    next_ship_date: string | null;
    books_needed: number;
    interests: string[];
    topics_to_avoid: string[];
    address: any;
  };
  picks: Record<string, string[]>; // member_id → book_title_ids
  onPicksChange: (memberId: string, titleIds: string[]) => void;
  confirmed: boolean;
}

function MemberPickCard({ order, picks, onPicksChange, confirmed }: MemberPickCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [swappingIdx, setSwappingIdx] = useState<number | null>(null);

  const { data: suggestions, isLoading } = trpc.picking.suggestBooks.useQuery(
    { member_id: order.member_id, count: order.books_needed },
    { staleTime: 5 * 60 * 1000 }
  );

  const currentPicks = picks[order.member_id] ?? suggestions?.recommended?.map((b) => b.book_title_id) ?? [];
  const allSuggestions = suggestions?.all_suggestions ?? [];

  // Auto-populate picks from recommendations when they load
  const handleAutoFill = useCallback(() => {
    if (suggestions?.recommended) {
      onPicksChange(order.member_id, suggestions.recommended.map((b) => b.book_title_id));
    }
  }, [suggestions, order.member_id, onPicksChange]);

  const handleSwap = (idx: number, newTitleId: string) => {
    const updated = [...currentPicks];
    updated[idx] = newTitleId;
    onPicksChange(order.member_id, updated);
    setSwappingIdx(null);
  };

  const isOverdue = order.next_ship_date && new Date(order.next_ship_date) < new Date();
  const ageColors = AGE_COLORS[order.age_group] ?? AGE_COLORS["Fledglings"];
  const booksSelected = currentPicks.filter(Boolean).length;
  const booksNeeded = order.books_needed;
  const isComplete = booksSelected >= booksNeeded;

  return (
    <div className={cn(
      "bg-card rounded-xl border overflow-hidden transition-all",
      confirmed ? "border-green-300 opacity-70" : isComplete ? "border-green-200" : "border-border"
    )}>
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Status dot */}
        <div className={cn(
          "w-2.5 h-2.5 rounded-full shrink-0",
          confirmed ? "bg-green-500" : isComplete ? "bg-green-400" : isLoading ? "bg-muted-foreground/30 animate-pulse" : "bg-amber-400"
        )} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground">{order.member_name}</span>
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
              style={{ backgroundColor: ageColors.bg, color: ageColors.text, borderColor: ageColors.border }}
            >
              {order.age_group}
            </span>
            {order.tier && (
              <span className="text-xs text-muted-foreground">
                {TIER_LABELS[order.tier] ?? order.tier}
              </span>
            )}
            {isOverdue && (
              <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle className="w-3 h-3" /> Overdue
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">
              {booksSelected}/{booksNeeded} books selected
            </span>
            {order.interests.length > 0 && (
              <span className="text-xs text-muted-foreground">
                Interests: {order.interests.slice(0, 2).join(", ")}{order.interests.length > 2 ? ` +${order.interests.length - 2}` : ""}
              </span>
            )}
            {order.topics_to_avoid.length > 0 && (
              <span className="text-xs text-red-500">
                Avoid: {order.topics_to_avoid.join(", ")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmed && (
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
            </span>
          )}
          {!confirmed && !isComplete && !isLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); handleAutoFill(); }}
              className="text-xs px-2.5 py-1 rounded-lg border border-border hover:bg-muted transition-colors flex items-center gap-1"
            >
              <BookOpen className="w-3 h-3" /> Auto-fill
            </button>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded book list */}
      {expanded && !confirmed && (
        <div className="border-t border-border/50 px-5 py-4 space-y-2 bg-muted/10">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Finding best books…</span>
            </div>
          ) : (
            <>
              {Array.from({ length: booksNeeded }).map((_, idx) => {
                const titleId = currentPicks[idx];
                const book = allSuggestions.find((s) => s.book_title_id === titleId)
                  ?? suggestions?.recommended?.[idx];
                const isSwapping = swappingIdx === idx;

                return (
                  <div key={idx} className="flex items-start gap-3">
                    {/* Slot number */}
                    <span className="text-xs font-mono text-muted-foreground w-5 pt-2 shrink-0">
                      {idx + 1}.
                    </span>

                    {isSwapping ? (
                      // Swap dropdown
                      <div className="flex-1 bg-background border border-border rounded-lg p-2 space-y-1 max-h-48 overflow-y-auto">
                        <p className="text-xs font-medium text-muted-foreground px-1 pb-1 border-b border-border/50">
                          Select a replacement:
                        </p>
                        {allSuggestions
                          .filter((s) => !currentPicks.includes(s.book_title_id) || s.book_title_id === titleId)
                          .map((s) => (
                            <button
                              key={s.book_title_id}
                              onClick={() => handleSwap(idx, s.book_title_id)}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 transition-colors"
                            >
                              <p className="text-xs font-medium text-foreground truncate">{s.title}</p>
                              <p className="text-xs text-muted-foreground">{s.author} · {s.match_reason}</p>
                            </button>
                          ))}
                        <button
                          onClick={() => setSwappingIdx(null)}
                          className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : book ? (
                      // Book chip
                      <div className="flex-1 flex items-center gap-2 bg-background border border-border/60 rounded-lg px-3 py-2">
                        {book.cover_url ? (
                          <img src={book.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                        ) : (
                          <div className="w-7 h-9 bg-muted rounded shrink-0 flex items-center justify-center">
                            <BookOpen className="w-3 h-3 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{book.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                          {book.match_reason && (
                            <p className="text-xs mt-0.5" style={{ color: "oklch(0.50 0.12 155)" }}>
                              {book.match_reason}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground">{book.bin_id}</span>
                          <button
                            onClick={() => setSwappingIdx(idx)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title="Swap book"
                          >
                            <Shuffle className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Empty slot
                      <button
                        onClick={() => setSwappingIdx(idx)}
                        className="flex-1 flex items-center gap-2 border border-dashed border-border rounded-lg px-3 py-2 hover:bg-muted/30 transition-colors"
                      >
                        <span className="text-xs text-muted-foreground">Click to select a book</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Picking Page ────────────────────────────────────────────────────────

export default function PickingPage() {
  const [, navigate] = useLocation();
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [confirmedShipments, setConfirmedShipments] = useState<{ member_id: string; shipment_id: string; shipment_number: string }[]>([]);
  const [showPickList, setShowPickList] = useState(false);

  const { data: dailyData, isLoading, refetch, isRefetching } =
    trpc.picking.dailyOrders.useQuery(undefined, { refetchInterval: 5 * 60 * 1000 });

  const confirmMutation = trpc.picking.confirmPicks.useMutation({
    onSuccess: (result) => {
      setConfirmedShipments(result.shipments);
      setShowPickList(true);
      toast.success(`${result.shipments.length} shipment${result.shipments.length !== 1 ? "s" : ""} created!`);
    },
    onError: (err) => {
      toast.error("Failed to confirm picks: " + err.message);
    },
  });

  const shipmentIds = confirmedShipments.map((s) => s.shipment_id);
  const { data: pickListData } = trpc.picking.batchPickList.useQuery(
    { shipment_ids: shipmentIds },
    { enabled: shipmentIds.length > 0 }
  );

  const orders = dailyData?.orders ?? [];
  const overdueCount = orders.filter((o) => o.next_ship_date && new Date(o.next_ship_date) < new Date()).length;

  const handlePicksChange = useCallback((memberId: string, titleIds: string[]) => {
    setPicks((prev) => ({ ...prev, [memberId]: titleIds }));
  }, []);

  const confirmedMemberIds = new Set(confirmedShipments.map((s) => s.member_id));

  const allPicksReady = orders.length > 0 && orders.every((o) => {
    const memberPicks = picks[o.member_id] ?? [];
    return memberPicks.filter(Boolean).length >= o.books_needed;
  });

  const handleConfirmAll = () => {
    const pickList = orders
      .filter((o) => !confirmedMemberIds.has(o.member_id))
      .map((o) => ({
        member_id: o.member_id,
        book_title_ids: (picks[o.member_id] ?? []).filter(Boolean),
      }))
      .filter((p) => p.book_title_ids.length > 0);

    if (!pickList.length) {
      toast.error("No picks to confirm. Auto-fill books for each member first.");
      return;
    }

    confirmMutation.mutate({ picks: pickList });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Daily Batch Picking</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? "Loading today's orders…"
              : `${orders.length} member${orders.length !== 1 ? "s" : ""} due to ship today`}
            {overdueCount > 0 && (
              <span className="ml-2 text-red-600 font-medium">· {overdueCount} overdue</span>
            )}
            {dailyData?.date && (
              <span className="ml-2 text-muted-foreground">
                · {new Date(dailyData.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Post-confirm: Bin-sorted pick list */}
      {showPickList && pickListData && (
        <div className="rounded-xl border-2 p-5 space-y-4" style={{ borderColor: "oklch(0.75 0.12 155)", backgroundColor: "oklch(0.97 0.03 155)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" style={{ color: "oklch(0.42 0.11 155)" }} />
              <h2 className="font-semibold text-foreground">
                Warehouse Pick List — {pickListData.total_books} books across {pickListData.bins.length} bins
              </h2>
            </div>
            <button
              onClick={() => navigate("/shipping")}
              className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              Go to Shipping <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm text-muted-foreground">
            Walk the warehouse in bin order. Pull each book and place it in the labelled tray for that member.
          </p>

          <div className="space-y-3">
                {pickListData.bins.map((bin) => (
                  <div key={bin.bin_id} className="bg-background rounded-lg border border-border overflow-hidden">
                    <div className="px-4 py-2.5 bg-muted/30 border-b border-border/50 flex items-center justify-between">
                      <span className="text-sm font-bold text-foreground font-mono tracking-wide">{bin.bin_id}</span>
                      <span className="text-xs text-muted-foreground">{bin.items.length} book{bin.items.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="divide-y divide-border/30">
                      {bin.items.map((item, i) => (
                        <div key={i} className="px-4 py-3 flex items-center gap-3">
                          {/* Cover thumbnail */}
                          {item.cover_url ? (
                            <img
                              src={item.cover_url}
                              alt={item.title}
                              className="w-9 h-12 object-cover rounded shadow-sm shrink-0 border border-border/40"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-9 h-12 bg-muted rounded shrink-0 flex items-center justify-center border border-border/40">
                              <BookOpen className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground truncate block">{item.title}</span>
                            <span className="text-xs text-muted-foreground">{item.author}</span>
                          </div>
                          {item.sku && (
                            <span className="text-xs font-mono text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded">{item.sku}</span>
                          )}
                          <span className="text-xs font-semibold shrink-0 px-2 py-1 rounded-full" style={{ color: "oklch(0.42 0.11 155)", backgroundColor: "oklch(0.95 0.03 155)" }}>
                            → {item.member_name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading today's orders and suggesting books…</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && orders.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-base font-medium text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No members are due to ship today.</p>
        </div>
      )}

      {/* Member pick cards */}
      {!isLoading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <MemberPickCard
              key={order.member_id}
              order={order}
              picks={picks}
              onPicksChange={handlePicksChange}
              confirmed={confirmedMemberIds.has(order.member_id)}
            />
          ))}
        </div>
      )}

      {/* Confirm All Picks sticky footer */}
      {!isLoading && orders.length > 0 && confirmedShipments.length < orders.length && (
        <div className="sticky bottom-6 flex justify-end">
          <button
            onClick={handleConfirmAll}
            disabled={confirmMutation.isPending}
            className={cn(
              "flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold shadow-lg transition-all",
              allPicksReady
                ? "hover:opacity-90 active:scale-95"
                : "opacity-60 cursor-not-allowed"
            )}
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            {confirmMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {confirmMutation.isPending
              ? "Creating shipments…"
              : `Confirm All Picks (${orders.filter((o) => !confirmedMemberIds.has(o.member_id)).length} orders)`}
          </button>
        </div>
      )}
    </div>
  );
}
