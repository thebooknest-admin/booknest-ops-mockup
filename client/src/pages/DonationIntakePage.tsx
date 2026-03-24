// BookNest Ops — Donation Intake (wired to real Supabase data)
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Heart, Search, CheckCircle2, RefreshCw, AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { autoAssignTags, TAG_TAXONOMY } from "@/lib/tags";
import { inferAgeGroup } from "@/lib/ageInference";

type Step = "scan" | "condition" | "donor" | "age_tags" | "confirm";

const CONDITIONS = [
  { value: "new", label: "New", desc: "Unopened, no marks", color: "oklch(0.42 0.11 155)" },
  { value: "like_new", label: "Like New", desc: "Minimal wear, no writing", color: "oklch(0.52 0.14 155)" },
  { value: "good", label: "Good", desc: "Some wear, readable", color: "oklch(0.55 0.14 75)" },
  { value: "fair", label: "Fair", desc: "Noticeable wear, intact", color: "oklch(0.55 0.14 50)" },
  { value: "poor", label: "Poor — Reject", desc: "Damaged, not suitable", color: "oklch(0.55 0.22 25)" },
];

const AGE_GROUPS = [
  { value: "hatchlings", label: "🐣 Hatchlings", sub: "Ages 0–2" },
  { value: "fledglings", label: "🐥 Fledglings", sub: "Ages 3–5" },
  { value: "soarers", label: "🦅 Soarers", sub: "Ages 6–8" },
  { value: "sky_readers", label: "🌟 Sky Readers", sub: "Ages 9–12" },
];

interface BookInfo {
  title: string;
  author: string;
  isbn: string;
  publisher?: string;
  year?: string;
  subjects?: string[];
  coverUrl?: string;
}

export default function DonationIntakePage() {
  const [step, setStep] = useState<Step>("scan");
  const [isbn, setIsbn] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [book, setBook] = useState<BookInfo | null>(null);
  const [condition, setCondition] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [suggestedBin, setSuggestedBin] = useState("");
  const [notes, setNotes] = useState("");
  const [donationCount, setDonationCount] = useState(0);

  const createDonation = trpc.donations.add.useMutation({
    onSuccess: () => {
      setDonationCount((c) => c + 1);
      toast.success(`Donation recorded: ${book?.title}`);
      reset();
    },
    onError: (err: any) => {
      toast.error(`Failed to save: ${err.message}`);
    },
  });

  const handleLookup = async () => {
    if (!isbn.trim()) return;
    setIsLooking(true);
    try {
      const clean = isbn.replace(/[-\s]/g, "");
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`);
      const json = await res.json();
      const key = `ISBN:${clean}`;
      const data = json[key];
      if (!data) {
        toast.error("Book not found. Enter details manually.");
        setBook({ title: "", author: "", isbn: clean });
        setStep("condition");
        return;
      }
      const bookInfo: BookInfo = {
        title: data.title ?? "",
        author: data.authors?.[0]?.name ?? "",
        isbn: clean,
        publisher: data.publishers?.[0]?.name,
        year: data.publish_date,
        subjects: data.subjects?.map((s: any) => (typeof s === "string" ? s : s.name)).slice(0, 10) ?? [],
        coverUrl: data.cover?.medium ?? data.cover?.small,
      };
      setBook(bookInfo);
      toast.success(`Found: ${bookInfo.title}`);
      setStep("condition");
    } catch {
      toast.error("ISBN lookup failed. Check your connection.");
    } finally {
      setIsLooking(false);
    }
  };

  const handleCondition = (val: string) => {
    setCondition(val);
    if (val === "poor") {
      toast.warning("Marked as poor condition — routing to reject queue.");
      // Save immediately as rejected
      if (book) {
        createDonation.mutate({
          title: book.title || "Unknown",
          author: book.author || "Unknown",
          isbn: book.isbn || undefined,
          condition: "poor",
          donor_name: undefined,
          donor_email: undefined,
          age_group: undefined,
          bin_id: undefined,
          tags: [],
          notes: undefined,
          status: "rejected",
        });
      }
    } else {
      setStep("donor");
    }
  };

  const handleAgeGroup = (val: string) => {
    setAgeGroup(val);
    if (book?.subjects) {
      const result = autoAssignTags(book.subjects, val);
      setSelectedTags(result.suggestedTags);
      const prefix = val === "hatchlings" ? "HATC" : val === "fledglings" ? "FLED" : val === "soarers" ? "SOAR" : "SKY";
      setSuggestedBin(`${prefix}-${result.suggestedCategory}-01`);
    }
  };

  const handleConfirm = () => {
    if (!book) return;
    createDonation.mutate({
      title: book.title || "Unknown",
      author: book.author || "Unknown",
          isbn: book.isbn || undefined,
          condition,
      donor_name: donorName || undefined,
      donor_email: donorEmail || undefined,
      age_group: ageGroup || undefined,
      bin_id: suggestedBin || undefined,
      tags: selectedTags,
      notes: notes || undefined,
      status: "received",
    });
  };

  const reset = () => {
    setStep("scan");
    setIsbn("");
    setBook(null);
    setCondition("");
    setDonorName("");
    setDonorEmail("");
    setAgeGroup("");
    setSelectedTags([]);
    setSuggestedBin("");
    setNotes("");
  };

  const STEPS: Step[] = ["scan", "condition", "donor", "age_tags", "confirm"];
  const stepIdx = STEPS.indexOf(step);
  const stepLabels = ["Scan", "Condition", "Donor", "Age & Tags", "Confirm"];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Donation Intake</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {donationCount > 0 ? `${donationCount} received this session` : "Scan or enter an ISBN to begin"}
          </p>
        </div>
        {donationCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
            style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.85 0.06 155)" }}>
            <Heart className="w-3.5 h-3.5" />
            {donationCount} received
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="flex items-center gap-1">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center shrink-0">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all",
                i < stepIdx ? "text-white" : i === stepIdx ? "text-white" : "bg-muted text-muted-foreground"
              )}
                style={i <= stepIdx ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
              >
                {i < stepIdx ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={cn("text-[10px] mt-0.5 hidden sm:block text-center", i === stepIdx ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
            {i < 4 && <div className={cn("flex-1 h-0.5 rounded mb-3", i < stepIdx ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      {/* Step: Scan */}
      {step === "scan" && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Scan or Enter ISBN</h2>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={isbn}
                onChange={(e) => setIsbn(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                placeholder="ISBN-10 or ISBN-13"
                autoFocus
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-mono"
              />
            </div>
            <button
              onClick={handleLookup}
              disabled={isLooking || !isbn.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50 transition-colors"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              {isLooking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Look Up
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Can't find the ISBN?{" "}
            <button className="underline" onClick={() => { setBook({ title: "", author: "", isbn: "" }); setStep("condition"); }}>
              Enter manually
            </button>
          </p>
        </div>
      )}

      {/* Step: Condition */}
      {step === "condition" && book && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          {book.title && (
            <div className="flex items-start gap-3 pb-4 border-b border-border">
              {book.coverUrl && (
                <img src={book.coverUrl} alt={book.title} className="w-12 h-16 object-cover rounded shadow-sm shrink-0" />
              )}
              <div>
                <p className="font-semibold text-foreground">{book.title}</p>
                <p className="text-sm text-muted-foreground">{book.author}</p>
              </div>
            </div>
          )}
          <h2 className="font-semibold text-foreground">Condition Assessment</h2>
          <div className="grid grid-cols-1 gap-2">
            {CONDITIONS.map((c) => (
              <button
                key={c.value}
                onClick={() => handleCondition(c.value)}
                className={cn(
                  "flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all",
                  c.value === "poor" ? "border-red-200 hover:bg-red-50/50" : "border-border hover:bg-muted/50"
                )}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: c.color }}>{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step: Donor */}
      {step === "donor" && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">
            Donor Information <span className="text-muted-foreground font-normal text-sm">(optional)</span>
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Donor Name</label>
              <input
                type="text"
                value={donorName}
                onChange={(e) => setDonorName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="mt-1 w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Donor Email</label>
              <input
                type="email"
                value={donorEmail}
                onChange={(e) => setDonorEmail(e.target.value)}
                placeholder="e.g. jane@email.com"
                className="mt-1 w-full px-3 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStep("age_tags")}
              className="flex-1 px-4 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              Continue
            </button>
            <button
              onClick={() => setStep("age_tags")}
              className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Step: Age & Tags */}
      {step === "age_tags" && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-5">
          <h2 className="font-semibold text-foreground">Age Group & Tags</h2>

          {!ageGroup ? (
            <>
              {/* AI Recommendation */}
              {book?.subjects && book.subjects.length > 0 && (() => {
                const rec = inferAgeGroup({
                  subjects: book.subjects ?? [],
                  title: book.title ?? "",
                  author: book.author ?? "",
                  publisher: book.publisher ?? "",
                  pages: "",
                });
                return (
                  <div className="p-3 rounded-lg border" style={{ backgroundColor: "oklch(0.96 0.03 155)", borderColor: "oklch(0.85 0.06 155)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "oklch(0.42 0.11 155)" }}>
                      AI Recommendation · {rec.confidence.toUpperCase()} confidence ({rec.confidencePct}%)
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      {AGE_GROUPS.find((a) => a.value === rec.recommended)?.label ?? rec.recommended}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{rec.reasons[0]}</p>
                    <button
                      onClick={() => handleAgeGroup(rec.recommended)}
                      className="mt-2 text-xs font-medium px-3 py-1.5 rounded-lg text-white"
                      style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                    >
                      Accept Recommendation
                    </button>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                {AGE_GROUPS.map((ag) => (
                  <button
                    key={ag.value}
                    onClick={() => handleAgeGroup(ag.value)}
                    className="flex flex-col items-center p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-center"
                  >
                    <p className="text-sm font-medium text-foreground">{ag.label}</p>
                    <p className="text-xs text-muted-foreground">{ag.sub}</p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
              <div>
                <p className="text-xs text-muted-foreground">Age Group</p>
                <p className="text-sm font-medium text-foreground">
                  {AGE_GROUPS.find((a) => a.value === ageGroup)?.label}
                </p>
              </div>
              <button
                onClick={() => { setAgeGroup(""); setSelectedTags([]); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Change
              </button>
            </div>
          )}

          {ageGroup && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Tags ({selectedTags.length} selected)
              </p>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {TAG_TAXONOMY.map((cat) => (
                  <div key={cat.id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">{cat.emoji} {cat.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.tags.map((tag: string) => (
                        <button
                          key={tag}
                          onClick={() =>
                            setSelectedTags((prev) =>
                              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                          }
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-full border transition-colors",
                            selectedTags.includes(tag)
                              ? "text-white border-transparent"
                              : "border-border text-muted-foreground hover:bg-muted"
                          )}
                          style={selectedTags.includes(tag) ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ageGroup && (
            <button
              onClick={() => setStep("confirm")}
              className="w-full px-4 py-2.5 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              Continue to Confirm
            </button>
          )}
        </div>
      )}

      {/* Step: Confirm */}
      {step === "confirm" && book && (
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <h2 className="font-semibold text-foreground">Confirm Donation</h2>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Title</p>
                <p className="font-medium text-foreground">{book.title || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Author</p>
                <p className="font-medium text-foreground">{book.author || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Condition</p>
                <p className="font-medium text-foreground capitalize">{condition.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age Group</p>
                <p className="font-medium text-foreground">
                  {AGE_GROUPS.find((a) => a.value === ageGroup)?.label ?? ageGroup}
                </p>
              </div>
              {donorName && (
                <div>
                  <p className="text-xs text-muted-foreground">Donor</p>
                  <p className="font-medium text-foreground">{donorName}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Suggested Bin</p>
                <p className="font-mono font-medium text-foreground">{suggestedBin || "—"}</p>
              </div>
            </div>
            {selectedTags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedTags.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="mt-1 w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Any notes about this donation..."
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleConfirm}
              disabled={createDonation.isPending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              {createDonation.isPending ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
              ) : (
                <><Heart className="w-4 h-4" /> Confirm & Receive Next</>
              )}
            </button>
            <button
              onClick={() => setStep("age_tags")}
              className="px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
