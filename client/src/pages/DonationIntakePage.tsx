// BookNest Ops — Donation Intake (multi-step wizard)
// NEW MODULE: Track and receive donated books
import { useState } from "react";
import { toast } from "sonner";
import { Gift, Check, Search, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { donations } from "@/lib/data";

const steps = ["Scan/Enter Book", "Condition", "Donor (Optional)", "Age & Tags", "Confirm Bin"];
const ageGroups = ["Hatchlings (0-2)", "Fledglings (3-5)", "Soarers (6-8)", "Sky Readers (9-12)"];
const conditions = [
  { value: "New / Like New", label: "New / Like New", desc: "No marks, tight spine", action: "Add to inventory normally", color: "oklch(0.42 0.11 155)", bg: "oklch(0.97 0.03 155)" },
  { value: "Good", label: "Good", desc: "Minor wear, no writing", action: "Add to inventory normally", color: "oklch(0.42 0.11 155)", bg: "oklch(0.97 0.03 155)" },
  { value: "Acceptable", label: "Acceptable", desc: "Some wear, minor notes", action: "Add with condition flag", color: "oklch(0.55 0.14 75)", bg: "oklch(0.97 0.04 75)" },
  { value: "Poor", label: "Poor", desc: "Heavy wear, writing, damage", action: "Route to reject queue", color: "oklch(0.55 0.22 25)", bg: "oklch(0.97 0.04 25)" },
];
const tagsByAge: Record<string, string[]> = {
  "Hatchlings (0-2)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal"],
  "Fledglings (3-5)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
  "Soarers (6-8)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
  "Sky Readers (9-12)": ["Life", "Nature", "Learn", "Humor", "Adventure", "Seasonal", "Identity", "Classics"],
};

const pendingDonations = donations.filter(d => d.status === "Pending");

export default function DonationIntakePage() {
  const [step, setStep] = useState(0);
  const [isbn, setIsbn] = useState("");
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [condition, setCondition] = useState("");
  const [donor, setDonor] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [bin, setBin] = useState("");
  const [done, setDone] = useState(false);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isbn.trim() && !title.trim()) return;
    if (isbn.trim()) {
      setTitle("Charlotte's Web");
      setAuthor("E.B. White");
      toast.success("Book found via ISBN");
    }
    setStep(1);
  };

  const handleCondition = (c: string) => {
    setCondition(c);
    if (c === "Poor") {
      toast.warning("Book flagged as Poor condition — will be routed to reject queue");
    }
    setStep(2);
  };

  const handleAgeGroup = (ag: string) => {
    setAgeGroup(ag);
    const prefix = ag === "Hatchlings (0-2)" ? "HATC" : ag === "Fledglings (3-5)" ? "FLED" : ag === "Soarers (6-8)" ? "SOAR" : "SKY";
    const tag = selectedTags[0] || "LIFE";
    setBin(`${prefix}-${tag.toUpperCase()}-01`);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => {
      const next = prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag];
      if (ageGroup) {
        const prefix = ageGroup === "Hatchlings (0-2)" ? "HATC" : ageGroup === "Fledglings (3-5)" ? "FLED" : ageGroup === "Soarers (6-8)" ? "SOAR" : "SKY";
        const firstTag = next[0] || "LIFE";
        setBin(`${prefix}-${firstTag.toUpperCase()}-01`);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (condition === "Poor") {
      toast.error(`${title || "Book"} rejected — added to reject queue`);
    } else {
      toast.success(`${title || "Book"} received as donation → ${bin}`);
    }
    setDone(true);
  };

  const reset = () => {
    setStep(0); setIsbn(""); setTitle(""); setAuthor(""); setCondition("");
    setDonor(""); setAgeGroup(""); setSelectedTags([]); setBin(""); setDone(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="page-header">
        <h1 className="page-title">Donation Intake</h1>
        <p className="page-subtitle">Log and process donated books</p>
      </div>

      {/* Pending Donations Alert */}
      {pendingDonations.length > 0 && (
        <div className="rounded-xl border p-4 flex items-start gap-3"
          style={{ backgroundColor: "oklch(0.97 0.03 250)", borderColor: "oklch(0.88 0.06 250)" }}>
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "oklch(0.45 0.18 250)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "oklch(0.35 0.18 250)" }}>
              {pendingDonations.length} donations pending processing
            </p>
            <div className="mt-1 space-y-0.5">
              {pendingDonations.map(d => (
                <p key={d.id} className="text-xs" style={{ color: "oklch(0.45 0.16 250)" }}>
                  {d.title} by {d.author} — from {d.donor || "Anonymous"}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {done ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto mb-4" style={{ color: "oklch(0.62 0.16 155)" }} />
          <h3 className="text-lg font-semibold text-foreground">Donation Logged!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {condition === "Poor" ? "Book routed to reject queue." : `${title} added to ${bin}`}
          </p>
          <div className="flex gap-3 mt-6 justify-center">
            <button onClick={reset} className="px-5 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              Log Another Donation
            </button>
          </div>
        </div>
      ) : (
        <>
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

          {/* Step 0: Scan/Enter */}
          {step === 0 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Scan or Enter Book</h2>
              <form onSubmit={handleScan} className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input type="text" value={isbn} onChange={e => setIsbn(e.target.value)}
                    placeholder="Scan ISBN barcode..." autoFocus
                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                </div>
                <p className="text-xs text-center text-muted-foreground">— or enter manually if no barcode —</p>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="Book title"
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                <input type="text" value={author} onChange={e => setAuthor(e.target.value)}
                  placeholder="Author"
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
                <button type="submit" className="w-full py-3 rounded-lg text-white font-medium text-sm"
                  style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                  Continue →
                </button>
              </form>
            </div>
          )}

          {/* Step 1: Condition */}
          {step === 1 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Assess Condition</h2>
              <p className="text-sm text-muted-foreground">Evaluating: <strong>{title || "Unknown Book"}</strong></p>
              <div className="space-y-2">
                {conditions.map(c => (
                  <button key={c.value} onClick={() => handleCondition(c.value)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all hover:border-primary/40"
                    style={{ borderColor: condition === c.value ? c.color : "oklch(0.91 0.006 80)" }}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-foreground">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.desc}</p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: c.bg, color: c.color }}>
                      {c.action}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Donor */}
          {step === 2 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Donor Attribution</h2>
              <p className="text-sm text-muted-foreground">Optional — link to a donor for thank-you notes or tax receipts.</p>
              <input type="text" value={donor} onChange={e => setDonor(e.target.value)}
                placeholder="Donor name or organization (optional)"
                className="w-full px-4 py-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground">← Back</button>
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium"
                  style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                  {donor ? "Continue →" : "Skip →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Age & Tags */}
          {step === 3 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Age Group & Tags</h2>
              <div className="grid grid-cols-2 gap-2">
                {ageGroups.map(ag => (
                  <button key={ag} onClick={() => handleAgeGroup(ag)}
                    className={cn("p-3 rounded-xl border-2 text-left transition-all", ageGroup === ag ? "border-primary" : "border-border hover:border-primary/40")}
                    style={ageGroup === ag ? { borderColor: "oklch(0.42 0.11 155)", backgroundColor: "oklch(0.97 0.03 155)" } : {}}>
                    <p className="font-semibold text-sm">{ag.split(" (")[0]}</p>
                    <p className="text-xs text-muted-foreground">{ag.match(/\(.*\)/)?.[0]}</p>
                  </button>
                ))}
              </div>
              {ageGroup && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {(tagsByAge[ageGroup] || []).map(tag => (
                      <button key={tag} onClick={() => toggleTag(tag)}
                        className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-all",
                          selectedTags.includes(tag) ? "text-white border-transparent" : "border-border text-muted-foreground")}
                        style={selectedTags.includes(tag) ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground">← Back</button>
                <button onClick={() => setStep(4)} disabled={!ageGroup}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-40"
                  style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h2 className="font-semibold text-foreground">Confirm & Log Donation</h2>
              {condition === "Poor" ? (
                <div className="rounded-xl p-4" style={{ backgroundColor: "oklch(0.97 0.04 25)", borderColor: "oklch(0.88 0.08 25)" }}>
                  <p className="text-sm font-semibold" style={{ color: "oklch(0.50 0.20 25)" }}>⚠ This book will be routed to the reject queue</p>
                  <p className="text-xs mt-1" style={{ color: "oklch(0.55 0.18 25)" }}>Poor condition books are not added to inventory to maintain quality standards.</p>
                </div>
              ) : (
                <div className="rounded-xl p-4 space-y-2" style={{ backgroundColor: "oklch(0.97 0.03 155)" }}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Assigned Bin</p>
                  <p className="text-2xl font-bold font-mono" style={{ color: "oklch(0.32 0.10 155)" }}>{bin}</p>
                </div>
              )}
              <div className="text-sm space-y-2">
                {[
                  { label: "Title", value: title || "Unknown" },
                  { label: "Author", value: author || "Unknown" },
                  { label: "Condition", value: condition },
                  { label: "Donor", value: donor || "Anonymous" },
                  { label: "Age Group", value: ageGroup },
                  { label: "Tags", value: selectedTags.join(", ") || "—" },
                ].map(f => (
                  <div key={f.label} className="flex justify-between">
                    <span className="text-muted-foreground">{f.label}</span>
                    <span className="font-medium">{f.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 rounded-lg border border-border text-sm font-medium text-muted-foreground">← Back</button>
                <button onClick={handleConfirm} className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold"
                  style={{ backgroundColor: condition === "Poor" ? "oklch(0.63 0.22 25)" : "oklch(0.42 0.11 155)" }}>
                  {condition === "Poor" ? "Reject Book" : "✓ Log Donation"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
