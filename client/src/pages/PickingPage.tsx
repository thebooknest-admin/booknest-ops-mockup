/**
 * BookNest Ops — Scan-based Picking Page
 *
 * Workflow:
 * 1. Queue view — list of all pending orders
 * 2. Click an order to enter Pick Mode
 * 3. Pick Mode shows suggested books with bin location and SKU
 * 4. Scan each book's SKU to confirm (or swap for an alternate)
 * 5. All books scanned → Complete Order → next member
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Barcode,
  MapPin,
  Package,
  XCircle,
  Shuffle,
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

type ScanState = "idle" | "success" | "error";

interface ScannedBook {
  book_title_id: string;
  copy_id: string;
  sku: string;
}

// ─── Pick Mode (single order scan view) ──────────────────────────────────────

interface PickModeProps {
  order: any;
  onComplete: (scannedBooks: ScannedBook[]) => void;
  onBack: () => void;
}

function PickMode({ order, onComplete, onBack }: PickModeProps) {
  const [scannedBooks, setScannedBooks] = useState<Record<number, ScannedBook>>({});
  const [scanInput, setScanInput] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [activeSlot, setActiveSlot] = useState(0);
  const [birthdayBookAdded, setBirthdayBookAdded] = useState(false);
  const [birthdayGiftAdded, setBirthdayGiftAdded] = useState(false);


  // slotOverrides: map from slot index → index into all_suggestions

  const inputRef = useRef<HTMLInputElement>(null);

 const { data: pickList, isLoading } = trpc.picking.getShipmentPickList.useQuery(
  { shipment_id: order.shipment_id },
  { staleTime: 5 * 60 * 1000 }
);

const utils = trpc.useUtils();

const swapMutation = trpc.picking.swapShipmentBook.useMutation({
  onSuccess: () => {
  toast.success("Swapped book!");
  setScanState("idle");
  setScanMessage("");
  setScanInput("");
  utils.picking.getShipmentPickList.invalidate({
    shipment_id: order.shipment_id,
  });
},
  onError: (err) => {
    toast.error("Swap failed: " + err.message);
  },
});

  const allSuggestions = pickList?.map((book: any) => ({
  book_title_id: book.book_title_id,
  copy_id: book.book_copy_id,
  sku: book.book_sku,
  title: book.book_to_find?.replace(/^"|"$/g, "") ?? "Unknown Book",
author: "",
  bin_id: book.bin_id,
  match_reason: book.instruction,
})) ?? [];
 const booksNeeded = pickList?.length ?? order.books_needed;

  // Build the current slot→book mapping, applying any overrides
  const slotBooks = Array.from({ length: booksNeeded }, (_, idx) => {
  return allSuggestions[idx] ?? null;
});

  const allScanned = Object.keys(scannedBooks).length >= booksNeeded;


  // Swap a slot to the next unused suggestion
  const handleSwap = (slotIdx: number) => {
  if (slotIdx in scannedBooks) return;

  const currentBook = slotBooks[slotIdx];

  if (!currentBook?.copy_id) {
    toast.error("No book copy found to swap.");
    return;
  }

  swapMutation.mutate({
    shipment_id: order.shipment_id,
    member_id: order.member_id,
    old_book_copy_id: currentBook.copy_id,
    books_needed: 30,
  });
  };
  // Auto-focus scan input
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSlot]);

  const handleScan = useCallback((sku: string) => {
    if (!sku.trim() || allScanned) return;

    const expectedBook = slotBooks[activeSlot];
    if (!expectedBook) return;

    const scannedSku = sku.trim().toUpperCase();
    const expectedSku = expectedBook.sku?.toUpperCase();

    if (!expectedSku) {
      setScanState("error");
      setScanMessage("No SKU on file for this book. Try swapping it.");
      setScanInput("");
      return;
    }

    if (scannedSku === expectedSku) {
      if (Object.values(scannedBooks).some((b) => b.sku.toUpperCase() === scannedSku)) {
        setScanState("error");
        setScanMessage("This book was already scanned!");
        setScanInput("");
        return;
      }

      setScannedBooks((prev) => ({
        ...prev,
        [activeSlot]: {
          book_title_id: expectedBook.book_title_id,
          copy_id: expectedBook.copy_id!,
          sku: expectedBook.sku!,
        },
      }));
      setScanState("success");
      setScanMessage(`✓ ${expectedBook.title} confirmed!`);
      setScanInput("");
      setActiveSlot((prev) => Math.min(prev + 1, booksNeeded - 1));
      setTimeout(() => setScanState("idle"), 2000);
    } else {
      setScanState("error");
      setScanMessage(`Wrong book! Expected SKU: ${expectedSku}`);
      setScanInput("");
      setTimeout(() => setScanState("idle"), 3000);
    }
  }, [slotBooks, activeSlot, scannedBooks, allScanned]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleScan(scanInput);
  };

  const handleUnscan = (idx: number) => {
    setScannedBooks((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setActiveSlot(idx);
    setScanState("idle");
    setScanMessage("");
  };

  const ageColors = AGE_COLORS[order.age_group] ?? AGE_COLORS["Fledglings"];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Queue
        </button>
      </div>

      {/* Member info */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-foreground">{order.member_name}</h2>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
            style={{ backgroundColor: ageColors.bg, color: ageColors.text, borderColor: ageColors.border }}
          >
            {order.age_group}
          </span>
          <span className="text-sm text-muted-foreground">{TIER_LABELS[order.tier] ?? order.tier}</span>
          <span className="text-sm text-muted-foreground ml-auto">
            Ship date: {order.next_ship_date}
          </span>
        </div>
        {order.interests.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Interests: {order.interests.join(", ")}
          </p>
        )}
        {order.topics_to_avoid.length > 0 && (
          <p className="text-xs text-red-500 mt-1">
            Avoid: {order.topics_to_avoid.join(", ")}
          </p>
        )}

{order.birthday_box && (
  <div
    className="mt-3 rounded-xl border px-4 py-3"
    style={{
      backgroundColor: "oklch(0.97 0.04 85)",
      borderColor: "oklch(0.88 0.08 85)",
    }}
  >
    <p
      className="text-sm font-semibold"
      style={{ color: "oklch(0.55 0.14 75)" }}
    >
      🎂 Birthday Box
    </p>

    <p className="text-xs mt-1 text-muted-foreground">
      Birthday falls within this shipment window.
      Add a birthday-themed book if available and include a birthday gift.
    </p>
  </div>
)}

        {order.notes && (
  <p className="text-xs text-amber-600 mt-1">
    📝 {order.notes}
  </p>
)}
      </div>

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{ width: `${(Object.keys(scannedBooks).length / booksNeeded) * 100}%` }}
          />
        </div>
        <span className="text-sm font-medium text-foreground">
          {Object.keys(scannedBooks).length}/{booksNeeded} scanned
        </span>
      </div>

      {/* Book slots */}
      {isLoading ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Finding best books…</p>
        </div>
      ) : (
        <div className="space-y-3">
          {slotBooks.map((book, idx) => {
            if (!book) return null;
            const isScanned = idx in scannedBooks;
            const isActive = idx === activeSlot && !allScanned;
            const isPending = idx > activeSlot;
          

            return (
              <div
                key={`${book.book_title_id}-${idx}`}
                className={cn(
                  "rounded-xl border p-4 transition-all",
                  isScanned ? "border-green-300 bg-green-50" :
                  isActive ? "border-brand-teal bg-white shadow-md" :
                  "border-border bg-card opacity-50"
                )}
              >
                <div className="flex items-start gap-4">
                  {/* Cover */}
                  {book.cover_url ? (
                    <img src={book.cover_url} alt="" className="w-12 h-16 object-cover rounded shrink-0 shadow-sm" />
                  ) : (
                    <div className="w-12 h-16 bg-muted rounded shrink-0 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}

                  {/* Book info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{book.title}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{book.author}</p>
                        {book.match_reason && (
                          <p className="text-xs mt-1" style={{ color: "oklch(0.50 0.12 155)" }}>
                            {book.match_reason}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Swap button — only show for unscanned slots */}
                        {!isScanned && (isActive || isPending) && (
                          <button
  disabled={swapMutation.isPending}
  onClick={() => handleSwap(idx)}
                            className="flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ color: "oklch(0.42 0.11 260)", borderColor: "oklch(0.85 0.06 260)" }}
                            title="Swap for an alternate book"
                          >
                            <Shuffle className="w-3 h-3" />
                            Swap
                          </button>
                        )}
                        {isScanned && (
                          <>
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="w-4 h-4" /> Scanned
                            </span>
                            <button
                              onClick={() => handleUnscan(idx)}
                              className="text-xs text-muted-foreground hover:text-red-500 transition-colors"
                              title="Undo scan"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Location + SKU */}
                    <div className="flex items-center gap-4 mt-2">
                      {book.bin_id && (
                        <span className="flex items-center gap-1 text-xs font-mono font-bold text-foreground bg-muted px-2 py-1 rounded">
                          <MapPin className="w-3 h-3" /> {book.bin_id}
                        </span>
                      )}
                      {book.sku && (
                        <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground">
                          <Barcode className="w-3 h-3" /> {book.sku}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Scan input — only show for active slot */}
                {isActive && (
                  <div className="mt-4 pt-4 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-2">
                      Scan the barcode on the book spine to confirm:
                    </p>
                    <input
                      ref={inputRef}
                      type="text"
                      value={scanInput}
                      onChange={(e) => setScanInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Scan SKU…"
                      className={cn(
                        "w-full border rounded-lg px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 transition-all",
                        scanState === "success" ? "border-green-400 focus:ring-green-200 bg-green-50" :
                        scanState === "error" ? "border-red-400 focus:ring-red-200 bg-red-50" :
                        "border-border focus:ring-brand-teal/20"
                      )}
                      autoFocus
                    />
                    {scanMessage && (
                      <p className={cn(
                        "text-xs mt-2 font-medium",
                        scanState === "success" ? "text-green-600" : "text-red-500"
                      )}>
                        {scanMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Complete button */}
      {order.birthday_box && allScanned && (
  <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 space-y-3">
    <p className="text-sm font-semibold text-yellow-800">
      🎂 Birthday Checklist
    </p>

    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={birthdayBookAdded}
        onChange={(e) => setBirthdayBookAdded(e.target.checked)}
      />
      Birthday book added
    </label>

    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={birthdayGiftAdded}
        onChange={(e) => setBirthdayGiftAdded(e.target.checked)}
      />
      Birthday gift added
    </label>
  </div>
)}
      {allScanned && (
        <div className="sticky bottom-6">
          <button
          disabled={
  order.birthday_box &&
  (!birthdayBookAdded || !birthdayGiftAdded)
}
            onClick={() => onComplete(
              Object.entries(scannedBooks)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([, book]) => book)
            )}
           className={cn(
  "w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-white font-bold text-lg shadow-lg transition-all",
  order.birthday_box &&
    (!birthdayBookAdded || !birthdayGiftAdded)
    ? "opacity-50 cursor-not-allowed"
    : "hover:opacity-90 active:scale-95"
)}
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            <Package className="w-5 h-5" />
            Complete Order — {order.member_name}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Queue View ───────────────────────────────────────────────────────────────

export default function PickingPage() {
  const [, navigate] = useLocation();
  const [activeOrderIdx, setActiveOrderIdx] = useState<number | null>(null);
  const [completedShipments, setCompletedShipments] = useState<{ member_id: string; shipment_id: string; shipment_number: string; member_name: string }[]>([]);

  const { data: dailyData, isLoading, refetch, isRefetching } =
    trpc.picking.dailyOrders.useQuery(undefined, { refetchInterval: 5 * 60 * 1000 });

  const confirmMutation = trpc.picking.confirmPicks.useMutation({
    onSuccess: (result) => {
  setCompletedShipments((prev) => [
    ...prev,
    ...result.shipments.map((s) => ({
      ...s,
      member_name: orders.find((o) => o.member_id === s.member_id)?.member_name ?? "Member",
    })),
  ]);
      setActiveOrderIdx(null);
      toast.success("Order confirmed!");
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to confirm: " + err.message);
    },
  });

  const orders = dailyData?.orders ?? [];
  const completedMemberIds = new Set(completedShipments.map((s) => s.member_id));
  const pendingOrders = orders.filter((o) => !completedMemberIds.has(o.member_id));
  const activeOrder = activeOrderIdx !== null ? pendingOrders[activeOrderIdx] : null;

  const handleComplete = useCallback((order: any, scannedBooks: ScannedBook[]) => {
    confirmMutation.mutate({
      picks: [{
        member_id: order.member_id,
        shipment_id: order.shipment_id,
        book_title_ids: scannedBooks.map((b) => b.book_title_id),
        copy_ids: scannedBooks.map((b) => b.copy_id),
      }],
    });
  }, [confirmMutation]);

  if (activeOrder) {
    return (
      <PickMode
        order={activeOrder}
        onComplete={(scannedBooks) => handleComplete(activeOrder, scannedBooks)}
        onBack={() => setActiveOrderIdx(null)}
      />
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Picking Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? "Loading orders…"
              : `${pendingOrders.length} order${pendingOrders.length !== 1 ? "s" : ""} pending`}
            {completedShipments.length > 0 && (
              <span className="ml-2 text-green-600 font-medium">
                · {completedShipments.length} completed today
              </span>
            )}
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
          {completedShipments.length > 0 && (
            <button
              onClick={() => navigate("/packing")}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              Go to Packing <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading orders…</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && pendingOrders.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-base font-medium text-foreground">All caught up!</p>
          <p className="text-sm text-muted-foreground mt-1">No pending orders to pick.</p>
          {completedShipments.length > 0 && (
            <button
              onClick={() => navigate("/packing")}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white mx-auto transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              Go to Packing <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Order queue */}
      {!isLoading && pendingOrders.length > 0 && (
        <div className="space-y-3">
          {pendingOrders.map((order, idx) => {
            const ageColors = AGE_COLORS[order.age_group] ?? AGE_COLORS["Fledglings"];
            const isOverdue = order.next_ship_date && order.next_ship_date < new Date().toISOString().split("T")[0];
            return (
              <button
                key={order.member_id}
                onClick={() => setActiveOrderIdx(idx)}
                className="w-full bg-card rounded-xl border border-border p-5 text-left hover:border-brand-teal hover:shadow-md transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{order.member_name}</span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{ backgroundColor: ageColors.bg, color: ageColors.text, borderColor: ageColors.border }}
                      >
                        {order.age_group}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {TIER_LABELS[order.tier] ?? order.tier} · {order.books_needed} books
                      </span>
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                          <AlertTriangle className="w-3 h-3" /> Overdue
                        </span>
                      )}
                      {order.birthday_box && (
  <span
    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
    style={{
      backgroundColor: "oklch(0.96 0.05 85)",
      color: "oklch(0.55 0.14 75)",
    }}
  >
    🎂 Birthday Box
  </span>
)}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">Ship: {order.next_ship_date}</span>
                      {order.interests.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {order.interests.slice(0, 2).join(", ")}{order.interests.length > 2 ? ` +${order.interests.length - 2}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-brand-teal transition-colors shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Completed orders */}
      {completedShipments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">Completed</p>
          {completedShipments.map((s) => (
            <div key={s.shipment_id} className="bg-green-50 rounded-xl border border-green-200 px-5 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {s.member_name}
              </span>
              <span className="text-xs text-muted-foreground font-mono">{s.shipment_number}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}