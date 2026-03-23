// BookNest Ops — Ship Bundle Detail
import { useState } from "react";
import { useParams, Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Circle, Package, Truck, Tag, Check } from "lucide-react";
import { orders } from "@/lib/data";
import { cn } from "@/lib/utils";

const steps = ["Picked", "Pack", "Label", "Shipped"];

export default function ShipBundlePage() {
  const { id } = useParams<{ id: string }>();
  const order = orders.find(o => o.id === id) || orders[0];
  const [currentStep, setCurrentStep] = useState(1);
  const [checklist, setChecklist] = useState({
    booksVerified: false,
    packingSlip: false,
    sealed: false,
    labelBought: false,
    labelApplied: false,
    dropOff: false,
  });

  const toggleCheck = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = Object.values(checklist).every(Boolean);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/shipping">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Shipping
          </button>
        </Link>
      </div>

      {/* Header */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{order.memberName}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{order.orderNumber}</p>
          </div>
          {order.tier && <span className="badge-tier">{order.tier}</span>}
        </div>

        {/* Step Progress */}
        <div className="mt-6 flex items-center gap-0">
          {steps.map((step, i) => (
            <div key={step} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setCurrentStep(i)}
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
                </button>
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
              <span className="font-medium">{order.booksPicked}/{order.booksTotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Est. Weight</span>
              <span className="font-medium">{order.estimatedWeight || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order Date</span>
              <span className="font-medium">{order.orderDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ship By</span>
              <span className="font-medium text-red-600">{order.shipByDate}</span>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="section-label mb-3">Ship To</h2>
          {order.address ? (
            <div className="text-sm space-y-1">
              <p className="font-medium">{order.memberName}</p>
              <p className="text-muted-foreground">{order.address}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No address on file</p>
          )}
        </div>
      </div>

      {/* Shipping Label */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="section-label mb-3">Shipping Label</h2>
        <button
          onClick={() => {
            toast.success("USPS label purchased! $4.23 charged.");
            setChecklist(prev => ({ ...prev, labelBought: true }));
          }}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-lg text-white transition-colors"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
        >
          <Tag className="w-4 h-4" />
          Buy USPS Label
        </button>
        <p className="text-xs text-muted-foreground mt-2">Estimated: $4.23 — First Class Package</p>
      </div>

      {/* Packing Checklist */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="section-label mb-4">Packing Checklist</h2>
        <div className="space-y-3">
          {[
            { key: "booksVerified", label: "Verify all books are packed", sub: `${order.booksPicked}/${order.booksTotal} books confirmed` },
            { key: "packingSlip", label: "Include packing slip", sub: "Print from order details" },
            { key: "sealed", label: "Seal the package", sub: "Tape all edges securely" },
            { key: "labelBought", label: "Buy shipping label", sub: "Purchase via USPS above" },
            { key: "labelApplied", label: "Apply label to package", sub: "Affix to largest flat surface" },
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

        {allChecked && (
          <button
            onClick={() => toast.success(`Order ${order.orderNumber} marked as shipped!`)}
            className="mt-4 w-full flex items-center justify-center gap-2 text-sm font-semibold py-3 rounded-xl text-white transition-all"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
          >
            <CheckCircle2 className="w-5 h-5" />
            Mark as Shipped
          </button>
        )}
      </div>
    </div>
  );
}
