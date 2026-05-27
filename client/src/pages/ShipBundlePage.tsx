// BookNest Ops — Ship Bundle Detail
import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Truck,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

// Status flow: picking → packing → packed → shipped
const STEPS = ["Picked", "Packed", "Shipped"];

const statusToStep: Record<string, number> = {
  picking:  0,
  packing:  0,
  packed:   1,
  shipped:  2,
  shipping: 2, // legacy
  delivered: 2,
};

const CHECKLIST_ITEMS = [
  {
    key: "labelPrinted",
    label: "Print & apply shipping label",
    sub: "Affix to the largest flat surface",
  },
  {
    key: "sealed",
    label: "Mailer is sealed",
    sub: "Tape all edges securely",
  },
  {
    key: "dropOff",
    label: "Ready to drop off at USPS",
    sub: "Tuesday or Friday ship day",
  },
];

function TrackingEntry({ shipmentId, currentTracking, currentCarrier, onSaved }: {
  shipmentId: string;
  currentTracking?: string | null;
  currentCarrier?: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!currentTracking);
  const [tracking, setTracking] = useState(currentTracking ?? "");
  const [carrier, setCarrier] = useState(currentCarrier ?? "USPS");

  const updateTracking = trpc.shipments.updateTracking.useMutation({
    onSuccess: () => {
      toast.success("Tracking saved!");
      setEditing(false);
      onSaved();
    },
    onError: (err) => toast.error("Failed to save: " + err.message),
  });

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-4 text-xs text-muted-foreground underline hover:text-foreground transition-colors"
      >
        Edit tracking
      </button>
    );
  }

  return (
    <div className="mt-5 text-left space-y-3 border-t border-border pt-5">
      <p className="text-sm font-semibold text-foreground">Add Tracking</p>
      <div className="space-y-2">
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="USPS">USPS</option>
          <option value="UPS">UPS</option>
          <option value="FedEx">FedEx</option>
          <option value="Other">Other</option>
        </select>
        <input
          type="text"
          placeholder="Tracking number"
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => updateTracking.mutate({ id: shipmentId, tracking_number: tracking, carrier })}
          disabled={!tracking || updateTracking.isPending}
          className="flex-1 text-sm font-semibold py-2 rounded-lg text-white disabled:opacity-40"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
        >
          {updateTracking.isPending ? "Saving…" : "Save Tracking"}
        </button>
        {currentTracking && (
          <button
            onClick={() => setEditing(false)}
            className="px-4 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export default function ShipBundlePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const {
    data: shipment,
    isLoading,
    error,
    refetch,
  } = trpc.shipments.byId.useQuery({ id: id! }, { enabled: !!id });

  const markShipped = trpc.shipping.markShipped.useMutation({
    onSuccess: () => {
      toast.success(
        `${shipment?.order_number ?? shipment?.shipment_number ?? "Bundle"} marked as shipped!`
      );
      refetch();
      setTimeout(() => navigate("/shipping"), 1200);
    },
    onError: (err) => toast.error("Failed to ship: " + err.message),
  });

  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    labelPrinted: false,
    sealed: false,
    dropOff: false,
  });

  const toggleCheck = (key: string) =>
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));

  const allChecked = CHECKLIST_ITEMS.every((i) => checklist[i.key]);

  const handleMarkShipped = () => {
    if (!shipment) return;
    if (!shipment.tracking_number) {
      toast.error("Add a tracking number before marking this bundle shipped.");
      return;
    }
    markShipped.mutate({
      shipment_id: shipment.id,
      tracking_number: shipment.tracking_number,
    });
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center justify-center min-h-64">
        <div className="text-center">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading shipment…</p>
        </div>
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Link href="/shipping">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Shipping
          </button>
        </Link>
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Shipment not found.</p>
        </div>
      </div>
    );
  }

  // ── Derived values ───────────────────────────────────────────────────────
  const memberName =
    (shipment as any).member?.name ??
    (shipment as any).member_name ??
    "Unknown Member";
  const address = (shipment as any).address;
  const books: any[] = (shipment as any).books ?? [];
  const orderNum =
    shipment.order_number ??
    shipment.shipment_number ??
    shipment.id.slice(0, 8).toUpperCase();
  const shipByDate = shipment.scheduled_ship_date
    ? new Date(shipment.scheduled_ship_date).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    : "—";
  const isOverdue =
    !!shipment.scheduled_ship_date &&
    new Date(shipment.scheduled_ship_date) < new Date();
  const currentStep = statusToStep[shipment.status ?? "packed"] ?? 1;
  const isShipped =
    shipment.status === "shipped" ||
    shipment.status === "shipping" ||
    shipment.status === "delivered";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* ── Back link ──────────────────────────────────────────────────────── */}
      <Link href="/shipping">
        <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Shipping Queue
        </button>
      </Link>

      {/* ── Header card ────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{memberName}</h1>
            <p className="text-sm text-muted-foreground font-mono mt-0.5">
              {orderNum}
            </p>
          </div>
          <span
            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize border"
            style={{
              backgroundColor: isShipped
                ? "oklch(0.95 0.05 155)"
                : "oklch(0.97 0.04 75)",
              color: isShipped
                ? "oklch(0.35 0.10 155)"
                : "oklch(0.45 0.12 75)",
              borderColor: isShipped
                ? "oklch(0.85 0.06 155)"
                : "oklch(0.88 0.08 75)",
            }}
          >
            {shipment.status}
          </span>
        </div>

        {/* Step progress */}
        <div className="mt-6 flex items-center">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    i < currentStep
                      ? "text-white"
                      : i === currentStep
                      ? "text-white ring-4 ring-offset-2"
                      : "bg-muted text-muted-foreground"
                  )}
                  style={
                    i <= currentStep
                      ? { backgroundColor: "oklch(0.42 0.11 155)" }
                      : {}
                  }
                >
                  {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "text-xs mt-1.5 font-medium whitespace-nowrap",
                    i === currentStep
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className="flex-1 h-0.5 mb-5 mx-1"
                  style={{
                    backgroundColor:
                      i < currentStep
                        ? "oklch(0.42 0.11 155)"
                        : "oklch(0.91 0.006 80)",
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Order details ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-3">Order Summary</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Books</span>
              <span className="font-medium">{books.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order #</span>
              <span className="font-medium font-mono text-xs">{orderNum}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ship By</span>
              <span
                className={cn(
                  "font-medium",
                  isOverdue && !isShipped ? "text-red-600" : ""
                )}
              >
                {shipByDate}
              </span>
            </div>
            {shipment.actual_ship_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipped</span>
                <span className="font-medium text-green-700">
                  {new Date(shipment.actual_ship_date).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  )}
                </span>
              </div>
            )}
            {shipment.tracking_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tracking</span>
                <span className="font-medium font-mono text-xs">
                  {shipment.tracking_number}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-3">Ship To</h2>
          {address ? (
            <div className="text-sm space-y-1">
              <p className="font-medium">{memberName}</p>
              <p className="text-muted-foreground">
                {address.street}
                {address.street2 ? `, ${address.street2}` : ""}
              </p>
              <p className="text-muted-foreground">
                {address.city}, {address.state} {address.zip}
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-500 font-medium">
              No address on file
            </p>
          )}
        </div>
      </div>

      {/* ── Books list ─────────────────────────────────────────────────────── */}
      {books.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-3">
            Books in This Bundle ({books.length})
          </h2>
          <div className="space-y-0">
            {books.map((b: any, idx: number) => (
              <div
                key={b.id ?? idx}
                className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {b.book_title?.title ?? "Unknown Title"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.book_title?.author ?? ""}
                  </p>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {b.sku ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ship checklist — only shown for packed orders ───────────────────── */}
      {!isShipped && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-4">Pre-Ship Checklist</h2>
          <TrackingEntry
            shipmentId={shipment.id}
            currentTracking={shipment.tracking_number}
            currentCarrier={shipment.carrier}
            onSaved={() => refetch()}
          />
          <div className="space-y-3">
            {CHECKLIST_ITEMS.map((item) => (
              <button
                key={item.key}
                onClick={() => toggleCheck(item.key)}
                className="w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left"
                style={
                  checklist[item.key]
                    ? {
                        borderColor: "oklch(0.62 0.16 155)",
                        backgroundColor: "oklch(0.97 0.03 155)",
                      }
                    : {
                        borderColor: "oklch(0.91 0.006 80)",
                        backgroundColor: "transparent",
                      }
                }
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                    checklist[item.key]
                      ? "border-transparent"
                      : "border-muted-foreground/30"
                  )}
                  style={
                    checklist[item.key]
                      ? { backgroundColor: "oklch(0.42 0.11 155)" }
                      : {}
                  }
                >
                  {checklist[item.key] && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <div>
                  <p
                    className={cn(
                      "text-sm font-medium",
                      checklist[item.key] &&
                        "line-through text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.sub}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <button
              onClick={handleMarkShipped}
              disabled={!allChecked || !shipment.tracking_number || markShipped.isPending}
              className={cn(
                "w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl text-white transition-all",
                !allChecked || !shipment.tracking_number || markShipped.isPending
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:opacity-90"
              )}
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              {markShipped.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
              {markShipped.isPending ? "Shipping…" : "Mark as Shipped"}
            </button>
            {!allChecked && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                Complete the checklist above to ship this order
              </p>
            )}
            {allChecked && !shipment.tracking_number && (
              <p className="text-xs text-center text-muted-foreground mt-2">
                Add tracking before shipping this order
              </p>
            )}
          </div>
        </div>
      )}

 {/* ── Already shipped ────────────────────────────────────────────────── */}
{isShipped && (
  <div className="bg-card rounded-xl border border-border p-8 text-center">
    <Truck
      className="w-10 h-10 mx-auto mb-3"
      style={{ color: "oklch(0.42 0.11 155)" }}
    />
    <h3 className="font-semibold text-foreground">
      This bundle has been shipped
    </h3>
    {shipment.actual_ship_date && (
      <p className="text-sm text-muted-foreground mt-1">
        Shipped on{" "}
        {new Date(shipment.actual_ship_date).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
      </p>
    )}
    {shipment.tracking_number ? (
      <p className="text-xs font-mono text-muted-foreground mt-2">
        Tracking: {shipment.tracking_number}
      </p>
    ) : (
      <p className="text-xs text-amber-600 mt-2">No tracking number on file</p>
    )}

    {/* Manual tracking entry */}
    <TrackingEntry shipmentId={shipment.id} currentTracking={shipment.tracking_number} currentCarrier={shipment.carrier} onSaved={() => refetch()} />
  </div>
)}
    </div>
  );
}
