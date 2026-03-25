// BookNest Ops — Ship Bundle Detail (wired to real Supabase data)
import { useState } from "react";
import { useParams, Link, useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Package, Truck, Tag, Check, Loader2, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const steps = ["Picked", "Pack", "Label", "Shipped"];

export default function ShipBundlePage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: shipment, isLoading, error, refetch } = trpc.shipments.byId.useQuery(
    { id: id! },
    { enabled: !!id }
  );

  const updateStatus = trpc.shipments.updateStatus.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (err) => {
      toast.error("Failed to update: " + err.message);
    },
  });

  const [checklist, setChecklist] = useState({
    booksVerified: false,
    packingSlip: false,
    sealed: false,
    labelApplied: false,
    dropOff: false,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  // Derive current step from shipment status
  const statusToStep: Record<string, number> = {
    pending: 0,
    picking: 0,
    packed: 2,
    shipping: 3,
    delivered: 3,
  };
  const currentStep = statusToStep[shipment?.status ?? "picking"] ?? 1;

  const handleMarkPacked = () => {
    if (!shipment) return;
    updateStatus.mutate(
      { id: shipment.id, status: "packed" },
      {
        onSuccess: () => {
          toast.success(`Order ${shipment.order_number ?? shipment.shipment_number} marked as packed!`);
        },
      }
    );
  };

  const handleMarkShipped = () => {
    if (!shipment) return;
    const today = new Date().toISOString().split("T")[0];
    updateStatus.mutate(
      { id: shipment.id, status: "shipping", actual_ship_date: today },
      {
        onSuccess: () => {
          toast.success(`Order ${shipment.order_number ?? shipment.shipment_number} marked as shipped!`);
          setTimeout(() => navigate("/shipping"), 1500);
        },
      }
    );
  };

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

  const memberName = (shipment as any).member?.name ?? (shipment as any).member_name ?? "Unknown Member";
  const address = (shipment as any).address;
  const books: any[] = (shipment as any).books ?? [];
  const orderNum = shipment.order_number ?? shipment.shipment_number ?? shipment.id.slice(0, 8).toUpperCase();
  const shipByDate = shipment.scheduled_ship_date
    ? new Date(shipment.scheduled_ship_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";

  // Determine back destination: picking-status shipments come from the batch picking page
  const backHref = shipment.status === "picking" ? "/picking" : "/shipping";
  const backLabel = shipment.status === "picking" ? "Back to Picking" : "Back to Shipping";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={backHref}>
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </button>
        </Link>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{memberName}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{orderNum}</p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold capitalize border"
            style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.85 0.06 155)" }}>
            {shipment.status}
          </span>
        </div>

        {/* Step Progress */}
        <div className="mt-6 flex items-center gap-0">
          {steps.map((step, i) => (
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
                  style={i <= currentStep ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
                >
                  {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={cn(
                  "text-xs mt-1.5 font-medium",
                  i === currentStep ? "text-foreground" : "text-muted-foreground"
                )}>{step}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="flex-1 h-0.5 mb-5 mx-1"
                  style={{ backgroundColor: i < currentStep ? "oklch(0.42 0.11 155)" : "oklch(0.91 0.006 80)" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Order Details */}
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
              <span className={cn("font-medium", shipment.scheduled_ship_date && new Date(shipment.scheduled_ship_date) < new Date() ? "text-red-600" : "")}>
                {shipByDate}
              </span>
            </div>
            {shipment.actual_ship_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipped</span>
                <span className="font-medium text-green-700">
                  {new Date(shipment.actual_ship_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
            )}
            {shipment.tracking_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tracking</span>
                <span className="font-medium font-mono text-xs">{shipment.tracking_number}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-3">Ship To</h2>
          {address ? (
            <div className="text-sm space-y-1">
              <p className="font-medium">{memberName}</p>
              <p className="text-muted-foreground">{address.street}{address.street2 ? `, ${address.street2}` : ""}</p>
              <p className="text-muted-foreground">{address.city}, {address.state} {address.zip}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No address on file</p>
          )}
        </div>
      </div>

      {/* Books in this shipment */}
      {books.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-3">Books in This Bundle ({books.length})</h2>
          <div className="space-y-2">
            {books.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{b.book_title?.title ?? "Unknown Title"}</p>
                  <p className="text-xs text-muted-foreground">{b.book_title?.author ?? ""}</p>
                </div>
                <span className="text-xs font-mono text-muted-foreground">{b.sku ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Packing Checklist — shown when not yet shipped */}
      {shipment.status !== "shipping" && shipment.status !== "delivered" && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-4">Packing Checklist</h2>
          <div className="space-y-3">
            {[
              { key: "booksVerified", label: "Verify all books are packed", sub: `${books.length} book${books.length !== 1 ? "s" : ""} in this bundle` },
              { key: "packingSlip", label: "Include packing slip", sub: "Print from order details" },
              { key: "sealed", label: "Seal the package", sub: "Tape all edges securely" },
              { key: "labelApplied", label: "Apply shipping label", sub: "Affix to largest flat surface" },
              { key: "dropOff", label: "Drop off at USPS", sub: "Or schedule pickup" },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => toggleCheck(item.key as keyof typeof checklist)}
                className="w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left"
                style={checklist[item.key as keyof typeof checklist]
                  ? { borderColor: "oklch(0.62 0.16 155)", backgroundColor: "oklch(0.97 0.03 155)" }
                  : { borderColor: "oklch(0.91 0.006 80)", backgroundColor: "transparent" }}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                  checklist[item.key as keyof typeof checklist]
                    ? "border-transparent"
                    : "border-muted-foreground/30"
                )}
                  style={checklist[item.key as keyof typeof checklist]
                    ? { backgroundColor: "oklch(0.42 0.11 155)" }
                    : {}}>
                  {checklist[item.key as keyof typeof checklist] && <Check className="w-3 h-3 text-white" />}
                </div>
                <div>
                  <p className={cn("text-sm font-medium", checklist[item.key as keyof typeof checklist] && "line-through text-muted-foreground")}>
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            {shipment.status === "picking" || shipment.status === "pending" ? (
              <button
                onClick={handleMarkPacked}
                disabled={updateStatus.isPending}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl border-2 transition-all disabled:opacity-60"
                style={{ borderColor: "oklch(0.62 0.16 155)", color: "oklch(0.42 0.11 155)" }}
              >
                {updateStatus.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                Mark as Packed
              </button>
            ) : null}

            {allChecked && (
              <button
                onClick={handleMarkShipped}
                disabled={updateStatus.isPending}
                className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl text-white transition-all disabled:opacity-60"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                {updateStatus.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><CheckCircle2 className="w-5 h-5" /> Mark as Shipped</>
                }
              </button>
            )}
          </div>
        </div>
      )}

      {/* Already shipped confirmation */}
      {(shipment.status === "shipping" || shipment.status === "delivered") && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <Truck className="w-10 h-10 mx-auto mb-3" style={{ color: "oklch(0.42 0.11 155)" }} />
          <h3 className="font-semibold text-foreground">This bundle has been shipped</h3>
          {shipment.actual_ship_date && (
            <p className="text-sm text-muted-foreground mt-1">
              Shipped on {new Date(shipment.actual_ship_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          {shipment.tracking_number && (
            <p className="text-xs font-mono text-muted-foreground mt-2">Tracking: {shipment.tracking_number}</p>
          )}
        </div>
      )}
    </div>
  );
}
