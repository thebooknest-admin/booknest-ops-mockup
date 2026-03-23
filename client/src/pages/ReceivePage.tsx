// BookNest Ops — Receive Books (multi-step wizard)
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, ArrowRight, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Scan ISBN", "Confirm Details", "Age Group", "Tags", "Confirm Bin"];
const ageGroups = ["Hatchlings (0-2)", "Fledglings (3-5)", "Soarers (6-8)", "Sky Readers (9-12)"];
const tagsByAge: Record<string, string[]> = {
  "Hatchlings (0-2)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal"],
  "Fledglings (3-5)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
  "Soarers (6-8)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
  "Sky Readers (9-12)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
};

const mockBook = {
  title: "Charlotte's Web",
  author: "E.B. White",
  isbn: "9780061124952",
  publisher: "HarperCollins",
  pages: 192,
};

export default function ReceivePage() {
  const [step, setStep] = useState(0);
  const [isbn, setIsbn] = useState("");
  const [book, setBook] = useState<typeof mockBook | null>(null);
  const [ageGroup, setAgeGroup] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bin, setBin] = useState("");

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isbn.trim()) return;
    setBook(mockBook);
    setStep(1);
    toast.success("Book found: Charlotte's Web");
  };

  const handleAgeGroup = (ag: string) => {
    setAgeGroup(ag);
    const prefix = ag === "Hatchlings (0-2)" ? "HATC" : ag === "Fledglings (3-5)" ? "FLED" : ag === "Soarers (6-8)" ? "SOAR" : "SKY";
    setBin(`${prefix}-LIFE-01`);
    setStep(2);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleConfirm = () => {
    toast.success(`${book?.title} received → ${bin}`);
    setStep(0);
    setIsbn("");
    setBook(null);
    setAgeGroup("");
    setSelectedTags([]);
    setBin("");
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Receive Books</h1>
        <p className="page-subtitle">Scan or enter an ISBN to add books to inventory</p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-0">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                i < step ? "text-white" : i === step ? "text-white" : "bg-muted text-muted-foreground"
              )} style={i <= step ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
                {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn("text-[10px] mt-1 font-medium whitespace-nowrap", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-px mb-4 mx-1" style={{ backgroundColor: i < step ? "oklch(0.42 0.11 155)" : "oklch(0.91 0.006 80)" }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Scan ISBN */}
      {step === 0 && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h2 className="font-semibold text-foreground mb-4">Scan or Enter ISBN</h2>
          <form onSubmit={handleScan} className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={isbn}
                onChange={e => setIsbn(e.target.value)}
                placeholder="Scan barcode or type ISBN..."
                autoFocus
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <button type="submit" className="w-full py-3 rounded-lg text-white font-medium text-sm transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Look Up Book
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            Tip: After receiving a book, focus returns here automatically for fast batch scanning.
          </p>
        </div>
      )}

      {/* Step 1: Confirm Details */}
      {step === 1 && book && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Confirm Book Details</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: "Title", value: book.title },
              { label: "Author", value: book.author },
              { label: "ISBN", value: book.isbn },
              { label: "Publisher", value: book.publisher },
              { label: "Pages", value: String(book.pages) },
            ].map(f => (
              <div key={f.label}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{f.label}</p>
                <p className="font-medium text-foreground mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(0)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              ← Back
            </button>
            <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Confirm & Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Age Group */}
      {step === 2 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Select Age Group</h2>
          <div className="grid grid-cols-2 gap-3">
            {ageGroups.map(ag => (
              <button
                key={ag}
                onClick={() => handleAgeGroup(ag)}
                className={cn(
                  "p-4 rounded-xl border-2 text-left transition-all",
                  ageGroup === ag ? "border-primary" : "border-border hover:border-primary/40"
                )}
                style={ageGroup === ag ? { borderColor: "oklch(0.42 0.11 155)", backgroundColor: "oklch(0.97 0.03 155)" } : {}}
              >
                <p className="font-semibold text-sm text-foreground">{ag.split(" (")[0]}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ag.match(/\(.*\)/)?.[0]}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Tags */}
      {step === 3 && ageGroup && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Select Tags</h2>
          <p className="text-sm text-muted-foreground">Choose up to 3 tags for <strong>{book?.title}</strong></p>
          <div className="flex flex-wrap gap-2">
            {(tagsByAge[ageGroup] || []).map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                  selectedTags.includes(tag)
                    ? "text-white border-transparent"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
                style={selectedTags.includes(tag) ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground">← Back</button>
            <button onClick={() => setStep(4)} disabled={selectedTags.length === 0}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm Bin */}
      {step === 4 && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Confirm Bin Assignment</h2>
          <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Suggested Bin</p>
            <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>{bin}</p>
            <p className="text-sm text-muted-foreground">{ageGroup} · {selectedTags.join(", ")}</p>
          </div>
          <div className="text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Book</span>
              <span className="font-medium">{book?.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Author</span>
              <span className="font-medium">{book?.author}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Age Group</span>
              <span className="font-medium">{ageGroup}</span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground">← Back</button>
            <button onClick={handleConfirm} className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              ✓ Confirm Receipt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
