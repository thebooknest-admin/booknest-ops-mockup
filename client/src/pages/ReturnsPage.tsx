// BookNest Ops — Process Returns
import { useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Search, CheckCircle2 } from "lucide-react";
import { books } from "@/lib/data";

export default function ReturnsPage() {
  const [sku, setSku] = useState("");
  const [found, setFound] = useState<typeof books[0] | null>(null);
  const [processed, setProcessed] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const book = books.find(b => b.sku.toLowerCase() === sku.toLowerCase().trim());
    if (book) {
      setFound(book);
      setProcessed(false);
    } else {
      toast.error(`SKU "${sku}" not found in inventory`);
    }
  };

  const handleProcess = () => {
    setProcessed(true);
    toast.success(`${found?.title} checked back in to ${found?.bin}`);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Process Returns</h1>
        <p className="page-subtitle">Scan or enter a SKU to check a book back into inventory</p>
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="Scan or type SKU (e.g. BN-FLED-0597)..."
              autoFocus
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <button type="submit" className="w-full py-3 rounded-lg text-white font-medium text-sm"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
            Look Up SKU
          </button>
        </form>
      </div>

      {found && !processed && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Book Found</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Title", value: found.title },
              { label: "Author", value: found.author },
              { label: "SKU", value: found.sku },
              { label: "Bin", value: found.bin },
              { label: "Age Group", value: found.ageGroup },
              { label: "Current Status", value: found.status },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{f.label}</p>
                <p className="font-medium text-foreground mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>
          <button onClick={handleProcess} className="w-full py-3 rounded-lg text-white font-semibold text-sm"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
            ✓ Check Back Into Inventory
          </button>
        </div>
      )}

      {found && processed && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: "oklch(0.62 0.16 155)" }} />
          <h3 className="font-semibold text-foreground">Return Processed</h3>
          <p className="text-sm text-muted-foreground mt-1">{found.title} is back in {found.bin}</p>
          <button onClick={() => { setFound(null); setSku(""); setProcessed(false); }}
            className="mt-4 text-sm font-medium px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors">
            Process Another Return
          </button>
        </div>
      )}
    </div>
  );
}
