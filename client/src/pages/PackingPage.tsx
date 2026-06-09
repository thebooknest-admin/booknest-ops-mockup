// BookNest Ops — Packing Queue
// Shows all shipments in 'packing' status (books picked, needs mailer + extras)
// "Mark as Packed" moves shipment to 'packed' status → appears in Shipping Queue

import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowRight, BoxIcon, CheckCircle2, Package, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const TIER_LABELS: Record<string, string> = {
  "little-nest": "Little Nest",
  "cozy-nest": "Cozy Nest",
  "story-nest": "Story Nest",
  little_nest: "Little Nest",
  cozy_nest: "Cozy Nest",
  story_nest: "Story Nest",
};

const TIER_BOOK_COUNT: Record<string, number> = {
  "little-nest": 4,
  "cozy-nest": 6,
  "story-nest": 8,
  little_nest: 4,
  cozy_nest: 6,
  story_nest: 8,
};

const AGE_LABELS: Record<string, string> = {
  hatchlings: "Hatchlings 0–2",
  fledglings: "Fledglings 3–5",
  soarers: "Soarers 6–8",
  sky_readers: "Sky Readers 9–12",
};

export default function PackingPage() {
  const [, navigate] = useLocation();
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  const { data, isLoading, refetch, isRefetching } =
    trpc.packing.list.useQuery(undefined, { refetchInterval: 60_000 });

  const markPacked = trpc.packing.markPacked.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Order marked as packed — it's now in the Shipping Queue.");
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.shipment_id);
        return next;
      });
      refetch();
    },
    onError: (err: any, variables) => {
      toast.error(`Failed to mark as packed: ${err.message}`);
      setMarkingIds((prev) => {
        const next = new Set(prev);
        next.delete(variables.shipment_id);
        return next;
      });
    },
  });

  const orders = data?.orders ?? [];

  function handleMarkPacked(shipment_id: string) {
    setMarkingIds((prev) => new Set(prev).add(shipment_id));
    markPacked.mutate({ shipment_id });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <BoxIcon className="w-6 h-6 text-muted-foreground" />
            Packing Queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading
              ? "Loading..."
              : `${orders.length} order${orders.length !== 1 ? "s" : ""} picked and ready to pack`}
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
          <button
            onClick={() => navigate("/shipping")}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            Go to Shipping <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Instructions banner ─────────────────────────────────────────────── */}
      {orders.length > 0 && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl border text-sm"
          style={{
            backgroundColor: "oklch(0.97 0.02 155)",
            borderColor: "oklch(0.88 0.06 155)",
            color: "oklch(0.35 0.10 155)",
          }}
        >
          <Package className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Put books in mailer, add any extras or freebies, then click{" "}
            <strong>Mark as Packed</strong> to move the order to the Shipping
            Queue.
          </span>
        </div>
      )}

      {/* ── Order list ──────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading packing queue...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground">Nothing to pack right now</p>
            <p className="text-xs text-muted-foreground mt-1">
              Orders will appear here once picking is complete.
            </p>
            <button
              onClick={() => navigate("/shipping")}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg text-white mx-auto transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              Go to Shipping <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-12 px-5 py-3 bg-muted/30">
              <span className="col-span-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">#</span>
              <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age Group</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ship By</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Books</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/50">
              {orders.map((order) => {
                const isMarking = markingIds.has(order.shipment_id);
                const tierLabel = TIER_LABELS[order.tier ?? ""] ?? order.tier ?? "—";
                const bookCount = TIER_BOOK_COUNT[order.tier ?? ""] ?? "?";
                const ageLabel = AGE_LABELS[order.age_group ?? ""] ?? order.age_group ?? "—";

                const shipDate = order.scheduled_ship_date
                  ? new Date(order.scheduled_ship_date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "—";

                return (
                  <div
                    key={order.shipment_id}
                    className="grid grid-cols-12 px-5 py-4 items-center hover:bg-muted/20 transition-colors"
                  >
                    {/* Order number */}
                    <div className="col-span-1">
                      <p className="text-xs font-mono text-muted-foreground">
                        {order.shipment_number ?? order.shipment_id.slice(0, 6).toUpperCase()}
                      </p>
                    </div>

                    {/* Member */}
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {order.member_name}
                      </p>
                      {order.address ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {order.address.city}, {order.address.state}
                        </p>
                      ) : (
                        <p className="text-xs text-red-500">No address on file</p>
                      )}
                    </div>

                    {/* Tier */}
                    <div className="col-span-2">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                        style={{
                          backgroundColor: "oklch(0.95 0.03 155)",
                          color: "oklch(0.35 0.10 155)",
                          borderColor: "oklch(0.85 0.06 155)",
                        }}
                      >
                        {tierLabel}
                      </span>
                    </div>

                    {/* Age group */}
                    <div className="col-span-2">
                      <span className="text-xs text-muted-foreground">{ageLabel}</span>
                    </div>

                    {/* Ship by */}
                    <div className="col-span-2">
                      <span className="text-xs text-foreground">{shipDate}</span>
                    </div>

                    {/* Book count + action */}
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {bookCount} books
                      </span>
                      <button
                        onClick={() => handleMarkPacked(order.shipment_id)}
                        disabled={isMarking}
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-50"
                        style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                      >
                        {isMarking ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                        {isMarking ? "Saving..." : "Mark as Packed"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
