// BookNest — Public Welcome Form
// Accessible at /welcome?token=xxx (no sidebar, no PIN gate)
// Supports 1 primary + up to 3 siblings, tabbed per child.

import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import {
  BookOpen, User, Check, X, ChevronDown, ChevronUp,
  Baby, Sparkles, ShieldX, MessageSquare, Loader2, Heart, Bird
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_TAXONOMY } from "@/lib/tags";
import { trpc } from "@/lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGE_GROUPS = [
  { value: "Hatchlings",  range: "0–2 YEARS",  label: "Hatchlings",  desc: "Board books, picture books, simple rhymes",       emoji: "🐣" },
  { value: "Fledglings",  range: "3–5 YEARS",  label: "Fledglings",  desc: "Early readers, picture books, beginning stories", emoji: "🐦" },
  { value: "Soarers",     range: "6–8 YEARS",  label: "Soarers",     desc: "Chapter books, illustrated stories",               emoji: "🦅" },
  { value: "Sky Readers", range: "9–12 YEARS", label: "Sky Readers", desc: "Middle grade novels, longer chapter books",        emoji: "🌟" },
];

const INTEREST_CATEGORIES = TAG_TAXONOMY.map(cat => ({
  id: cat.id,
  label: cat.label,
  emoji: cat.emoji,
  color: cat.color,
  popularTags: cat.tags.slice(0, 8),
  allTags: cat.tags,
}));

const AVOID_SUGGESTIONS = [
  "Scary / Horror", "Violence", "Death & Grief", "Divorce", "Bathroom Humor",
  "War", "Bullying", "Religious Content", "LGBTQ+ themes", "Romance",
  "Scary Animals", "Clowns", "Spiders / Bugs", "Ghosts / Supernatural",
  "Peer Pressure", "Illness", "Political Topics",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildFormData {
  member_id: string;
  child_name: string;
  birthday: string;
  age_group: string;
  interests: string[];
  topics_to_avoid: string[];
  notes: string;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ icon, iconBg, title, subtitle, children }: {
  icon: React.ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg ?? "oklch(0.92 0.06 155)" }}>
          {icon}
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-base leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children, error, hint }: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5" data-error={!!error}>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
      {hint && !error && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-colors placeholder:text-gray-400";

// ─── Interest Picker ──────────────────────────────────────────────────────────

function InterestPicker({ selected, onChange }: {
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  };

  return (
    <div className="space-y-2">
      {INTEREST_CATEGORIES.map(cat => {
        const selectedInCat = cat.allTags.filter(t => selected.includes(t));
        const isOpen = openCat === cat.id;
        const tagsToShow = showAll[cat.id] ? cat.allTags : cat.popularTags;
        return (
          <div key={cat.id} className="rounded-xl border border-gray-200 overflow-hidden">
            <button type="button"
              onClick={() => setOpenCat(isOpen ? null : cat.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{cat.emoji}</span>
                <span className="font-semibold text-sm text-gray-800">{cat.label}</span>
                {selectedInCat.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: "oklch(0.35 0.12 155)" }}>
                    {selectedInCat.length} selected
                  </span>
                )}
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-2 space-y-3" style={{ backgroundColor: cat.color.bg }}>
                <div className="flex flex-wrap gap-2">
                  {tagsToShow.map(tag => {
                    const isSel = selected.includes(tag);
                    return (
                      <button key={tag} type="button" onClick={() => toggle(tag)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          isSel ? "text-white border-transparent" : "bg-white/80 border-gray-200 hover:border-emerald-400"
                        )}
                        style={isSel ? { backgroundColor: "oklch(0.35 0.12 155)" } : { color: cat.color.text }}>
                        {isSel && <Check className="w-3 h-3 inline mr-1" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {cat.allTags.length > 8 && (
                  <button type="button"
                    onClick={() => setShowAll(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                    className="text-xs font-medium underline underline-offset-2"
                    style={{ color: cat.color.text }}>
                    {showAll[cat.id] ? "Show fewer" : `Show all ${cat.allTags.length} ${cat.label} tags`}
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

function AvoidPicker({ selected, onChange }: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag]);
  };
  const addCustom = () => {
    const val = custom.trim();
    if (val && !selected.includes(val)) { onChange([...selected, val]); setCustom(""); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {AVOID_SUGGESTIONS.map(tag => {
          const isSel = selected.includes(tag);
          return (
            <button key={tag} type="button" onClick={() => toggle(tag)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                isSel ? "text-white border-transparent" : "bg-white border-gray-200 hover:border-red-300 text-gray-600"
              )}
              style={isSel ? { backgroundColor: "oklch(0.55 0.18 25)" } : {}}>
              {isSel && <X className="w-3 h-3 inline mr-1" />}
              {tag}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <textarea value={custom} onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCustom(); } }}
          placeholder="E.g. No scary monsters, no sounds..."
          rows={2} className={cn(inputClass, "flex-1 resize-none")} />
        <button type="button" onClick={addCustom} disabled={!custom.trim()}
          className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors self-start mt-0.5">
          +
        </button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
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

// ─── Child Form ───────────────────────────────────────────────────────────────

function ChildForm({ data, onChange, errors, siblingOrder, booksPerBox }: {
  data: ChildFormData;
  onChange: (updated: ChildFormData) => void;
  errors: Partial<Record<keyof ChildFormData, string>>;
  siblingOrder: number;
  booksPerBox: number;
}) {
  const set = <K extends keyof ChildFormData>(field: K, value: ChildFormData[K]) =>
    onChange({ ...data, [field]: value });

  const label = siblingOrder === 0 ? "Your Child" : `Sibling ${siblingOrder}`;

  return (
    <div className="space-y-5">
      {/* Books per box badge */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl w-fit"
        style={{ backgroundColor: "oklch(0.92 0.06 155)" }}>
        <BookOpen className="w-4 h-4" style={{ color: "oklch(0.35 0.12 155)" }} />
        <span className="text-xs font-bold" style={{ color: "oklch(0.30 0.12 155)" }}>
          {booksPerBox} books per box for {label}
        </span>
      </div>

      {/* Child Info */}
      <SectionCard
        icon={<Baby className="w-5 h-5" style={{ color: "oklch(0.35 0.12 155)" }} />}
        title={`About ${label}`}
        subtitle="Tell us a little about this reader.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Child's Name" required error={errors.child_name}>
            <input type="text" value={data.child_name}
              onChange={e => set("child_name", e.target.value)}
              placeholder="Emma"
              className={cn(inputClass, errors.child_name && "border-red-300 focus:border-red-400 focus:ring-red-200")} />
          </Field>
          <Field label="Birthday" hint="Helps us celebrate with something special!">
            <input type="date" value={data.birthday}
              onChange={e => set("birthday", e.target.value)}
              className={inputClass} />
          </Field>
        </div>
      </SectionCard>

      {/* Age Group */}
      <SectionCard
        icon={<span className="text-lg">🐣</span>}
        iconBg="oklch(0.94 0.04 80)"
        title="Current Age Group"
        subtitle="Select the group that best fits this child right now.">
        {errors.age_group && <p className="text-xs text-red-500 font-medium -mt-2">{errors.age_group}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {AGE_GROUPS.map(ag => {
            const isSelected = data.age_group === ag.value;
            return (
              <button key={ag.value} type="button" onClick={() => set("age_group", ag.value)}
                className={cn(
                  "relative rounded-xl border-2 p-4 text-left transition-all",
                  isSelected ? "border-transparent text-white shadow-md" : "border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm"
                )}
                style={isSelected ? { backgroundColor: "oklch(0.35 0.12 155)" } : {}}>
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <p className={cn("text-[10px] font-bold uppercase tracking-wider mb-1", isSelected ? "text-white/70" : "text-gray-400")}>
                  {ag.range}
                </p>
                <p className={cn("font-bold text-sm", isSelected ? "text-white" : "text-gray-800")}>
                  {ag.label}
                </p>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Interests */}
      <SectionCard
        icon={<Sparkles className="w-5 h-5" style={{ color: "oklch(0.55 0.14 75)" }} />}
        iconBg="oklch(0.96 0.05 80)"
        title="Story Interests"
        subtitle="Select the themes and topics this child loves. Pick as many as you like!">
        {errors.interests && <p className="text-xs text-red-500 font-medium -mt-2">{errors.interests}</p>}
        <InterestPicker selected={data.interests} onChange={v => set("interests", v)} />
        {data.interests.length > 0 && (
          <p className="text-xs text-emerald-700 font-medium mt-1">
            ✓ {data.interests.length} interest{data.interests.length !== 1 ? "s" : ""} selected
          </p>
        )}
      </SectionCard>

      {/* Exclusions */}
      <SectionCard
        icon={<ShieldX className="w-5 h-5 text-red-500" />}
        iconBg="oklch(0.96 0.03 25)"
        title="Exclusions"
        subtitle="Anything you'd prefer we avoid? We take these seriously.">
        <AvoidPicker selected={data.topics_to_avoid} onChange={v => set("topics_to_avoid", v)} />
      </SectionCard>

      {/* Notes */}
      <SectionCard
        icon={<MessageSquare className="w-5 h-5" style={{ color: "oklch(0.42 0.11 155)" }} />}
        title="Anything Else?"
        subtitle="Special requests or anything we should know about this child.">
        <textarea value={data.notes} onChange={e => set("notes", e.target.value)}
          placeholder="E.g. Loves anything with dogs, currently obsessed with space..."
          rows={3} className={cn(inputClass, "resize-none")} />
      </SectionCard>
    </div>
  );
}

// ─── Success State ────────────────────────────────────────────────────────────

function SuccessState({ parentName, childCount }: { parentName: string; childCount: number }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm"
          style={{ backgroundColor: "oklch(0.92 0.06 155)" }}>
          <Check className="w-10 h-10" style={{ color: "oklch(0.35 0.12 155)" }} />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
            Welcome to the nest! 🐣
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Thank you, {parentName}! {childCount > 1 ? `All ${childCount} readers are` : "Your reader is"} all set.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-4 text-left">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
            <p className="text-sm text-gray-800 font-medium">
              We can't wait to curate the perfect books for your {childCount > 1 ? "little readers" : "little reader"}!
            </p>
          </div>
          <div className="space-y-2 text-sm text-gray-500">
            <p>📦 Your first curated box will be thoughtfully assembled using these preferences.</p>
            <p>✉️ Keep an eye on your inbox — we'll be in touch before your first shipment.</p>
            <p>🎂 We'll make sure everyone gets something extra special on their birthday.</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">© {new Date().getFullYear()} The Book Nest · Curated books for curious kids</p>
      </div>
    </div>
  );
}

// ─── Error / Edge Case States ─────────────────────────────────────────────────

function MessageState({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto"
          style={{ backgroundColor: "oklch(0.92 0.06 155)" }}>
          <Bird className="w-8 h-8" style={{ color: "oklch(0.35 0.12 155)" }} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>
          {title}
        </h1>
        <p className="text-gray-500 text-sm">{body}</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WelcomePage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [children, setChildren] = useState<ChildFormData[]>([]);
  const [parentErrors, setParentErrors] = useState<Record<string, string>>({});
  const [childErrors, setChildErrors] = useState<Partial<Record<keyof ChildFormData, string>>[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data, isLoading, error } = trpc.welcome.load.useQuery(
  { token },
  { enabled: !!token, retry: false }
);

useEffect(() => {
  if (!data || (data as any).expired || (data as any).already_completed || initialized) return;
  const result = data as any;
  setParentName(result.parent_name ?? "");
  setParentEmail(result.parent_email ?? "");
  setChildren(result.children.map((c: any) => ({
    member_id: c.member_id,
    child_name: c.child_name ?? "",
    birthday: c.birthday ?? "",
    age_group: c.age_group ?? "",
    interests: c.interests ?? [],
    topics_to_avoid: c.topics_to_avoid ?? [],
    notes: c.notes ?? "",
  })));
  setChildErrors(result.children.map(() => ({})));
  setInitialized(true);
}, [data, initialized]);

  const submitMutation = trpc.welcome.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Something went wrong. Please try again.");
    },
  });

  // ── Edge cases ──
  if (!token) return <MessageState title="Missing invite link" body="Please use the link from your welcome email to access this form." />;
  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: "oklch(0.35 0.12 155)" }} />
    </div>
  );
  if (error || !data) return <MessageState title="Link not found" body="This welcome link is invalid. Please contact us at hello@thebooknest.co." />;
  if ((data as any).expired) return <MessageState title="Link expired" body="This welcome link has expired. Please contact us at hello@thebooknest.co and we'll send a new one." />;
  if ((data as any).already_completed) return <MessageState title="Already completed!" body="You've already filled out your welcome form. Your first box is on its way!" />;
  if (submitted) return <SuccessState parentName={parentName.split(" ")[0]} childCount={children.length} />;

  const validateAll = (): boolean => {
    let valid = true;
    const pErrors: Record<string, string> = {};
    if (!parentName.trim()) { pErrors.parentName = "Parent name is required"; valid = false; }
    if (!parentEmail.trim()) { pErrors.parentEmail = "Email is required"; valid = false; }
    else if (!/\S+@\S+\.\S+/.test(parentEmail)) { pErrors.parentEmail = "Enter a valid email"; valid = false; }
    setParentErrors(pErrors);

    const cErrors = children.map(child => {
      const e: Partial<Record<keyof ChildFormData, string>> = {};
      if (!child.child_name.trim()) { e.child_name = "Child's name is required"; valid = false; }
      if (!child.age_group) { e.age_group = "Please select an age group"; valid = false; }
      if (child.interests.length === 0) { e.interests = "Please select at least one interest"; valid = false; }
      return e;
    });
    setChildErrors(cErrors);

    // Switch to first tab with errors
    if (!valid) {
      const firstChildWithError = cErrors.findIndex(e => Object.keys(e).length > 0);
      if (firstChildWithError !== -1) setActiveTab(firstChildWithError);
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) {
      setTimeout(() => {
        const firstErr = document.querySelector("[data-error='true']");
        firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }
    submitMutation.mutate({
      token,
      parent_name: parentName,
      parent_email: parentEmail,
      children: children.map(c => ({
        member_id: c.member_id,
        child_name: c.child_name,
        birthday: c.birthday || undefined,
        age_group: c.age_group,
        interests: c.interests,
        topics_to_avoid: c.topics_to_avoid,
        notes: c.notes || undefined,
      })),
    });
  };

  const updateChild = (index: number, updated: ChildFormData) => {
    setChildren(prev => prev.map((c, i) => i === index ? updated : c));
  };

  const childLabels = (data as any).children.map((_: any, i: number) =>
    i === 0 ? "Child 1" : `Sibling ${i}`
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "oklch(0.35 0.12 155)" }}>
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                The Book Nest
              </p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">New Member Welcome</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.30 0.12 155)" }}>
            <Heart className="w-3 h-3" />
            Welcome to the Nest
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-4">
        <div className="rounded-2xl p-8 text-center mb-8"
          style={{ backgroundColor: "oklch(0.35 0.12 155)" }}>
          <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            Profile &amp; Interests
          </h1>
          <p className="text-white/80 text-sm leading-relaxed max-w-md mx-auto">
            Tell us what your little {children.length > 1 ? "ones love" : "one loves"} so we can find the perfect stories.
            This takes about 2 minutes and helps us curate every box just for them.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="max-w-2xl mx-auto px-4 pb-16 space-y-5">

          {/* Parent Information */}
          <SectionCard
            icon={<User className="w-5 h-5" style={{ color: "oklch(0.35 0.12 155)" }} />}
            title="Parent Information"
            subtitle="So we know who to contact about your subscription.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required error={parentErrors.parentName}>
                <input type="text" value={parentName} onChange={e => setParentName(e.target.value)}
                  placeholder="Jane Smith"
                  className={cn(inputClass, parentErrors.parentName && "border-red-300 focus:border-red-400 focus:ring-red-200")} />
              </Field>
              <Field label="Email Address" required error={parentErrors.parentEmail}>
                <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className={cn(inputClass, parentErrors.parentEmail && "border-red-300 focus:border-red-400 focus:ring-red-200")} />
              </Field>
            </div>
          </SectionCard>

          {/* Child Tabs */}
          {children.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {childLabels.map((label: string, i: number) => {
                const hasError = childErrors[i] && Object.keys(childErrors[i]).length > 0;
                return (
                  <button key={i} type="button" onClick={() => setActiveTab(i)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border-2 transition-all",
                      activeTab === i
                        ? "text-white border-transparent"
                        : "bg-white border-gray-200 text-gray-600 hover:border-emerald-300"
                    )}
                    style={activeTab === i ? { backgroundColor: "oklch(0.35 0.12 155)" } : {}}>
                    {hasError && <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />}
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Active Child Form */}
          {children[activeTab] && (
            <ChildForm
              key={activeTab}
              data={children[activeTab]}
              onChange={updated => updateChild(activeTab, updated)}
              errors={childErrors[activeTab] ?? {}}
              siblingOrder={activeTab}
              booksPerBox={(data as any).children[activeTab]?.books_per_box ?? 4}
            />
          )}

          {/* Navigation between tabs */}
          {children.length > 1 && (
            <div className="flex justify-between gap-3">
              <button type="button"
                onClick={() => setActiveTab(i => Math.max(0, i - 1))}
                disabled={activeTab === 0}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors">
                ← Previous
              </button>
              {activeTab < children.length - 1 ? (
                <button type="button"
                  onClick={() => setActiveTab(i => Math.min(children.length - 1, i + 1))}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: "oklch(0.35 0.12 155)" }}>
                  Next →
                </button>
              ) : null}
            </div>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button type="submit" disabled={submitMutation.isPending}
              className="w-full py-4 rounded-xl text-white font-bold text-base shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: "oklch(0.35 0.12 155)" }}>
              {submitMutation.isPending ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Saving profiles…</>
              ) : (
                <><Check className="w-5 h-5" />Complete {children.length > 1 ? "All Profiles" : "My Profile"}</>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">
              Your preferences are saved securely and used only to curate your Book Nest boxes.
            </p>
          </div>

        </div>
      </form>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-white py-6">
        <p className="text-center text-xs text-gray-400">
          © {new Date().getFullYear()} The Book Nest · Curated books for curious kids
        </p>
      </div>
    </div>
  );
}