// BookNest Ops — Public Event Sign-Up Form
// Design: Warm Linen Artisan Light — completely isolated from ops dashboard
// This page has NO sidebar, NO nav. It is a standalone public-facing form.
// The form can be "closed" by the admin; visitors see a friendly closed state.

import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen, ChevronDown, ChevronUp, Check, Heart,
  Mail, MapPin, User, Cake, BookMarked, Star, ShieldX,
  MessageSquare, Gift, Sparkles, ArrowRight, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_TAXONOMY } from "@/lib/tags";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormData {
  // Parent
  parentName: string;
  parentEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  // Child
  childName: string;
  childBirthday: string;
  readingLevel: string;
  // Interests
  interests: string[];
  topicsToAvoid: string[];
  // Extras
  subscriptionTier: string;
  howHeard: string;
  giftNote: string;
  additionalNotes: string;
  isGift: boolean;
}

const EMPTY_FORM: FormData = {
  parentName: "", parentEmail: "",
  addressLine1: "", addressLine2: "", city: "", state: "", zip: "",
  childName: "", childBirthday: "", readingLevel: "",
  interests: [], topicsToAvoid: [],
  subscriptionTier: "", howHeard: "", giftNote: "", additionalNotes: "",
  isGift: false,
};

const READING_LEVELS = [
  { value: "hatchlings", label: "🐣 Hatchlings", range: "Ages 0–2", desc: "Board books, picture books, simple rhymes" },
  { value: "fledglings", label: "🐦 Fledglings", range: "Ages 3–5", desc: "Early readers, picture books, beginning stories" },
  { value: "soarers",    label: "🦅 Soarers",    range: "Ages 6–8", desc: "Chapter books, illustrated stories, early chapter books" },
  { value: "skyreaders", label: "🌟 Sky Readers", range: "Ages 9–12", desc: "Middle grade novels, longer chapter books, series" },
];

const SUBSCRIPTION_TIERS = [
  {
    value: "little_nest",
    label: "Little Nest",
    price: "$20",
    books: "4 books per bundle",
    popular: false,
    perks: [
      "4 books at a time",
      "Unlimited swaps — swap when ready",
      "BookNest branding in every shipment",
    ],
    tagline: "A light, simple start.",
  },
  {
    value: "cozy_nest",
    label: "Cozy Nest",
    price: "$25",
    books: "6 books per bundle",
    popular: true,
    perks: [
      "6 books at a time",
      "Unlimited swaps — swap when ready",
      "1 complimentary book to keep each year",
      "Occasional BookNest swag",
    ],
    tagline: "Most common family choice.",
  },
  {
    value: "story_nest",
    label: "Story Nest",
    price: "$35",
    books: "8 books per bundle",
    popular: false,
    perks: [
      "8 books at a time",
      "Unlimited swaps — swap when ready",
      "1 complimentary book to keep every 6 months",
      "More frequent BookNest swag",
      "Reader moments (birthdays + milestones)",
    ],
    tagline: "Best for big readers or multi-kid homes.",
  },
];

const HOW_HEARD_OPTIONS = [
  "Instagram", "Facebook", "TikTok", "A friend or family member",
  "Local event or fair", "School or library", "Google search", "Other",
];

// Top-level interest categories shown in the form (simplified from full taxonomy)
// We show category-level selection + a few popular tags per category
const INTEREST_CATEGORIES = TAG_TAXONOMY.map(cat => ({
  id: cat.id,
  label: cat.label,
  emoji: cat.emoji,
  color: cat.color,
  // Show first 8 most popular tags per category as quick picks
  popularTags: cat.tags.slice(0, 8),
  allTags: cat.tags,
}));

// Topics to avoid — common sensitive/preference areas
const AVOID_SUGGESTIONS = [
  "Scary / Horror", "Violence", "Death & Grief", "Divorce", "Bathroom Humor",
  "War", "Bullying", "Religious Content", "LGBTQ+ themes", "Romance",
  "Scary Animals", "Clowns", "Spiders / Bugs", "Ghosts / Supernatural",
  "Peer Pressure", "Illness", "Political Topics",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: "oklch(0.92 0.06 155)" }}>
        <span style={{ color: "oklch(0.35 0.12 155)" }}>{icon}</span>
      </div>
      <div>
        <h2 className="font-bold text-foreground text-base">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-foreground">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputClass = "w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors placeholder:text-muted-foreground/60";

// ─── Interest Picker ──────────────────────────────────────────────────────────

function InterestPicker({ selected, onChange }: {
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState<Record<string, boolean>>({});

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  };

  return (
    <div className="space-y-2">
      {INTEREST_CATEGORIES.map(cat => {
        const selectedInCat = cat.allTags.filter(t => selected.includes(t));
        const isOpen = openCat === cat.id;
        const showAll = showAllTags[cat.id];
        const tagsToShow = showAll ? cat.allTags : cat.popularTags;

        return (
          <div key={cat.id} className="rounded-xl border border-border overflow-hidden">
            {/* Category header */}
            <button
              type="button"
              onClick={() => setOpenCat(isOpen ? null : cat.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{cat.emoji}</span>
                <span className="font-semibold text-sm text-foreground">{cat.label}</span>
                {selectedInCat.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                    {selectedInCat.length} selected
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {/* Tags */}
            {isOpen && (
              <div className="px-4 pb-4 pt-1 space-y-3" style={{ backgroundColor: cat.color.bg }}>
                <div className="flex flex-wrap gap-2">
                  {tagsToShow.map(tag => {
                    const isSelected = selected.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggle(tag)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          isSelected
                            ? "text-white border-transparent"
                            : "bg-white/70 border-border/60 hover:border-primary/40"
                        )}
                        style={isSelected ? { backgroundColor: "oklch(0.42 0.11 155)", borderColor: "oklch(0.42 0.11 155)" } : { color: cat.color.text }}
                      >
                        {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {cat.allTags.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAllTags(prev => ({ ...prev, [cat.id]: !showAll }))}
                    className="text-xs font-medium underline underline-offset-2"
                    style={{ color: cat.color.text }}
                  >
                    {showAll ? "Show fewer" : `Show all ${cat.allTags.length} ${cat.label} tags`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Avoid Picker ─────────────────────────────────────────────────────────────

function AvoidPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState("");

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  };

  const addCustom = () => {
    const val = custom.trim();
    if (val && !selected.includes(val)) {
      onChange([...selected, val]);
      setCustom("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {AVOID_SUGGESTIONS.map(tag => {
          const isSelected = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                isSelected
                  ? "text-white border-transparent"
                  : "bg-background border-border hover:border-red-300 text-muted-foreground"
              )}
              style={isSelected ? { backgroundColor: "oklch(0.55 0.18 25)", borderColor: "oklch(0.55 0.18 25)" } : {}}
            >
              {isSelected && <X className="w-3 h-3 inline mr-1" />}
              {tag}
            </button>
          );
        })}
      </div>
      {/* Custom avoid */}
      <div className="flex gap-2">
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          placeholder="Add your own (e.g. Sharks, Clowns)…"
          className={cn(inputClass, "flex-1")}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(tag => (
            <span key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: "oklch(0.55 0.18 25)" }}>
              {tag}
              <button type="button" onClick={() => onChange(selected.filter(t => t !== tag))}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Closed State ─────────────────────────────────────────────────────────────

function ClosedState() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto shadow-sm"
          style={{ backgroundColor: "oklch(0.92 0.06 155)" }}>
          <BookOpen className="w-10 h-10" style={{ color: "oklch(0.35 0.12 155)" }} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            BookNest
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium tracking-wide uppercase">
            Curated Books for Little Readers
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: "oklch(0.96 0.04 80)" }}>
            <Heart className="w-6 h-6" style={{ color: "oklch(0.55 0.14 45)" }} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Sign-ups are closed right now</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We're not currently accepting new sign-ups at this event, but we'd love to connect with you!
            Follow us on social media or check back soon.
          </p>
          <div className="pt-2 space-y-2">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Find us at</p>
            <div className="flex justify-center gap-4 text-sm font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>
              <span>@BookNest</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} BookNest · Curated books for curious kids
        </p>
      </div>
    </div>
  );
}

// ─── Success State ────────────────────────────────────────────────────────────

function SuccessState({ childName, parentName }: { childName: string; parentName: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm"
          style={{ backgroundColor: "oklch(0.92 0.06 155)" }}>
          <Check className="w-10 h-10" style={{ color: "oklch(0.35 0.12 155)" }} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            You're in the nest! 🐣
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Welcome to BookNest, {parentName}!
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm space-y-4 text-left">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
            <p className="text-sm text-foreground font-medium">
              We can't wait to find the perfect books for <strong>{childName}</strong>!
            </p>
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>✉️ A confirmation has been noted. You'll hear from us soon with next steps.</p>
            <p>📦 Your first curated box will be on its way before you know it.</p>
            <p>🎂 We'll make sure {childName} gets something extra special on their birthday.</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} BookNest · Curated books for curious kids
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// formOpen is controlled by the admin via localStorage key "booknest_signup_open"
// Default: open (true). Admin page sets it to false to close.

export default function SignupPage() {
  const [formOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem("booknest_signup_open");
    return stored === null ? true : stored === "true";
  });

  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!formOpen) return <ClosedState />;
  if (submitted) return <SuccessState childName={form.childName} parentName={form.parentName.split(" ")[0]} />;

  const set = (field: keyof FormData, value: string | string[] | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormData, string>> = {};
    if (!form.parentName.trim())  e.parentName  = "Parent name is required";
    if (!form.parentEmail.trim()) e.parentEmail = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.parentEmail)) e.parentEmail = "Enter a valid email";
    if (!form.addressLine1.trim()) e.addressLine1 = "Street address is required";
    if (!form.city.trim())         e.city         = "City is required";
    if (!form.state.trim())        e.state        = "State is required";
    if (!form.zip.trim())          e.zip          = "ZIP code is required";
    if (!form.childName.trim())    e.childName    = "Child's name is required";
    if (!form.childBirthday)       e.childBirthday = "Birthday is required";
    if (!form.readingLevel)        e.readingLevel  = "Please select a reading level";
    if (form.interests.length === 0) e.interests  = "Please select at least one interest";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll to first error
      const firstErr = document.querySelector("[data-error='true']");
      firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSubmitting(true);
    // Simulate API call (in production, POST to your backend)
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);
    setSubmitted(true);
    toast.success("Sign-up received!");
  };

  const err = (field: keyof FormData) => errors[field];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      {/* Header */}
      <div className="border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-foreground leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                BookNest
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                Curated Books for Little Readers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.30 0.12 155)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            Sign-ups Open
          </div>
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-6 text-center">
        <h1 className="text-4xl font-bold text-foreground leading-tight"
          style={{ fontFamily: "'Playfair Display', serif" }}>
          Join the Nest 🐣
        </h1>
        <p className="mt-3 text-muted-foreground text-base max-w-lg mx-auto leading-relaxed">
          Tell us about your little reader and we'll hand-pick books they'll actually love —
          delivered right to your door every month.
        </p>
        <div className="flex items-center justify-center gap-6 mt-5 text-xs text-muted-foreground font-medium">
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-600" />Personalized picks</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-600" />Age-matched</span>
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-600" />Cancel anytime</span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pb-16 space-y-6">

        {/* ── Section 1: Parent Info ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<User className="w-4 h-4" />}
            title="About You"
            subtitle="Your contact info — we'll use this to send your box and keep you updated."
          />
          <div className="grid grid-cols-1 gap-4">
            <Field label="Parent / Guardian Name" required>
              <input type="text" value={form.parentName}
                onChange={e => set("parentName", e.target.value)}
                placeholder="Jane Smith"
                data-error={!!err("parentName")}
                className={cn(inputClass, err("parentName") && "border-red-400 focus:ring-red-300")} />
              {err("parentName") && <p className="text-xs text-red-500 mt-1">{err("parentName")}</p>}
            </Field>

            <Field label="Email Address" required hint="We'll send your confirmation and shipping updates here.">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="email" value={form.parentEmail}
                  onChange={e => set("parentEmail", e.target.value)}
                  placeholder="jane@example.com"
                  data-error={!!err("parentEmail")}
                  className={cn(inputClass, "pl-10", err("parentEmail") && "border-red-400 focus:ring-red-300")} />
              </div>
              {err("parentEmail") && <p className="text-xs text-red-500 mt-1">{err("parentEmail")}</p>}
            </Field>
          </div>
        </div>

        {/* ── Section 2: Shipping Address ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<MapPin className="w-4 h-4" />}
            title="Shipping Address"
            subtitle="Where should we send your monthly book box?"
          />
          <div className="space-y-4">
            <Field label="Street Address" required>
              <input type="text" value={form.addressLine1}
                onChange={e => set("addressLine1", e.target.value)}
                placeholder="123 Reading Lane"
                data-error={!!err("addressLine1")}
                className={cn(inputClass, err("addressLine1") && "border-red-400 focus:ring-red-300")} />
              {err("addressLine1") && <p className="text-xs text-red-500 mt-1">{err("addressLine1")}</p>}
            </Field>
            <Field label="Apt / Suite / Unit">
              <input type="text" value={form.addressLine2}
                onChange={e => set("addressLine2", e.target.value)}
                placeholder="Apt 4B (optional)"
                className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="City" required>
                <input type="text" value={form.city}
                  onChange={e => set("city", e.target.value)}
                  placeholder="Springfield"
                  data-error={!!err("city")}
                  className={cn(inputClass, err("city") && "border-red-400 focus:ring-red-300")} />
                {err("city") && <p className="text-xs text-red-500 mt-1">{err("city")}</p>}
              </Field>
              <Field label="State" required>
                <select value={form.state} onChange={e => set("state", e.target.value)}
                  data-error={!!err("state")}
                  className={cn(inputClass, err("state") && "border-red-400 focus:ring-red-300")}>
                  <option value="">Select state</option>
                  {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {err("state") && <p className="text-xs text-red-500 mt-1">{err("state")}</p>}
              </Field>
            </div>
            <Field label="ZIP Code" required>
              <input type="text" value={form.zip}
                onChange={e => set("zip", e.target.value)}
                placeholder="62701"
                maxLength={10}
                data-error={!!err("zip")}
                className={cn(inputClass, "max-w-[160px]", err("zip") && "border-red-400 focus:ring-red-300")} />
              {err("zip") && <p className="text-xs text-red-500 mt-1">{err("zip")}</p>}
            </Field>
          </div>
        </div>

        {/* ── Section 3: About Your Child ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<Cake className="w-4 h-4" />}
            title="About Your Little Reader"
            subtitle="Help us get to know them so we can pick books they'll love."
          />
          <div className="space-y-4">
            <Field label="Child's First Name" required>
              <input type="text" value={form.childName}
                onChange={e => set("childName", e.target.value)}
                placeholder="Emma"
                data-error={!!err("childName")}
                className={cn(inputClass, err("childName") && "border-red-400 focus:ring-red-300")} />
              {err("childName") && <p className="text-xs text-red-500 mt-1">{err("childName")}</p>}
            </Field>

            <Field label="Birthday" required hint="We'll send a special birthday surprise! 🎂">
              <input type="date" value={form.childBirthday}
                onChange={e => set("childBirthday", e.target.value)}
                max={new Date().toISOString().split("T")[0]}
                data-error={!!err("childBirthday")}
                className={cn(inputClass, "max-w-[220px]", err("childBirthday") && "border-red-400 focus:ring-red-300")} />
              {err("childBirthday") && <p className="text-xs text-red-500 mt-1">{err("childBirthday")}</p>}
            </Field>

            <Field label="Reading Level / Nest Tier" required hint="Not sure? Pick the age range that fits best — we'll fine-tune from there.">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-error={!!err("readingLevel")}>
                {READING_LEVELS.map(level => {
                  const isSelected = form.readingLevel === level.value;
                  return (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => set("readingLevel", level.value)}
                      className={cn(
                        "p-3.5 rounded-xl border-2 text-left transition-all",
                        isSelected ? "border-primary shadow-sm" : "border-border hover:border-primary/40"
                      )}
                      style={isSelected ? { backgroundColor: "oklch(0.96 0.04 155)" } : {}}>
                      <div className="flex items-start justify-between">
                        <span className="text-xl">{level.label.split(" ")[0]}</span>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-sm text-foreground mt-1">
                        {level.label.split(" ").slice(1).join(" ")}
                      </p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: "oklch(0.42 0.11 155)" }}>{level.range}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{level.desc}</p>
                    </button>
                  );
                })}
              </div>
              {err("readingLevel") && <p className="text-xs text-red-500 mt-1">{err("readingLevel")}</p>}
            </Field>
          </div>
        </div>

        {/* ── Section 4: Interests ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<Star className="w-4 h-4" />}
            title="What Does Your Child Love?"
            subtitle="Select categories and topics — the more you pick, the better we can curate. Select at least one."
          />
          <div data-error={!!err("interests")}>
            <InterestPicker
              selected={form.interests}
              onChange={v => set("interests", v)}
            />
            {err("interests") && <p className="text-xs text-red-500 mt-2">{err("interests")}</p>}
          </div>
          {form.interests.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-muted-foreground font-medium mb-2">
                {form.interests.length} interest{form.interests.length !== 1 ? "s" : ""} selected:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {form.interests.map(tag => (
                  <span key={tag}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                    {tag}
                    <button type="button"
                      onClick={() => set("interests", form.interests.filter(t => t !== tag))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Section 5: Topics to Avoid ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<ShieldX className="w-4 h-4" />}
            title="Topics to Avoid"
            subtitle="Anything we should steer clear of? Select all that apply or add your own."
          />
          <AvoidPicker
            selected={form.topicsToAvoid}
            onChange={v => set("topicsToAvoid", v)}
          />
        </div>

        {/* ── Section 6: Subscription Preference ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<BookMarked className="w-4 h-4" />}
            title="Which Nest Fits Your Family?"
            subtitle="All plans include unlimited swaps — you keep the same books as long as you want, then swap for a new bundle whenever you're ready. Checkout is handled through our Shopify store."
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {SUBSCRIPTION_TIERS.map(tier => {
              const isSelected = form.subscriptionTier === tier.value;
              return (
                <button key={tier.value} type="button"
                  onClick={() => set("subscriptionTier", tier.value)}
                  className={cn(
                    "relative p-5 rounded-2xl border-2 text-left transition-all flex flex-col gap-3",
                    isSelected
                      ? "border-primary shadow-md"
                      : tier.popular
                        ? "border-amber-300 hover:border-primary/50"
                        : "border-border hover:border-primary/40"
                  )}
                  style={isSelected ? { backgroundColor: "oklch(0.96 0.04 155)" } : tier.popular ? { backgroundColor: "oklch(0.99 0.015 80)" } : {}}>

                  {/* Most Popular badge */}
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                        style={{ backgroundColor: "oklch(0.975 0.008 80)", borderColor: "oklch(0.72 0.10 80)", color: "oklch(0.45 0.09 80)" }}>
                        Most Popular
                      </span>
                    </div>
                  )}

                  {/* Tier name + check */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{tier.label}</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-2xl font-bold text-foreground">{tier.price}</span>
                        <span className="text-xs text-muted-foreground">/mo</span>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Tagline */}
                  <p className="text-xs text-muted-foreground -mt-1">{tier.tagline}</p>

                  {/* Books per bundle highlight */}
                  <div className="px-3 py-1.5 rounded-lg text-xs font-semibold text-center"
                    style={{ backgroundColor: "oklch(0.92 0.05 155)", color: "oklch(0.35 0.10 155)" }}>
                    {tier.books}
                  </div>

                  {/* Perks list */}
                  <ul className="space-y-1.5">
                    {tier.perks.map((perk, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="mt-0.5 shrink-0" style={{ color: "oklch(0.42 0.11 155)" }}>✓</span>
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* Shopify checkout note */}
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-border bg-muted/30">
            <span className="text-base shrink-0">🛒</span>
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Checkout is through our Shopify store.</span>{" "}
              After submitting this form, you'll receive a link to complete your subscription. Your preference here helps us prepare your first bundle before you even check out.
            </p>
          </div>
        </div>

        {/* ── Section 7: Gift & Special Notes ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-5">
          <SectionHeader
            icon={<Gift className="w-4 h-4" />}
            title="Anything Else?"
            subtitle="Optional extras that help us make the experience extra special."
          />
          <div className="space-y-4">
            {/* Is this a gift? */}
            <div className="flex items-start gap-3 p-4 rounded-xl border border-border cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => set("isGift", !form.isGift)}>
              <div className={cn(
                "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                form.isGift ? "border-transparent" : "border-border"
              )} style={form.isGift ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
                {form.isGift && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">This is a gift 🎁</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  We'll include a gift card and can add a personal note.
                </p>
              </div>
            </div>

            {form.isGift && (
              <Field label="Gift Note" hint="We'll include this in the first box.">
                <textarea value={form.giftNote}
                  onChange={e => set("giftNote", e.target.value)}
                  placeholder="e.g. Happy birthday, Emma! From Grandma with love 💛"
                  rows={3}
                  className={cn(inputClass, "resize-none")} />
              </Field>
            )}

            <Field label="How did you hear about BookNest?">
              <select value={form.howHeard} onChange={e => set("howHeard", e.target.value)}
                className={inputClass}>
                <option value="">Select one…</option>
                {HOW_HEARD_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>

            <Field label="Anything else we should know?" hint="Allergies, sensitivities, special circumstances, or a note for us.">
              <textarea value={form.additionalNotes}
                onChange={e => set("additionalNotes", e.target.value)}
                placeholder="e.g. My daughter is going through a big move right now, so books about new beginnings would be especially meaningful."
                rows={4}
                className={cn(inputClass, "resize-none")} />
            </Field>
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-4">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              By submitting, you agree to receive emails from BookNest about your subscription.
              No spam, ever. Unsubscribe anytime.
            </p>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-xl text-white font-bold text-base flex items-center justify-center gap-2.5 transition-all hover:opacity-90 disabled:opacity-60 shadow-sm"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
            {submitting ? (
              <><span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
            ) : (
              <><Sparkles className="w-5 h-5" />Join the Nest — Let's Find Your Books!<ArrowRight className="w-5 h-5" /></>
            )}
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground pb-4">
          © {new Date().getFullYear()} BookNest · Curated books for curious kids · Made with ❤️ for little readers
        </p>
      </form>
    </div>
  );
}
