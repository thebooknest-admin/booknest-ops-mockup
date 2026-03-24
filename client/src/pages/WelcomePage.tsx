// BookNest — Public Welcome Form
// Accessible at /welcome (no sidebar, no PIN gate)
// New members fill this out after subscribing via Shopify.
// Matches the member portal aesthetic from the-book-nest.com.

import { useState } from "react";
import { toast } from "sonner";
import {
  BookOpen, User, Check, X, ChevronDown, ChevronUp,
  Baby, Sparkles, ShieldX, MessageSquare, Loader2, Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_TAXONOMY } from "@/lib/tags";
import { trpc } from "@/lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGE_GROUPS = [
  {
    value: "hatchlings",
    range: "0–2 YEARS",
    label: "Hatchlings",
    desc: "Board books, picture books, simple rhymes",
    emoji: "🐣",
  },
  {
    value: "fledglings",
    range: "3–5 YEARS",
    label: "Fledglings",
    desc: "Early readers, picture books, beginning stories",
    emoji: "🐦",
  },
  {
    value: "soarers",
    range: "6–8 YEARS",
    label: "Soarers",
    desc: "Chapter books, illustrated stories",
    emoji: "🦅",
  },
  {
    value: "sky_readers",
    range: "9–12 YEARS",
    label: "Sky Readers",
    desc: "Middle grade novels, longer chapter books",
    emoji: "🌟",
  },
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

interface WelcomeFormData {
  parentName: string;
  parentEmail: string;
  childName: string;
  childBirthday: string;
  ageGroup: string;
  interests: string[];
  topicsToAvoid: string[];
  additionalNotes: string;
}

const EMPTY_FORM: WelcomeFormData = {
  parentName: "",
  parentEmail: "",
  childName: "",
  childBirthday: "",
  ageGroup: "",
  interests: [],
  topicsToAvoid: [],
  additionalNotes: "",
};

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
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg ?? "oklch(0.92 0.06 155)" }}
        >
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
            <button
              type="button"
              onClick={() => setOpenCat(isOpen ? null : cat.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{cat.emoji}</span>
                <span className="font-semibold text-sm text-gray-800">{cat.label}</span>
                {selectedInCat.length > 0 && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: "oklch(0.35 0.12 155)" }}
                  >
                    {selectedInCat.length} selected
                  </span>
                )}
              </div>
              {isOpen
                ? <ChevronUp className="w-4 h-4 text-gray-400" />
                : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-2 space-y-3" style={{ backgroundColor: cat.color.bg }}>
                <div className="flex flex-wrap gap-2">
                  {tagsToShow.map(tag => {
                    const isSel = selected.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggle(tag)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                          isSel
                            ? "text-white border-transparent"
                            : "bg-white/80 border-gray-200 hover:border-emerald-400"
                        )}
                        style={
                          isSel
                            ? { backgroundColor: "oklch(0.35 0.12 155)" }
                            : { color: cat.color.text }
                        }
                      >
                        {isSel && <Check className="w-3 h-3 inline mr-1" />}
                        {tag}
                      </button>
                    );
                  })}
                </div>
                {cat.allTags.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setShowAll(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))}
                    className="text-xs font-medium underline underline-offset-2"
                    style={{ color: cat.color.text }}
                  >
                    {showAll[cat.id]
                      ? "Show fewer"
                      : `Show all ${cat.allTags.length} ${cat.label} tags`}
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
    if (val && !selected.includes(val)) {
      onChange([...selected, val]);
      setCustom("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {AVOID_SUGGESTIONS.map(tag => {
          const isSel = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                isSel
                  ? "text-white border-transparent"
                  : "bg-white border-gray-200 hover:border-red-300 text-gray-600"
              )}
              style={isSel ? { backgroundColor: "oklch(0.55 0.18 25)" } : {}}
            >
              {isSel && <X className="w-3 h-3 inline mr-1" />}
              {tag}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <textarea
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCustom(); }
          }}
          placeholder="E.g. No scary monsters, no sounds..."
          rows={2}
          className={cn(inputClass, "flex-1 resize-none")}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="px-4 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors self-start mt-0.5"
        >
          +
        </button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: "oklch(0.55 0.18 25)" }}
            >
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

// ─── Success State ────────────────────────────────────────────────────────────

function SuccessState({ childName, parentName }: { childName: string; parentName: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16"
      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      <div className="max-w-md w-full text-center space-y-6">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-sm"
          style={{ backgroundColor: "oklch(0.92 0.06 155)" }}
        >
          <Check className="w-10 h-10" style={{ color: "oklch(0.35 0.12 155)" }} />
        </div>
        <div>
          <h1
            className="text-3xl font-bold text-gray-900"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Welcome to the nest! 🐣
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            Thank you, {parentName}! Your profile is all set.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-4 text-left">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 shrink-0" style={{ color: "oklch(0.55 0.14 75)" }} />
            <p className="text-sm text-gray-800 font-medium">
              We can't wait to curate the perfect books for <strong>{childName}</strong>!
            </p>
          </div>
          <div className="space-y-2 text-sm text-gray-500">
            <p>📦 Your first curated box will be thoughtfully assembled using these preferences.</p>
            <p>✉️ Keep an eye on your inbox — we'll be in touch before your first shipment.</p>
            <p>🎂 We'll make sure {childName} gets something extra special on their birthday.</p>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} The Book Nest · Curated books for curious kids
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WelcomePage() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<WelcomeFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof WelcomeFormData, string>>>({});

  const submitMutation = trpc.welcome.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Something went wrong. Please try again.");
    },
  });

  if (submitted) {
    return (
      <SuccessState
        childName={form.childName}
        parentName={form.parentName.split(" ")[0]}
      />
    );
  }

  const set = <K extends keyof WelcomeFormData>(field: K, value: WelcomeFormData[K]) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof WelcomeFormData, string>> = {};
    if (!form.parentName.trim())  e.parentName  = "Parent name is required";
    if (!form.parentEmail.trim()) e.parentEmail = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.parentEmail)) e.parentEmail = "Enter a valid email";
    if (!form.childName.trim())   e.childName   = "Child's name is required";
    if (!form.ageGroup)           e.ageGroup    = "Please select an age group";
    if (form.interests.length === 0) e.interests = "Please select at least one interest";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      const firstErr = document.querySelector("[data-error='true']");
      firstErr?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    submitMutation.mutate({
      parent_name: form.parentName,
      parent_email: form.parentEmail,
      child_name: form.childName,
      child_birthday: form.childBirthday || undefined,
      age_group: form.ageGroup,
      interests: form.interests,
      topics_to_avoid: form.topicsToAvoid,
      additional_notes: form.additionalNotes || undefined,
    });
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "oklch(0.35 0.12 155)" }}
            >
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p
                className="font-bold text-gray-900 leading-tight"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                The Book Nest
              </p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">
                New Member Welcome
              </p>
            </div>
          </div>
          <div
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ backgroundColor: "oklch(0.92 0.06 155)", color: "oklch(0.30 0.12 155)" }}
          >
            <Heart className="w-3 h-3" />
            Welcome to the Nest
          </div>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-4">
        <div
          className="rounded-2xl p-8 text-center mb-8"
          style={{ backgroundColor: "oklch(0.35 0.12 155)" }}
        >
          <h1
            className="text-3xl font-bold text-white mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Profile &amp; Interests
          </h1>
          <p className="text-white/80 text-sm leading-relaxed max-w-md mx-auto">
            Tell us what your little ones love so we can find the perfect stories.
            This takes about 2 minutes and helps us curate every box just for them.
          </p>
        </div>
      </div>

      {/* ── Form ── */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="max-w-2xl mx-auto px-4 pb-16 space-y-5">

          {/* Parent Information */}
          <SectionCard
            icon={<User className="w-5 h-5" style={{ color: "oklch(0.35 0.12 155)" }} />}
            title="Parent Information"
            subtitle="So we know who to contact about your subscription."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full Name" required error={errors.parentName}>
                <input
                  type="text"
                  value={form.parentName}
                  onChange={e => set("parentName", e.target.value)}
                  placeholder="Jane Smith"
                  className={cn(inputClass, errors.parentName && "border-red-300 focus:border-red-400 focus:ring-red-200")}
                />
              </Field>
              <Field label="Email Address" required error={errors.parentEmail}>
                <input
                  type="email"
                  value={form.parentEmail}
                  onChange={e => set("parentEmail", e.target.value)}
                  placeholder="jane@example.com"
                  className={cn(inputClass, errors.parentEmail && "border-red-300 focus:border-red-400 focus:ring-red-200")}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Child Information */}
          <SectionCard
            icon={<Baby className="w-5 h-5" style={{ color: "oklch(0.35 0.12 155)" }} />}
            title="About Your Reader"
            subtitle="Tell us a little about the child receiving books."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Child's Name" required error={errors.childName}>
                <input
                  type="text"
                  value={form.childName}
                  onChange={e => set("childName", e.target.value)}
                  placeholder="Emma"
                  className={cn(inputClass, errors.childName && "border-red-300 focus:border-red-400 focus:ring-red-200")}
                />
              </Field>
              <Field label="Birthday" hint="Helps us celebrate with something special!">
                <input
                  type="date"
                  value={form.childBirthday}
                  onChange={e => set("childBirthday", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Age Group */}
          <SectionCard
            icon={<span className="text-lg">🐣</span>}
            iconBg="oklch(0.94 0.04 80)"
            title="Current Age Group"
            subtitle="Select the group that best fits your child right now."
          >
            {errors.ageGroup && (
              <p className="text-xs text-red-500 font-medium -mt-2">{errors.ageGroup}</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {AGE_GROUPS.map(ag => {
                const isSelected = form.ageGroup === ag.value;
                return (
                  <button
                    key={ag.value}
                    type="button"
                    onClick={() => set("ageGroup", ag.value)}
                    className={cn(
                      "relative rounded-xl border-2 p-4 text-left transition-all",
                      isSelected
                        ? "border-transparent text-white shadow-md"
                        : "border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm"
                    )}
                    style={isSelected ? { backgroundColor: "oklch(0.35 0.12 155)" } : {}}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    <p className={cn(
                      "text-[10px] font-bold uppercase tracking-wider mb-1",
                      isSelected ? "text-white/70" : "text-gray-400"
                    )}>
                      {ag.range}
                    </p>
                    <p className={cn(
                      "font-bold text-sm",
                      isSelected ? "text-white" : "text-gray-800"
                    )}>
                      {ag.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </SectionCard>

          {/* Story Interests */}
          <SectionCard
            icon={<Sparkles className="w-5 h-5" style={{ color: "oklch(0.55 0.14 75)" }} />}
            iconBg="oklch(0.96 0.05 80)"
            title="Story Interests"
            subtitle="Select the themes and topics your child loves. Pick as many as you like!"
          >
            {errors.interests && (
              <p className="text-xs text-red-500 font-medium -mt-2">{errors.interests}</p>
            )}
            <InterestPicker
              selected={form.interests}
              onChange={v => set("interests", v)}
            />
            {form.interests.length > 0 && (
              <p className="text-xs text-emerald-700 font-medium mt-1">
                ✓ {form.interests.length} interest{form.interests.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </SectionCard>

          {/* Exclusions */}
          <SectionCard
            icon={<ShieldX className="w-5 h-5 text-red-500" />}
            iconBg="oklch(0.96 0.03 25)"
            title="Exclusions"
            subtitle="Anything you'd prefer we avoid? We take these seriously."
          >
            <AvoidPicker
              selected={form.topicsToAvoid}
              onChange={v => set("topicsToAvoid", v)}
            />
          </SectionCard>

          {/* Additional Notes */}
          <SectionCard
            icon={<MessageSquare className="w-5 h-5" style={{ color: "oklch(0.42 0.11 155)" }} />}
            title="Anything Else?"
            subtitle="Special requests, allergies, sibling info, or anything we should know."
          >
            <textarea
              value={form.additionalNotes}
              onChange={e => set("additionalNotes", e.target.value)}
              placeholder="E.g. We have twins! One loves dinosaurs, the other prefers fairies. Please no books with loud sound effects."
              rows={4}
              className={cn(inputClass, "resize-none")}
            />
          </SectionCard>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="w-full py-4 rounded-xl text-white font-bold text-base shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ backgroundColor: "oklch(0.35 0.12 155)" }}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving your profile…
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Complete My Profile
                </>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 mt-3">
              Your preferences are saved securely and used only to curate your BookNest boxes.
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
