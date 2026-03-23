// BookNest Ops — Label Queue
import { useState } from "react";
import { toast } from "sonner";
import { Tag, Download, Printer, CheckCircle2, Plus } from "lucide-react";
import { labelBatches } from "@/lib/data";
import { cn } from "@/lib/utils";

const stepLabels = ["Pending", "Printed", "Released"];

export default function LabelsPage() {
  const [batches, setBatches] = useState(labelBatches);

  const markPrinted = (id: string) => {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: "Printed" as const } : b));
    toast.success("Batch marked as printed");
  };
  const releaseBatch = (id: string) => {
    setBatches(prev => prev.map(b => b.id === id ? { ...b, status: "Released" as const } : b));
    toast.success("Batch released to inventory");
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Label Queue</h1>
          <p className="page-subtitle">Create and manage label batches</p>
        </div>
        <button
          onClick={() => toast.info("Create batch feature — connect to live system")}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
        >
          <Plus className="w-4 h-4" />
          New Batch
        </button>
      </div>

      {batches.map(batch => (
        <div key={batch.id} className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Batch Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm text-foreground font-mono">{batch.batchId}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Created {batch.createdDate} · {batch.books.length} books</p>
            </div>
            {/* Step Progress */}
            <div className="flex items-center gap-2">
              {stepLabels.map((step, i) => {
                const stepIndex = stepLabels.indexOf(batch.status);
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={step} className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                      done ? "text-white" : active ? "text-white" : "bg-muted text-muted-foreground"
                    )} style={done || active ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
                      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span className={cn("text-xs", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{step}</span>
                    {i < stepLabels.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Books in Batch */}
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>ISBN</th>
                <th>SKU</th>
                <th>Bin</th>
              </tr>
            </thead>
            <tbody>
              {batch.books.map(book => (
                <tr key={book.sku}>
                  <td className="font-medium">{book.title}</td>
                  <td className="font-mono text-xs text-muted-foreground">{book.isbn}</td>
                  <td className="font-mono text-xs text-muted-foreground">{book.sku}</td>
                  <td><span className="badge-inhouse">{book.bin}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Actions */}
          <div className="px-5 py-4 border-t border-border flex items-center gap-3">
            <button
              onClick={() => toast.success("CSV exported for FlashLabel")}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
            {batch.status === "Pending" && (
              <button
                onClick={() => markPrinted(batch.id)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                <Printer className="w-3.5 h-3.5" />
                Mark as Printed
              </button>
            )}
            {batch.status === "Printed" && (
              <button
                onClick={() => releaseBatch(batch.id)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg text-white transition-colors"
                style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Release Batch
              </button>
            )}
            {batch.status === "Released" && (
              <span className="text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
                ✓ Batch complete
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
