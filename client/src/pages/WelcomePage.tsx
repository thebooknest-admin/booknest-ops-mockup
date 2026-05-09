// BookNest — Public Welcome Form
// Accessible at /welcome?token=xxx (no sidebar, no PIN gate)
// Supports 1 primary + up to 3 siblings, tabbed per child.

import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import {
  BookOpen, User, Check, X, ChevronDown, ChevronUp,
  Baby, Sparkles, Info, ShieldX, MessageSquare, Loader2, Heart, Bird
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAG_TAXONOMY } from "@/lib/tags";
import { trpc } from "@/lib/trpc";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGE_GROUPS = [
  { value: "Hatchlings",  range: "0–2 YEARS",  label: "Hatchlings",  desc: "Board books, first words, simple rhymes", emoji: "🐣" },
  { value: "Fledglings",  range: "3–5 YEARS",  label: "Fledglings",  desc: "Picture books, preschool stories, read-alouds", emoji: "🐦" },
  { value: "Soarers",     range: "6–8 YEARS",  label: "Soarers",     desc: "Early readers and beginner chapter books", emoji: "🦅" },
  { value: "Sky Readers", range: "9–12 YEARS", label: "Sky Readers", desc: "Middle grade and longer chapter books", emoji: "🌟" },
];

const THEME_OPTIONS = [
  {
    id: "adventure",
    label: "Adventure",
    emoji: "🗺️",
    description: "Quest stories, mysteries, brave journeys, and exciting adventures.",
    color: {
      bg: "oklch(0.95 0.04 220)",
      text: "oklch(0.45 0.12 220)",
    },
  },
  {
    id: "laughs",
    label: "Laughs & Chaos",
    emoji: "😂",
    description: "Funny, silly, goofy, and wildly energetic stories.",
    color: {
      bg: "oklch(0.97 0.05 40)",
      text: "oklch(0.55 0.16 40)",
    },
  },
  {
    id: "heart",
    label: "Heart & Home",
    emoji: "💛",
    description: "Friendship, family, school, feelings, and everyday life.",
    color: {
      bg: "oklch(0.96 0.05 90)",
      text: "oklch(0.55 0.15 90)",
    },
  },
  {
    id: "wonder",
    label: "Wonder & Imagination",
    emoji: "✨",
    description: "Magic, fantasy, dragons, imagination, and dreamy adventures.",
    color: {
      bg: "oklch(0.96 0.04 300)",
      text: "oklch(0.52 0.14 300)",
    },
  },
  {
    id: "wild",
    label: "Wild & Wonderful",
    emoji: "🦊",
    description: "Animals, bugs, nature, dinosaurs, and outdoor discoveries.",
    color: {
      bg: "oklch(0.96 0.05 140)",
      text: "oklch(0.45 0.12 140)",
    },
  },
  {
    id: "discovery",
    label: "Discovery Den",
    emoji: "🧠",
    description: "Science, nonfiction, learning, STEM, and how-things-work books.",
    color: {
      bg: "oklch(0.96 0.04 260)",
      text: "oklch(0.50 0.14 260)",
    },
  },
  {
    id: "legends",
    label: "Legends & Long Ago",
    emoji: "🏰",
    description: "Fairy tales, folklore, classics, myths, and historical stories.",
    color: {
      bg: "oklch(0.96 0.05 20)",
      text: "oklch(0.52 0.13 20)",
    },
  },
  {
    id: "seasons",
    label: "Seasons & Celebrations",
    emoji: "🍂",
    description: "Holidays, birthdays, traditions, and seasonal favorites.",
    color: {
      bg: "oklch(0.97 0.05 60)",
      text: "oklch(0.55 0.15 60)",
    },
  },
  {
    id: "bigworlds",
    label: "Big Worlds",
    emoji: "🌎",
    description: "Culture, identity, diversity, belonging, and global perspectives.",
    color: {
      bg: "oklch(0.95 0.04 200)",
      text: "oklch(0.45 0.12 200)",
    },
  },
  {
    id: "tiny",
    label: "Tiny Tales",
    emoji: "🌙",
    description: "Gentle bedtime stories, calming reads, and cozy moments.",
    color: {
      bg: "oklch(0.96 0.03 260)",
      text: "oklch(0.45 0.10 260)",
    },
  },
];

const INTEREST_OPTIONS = [
  "Animals",
  "Dinosaurs",
  "Dogs",
  "Cats",
  "Ocean",
  "Bugs",
  "Farm",
  "Nature",
  "Space",
  "Science",
  "Trucks",
  "Vehicles",
  "Construction",
  "Sports",
  "Art",
  "Music",
  "Magic",
  "Dragons",
  "Unicorns",
  "Princesses",
  "Superheroes",
  "Funny Stories",
  "Silly Stories",
  "Adventure",
  "Mystery",
  "School Stories",
  "Friendship",
  "Family",
  "Bedtime Stories",
  "Holidays",
  "Fairy Tales",
  "Classics",
  "Learning Books",
  "Chapter Books",
];

const AVOID_SUGGESTIONS = [
  "Scary Stories",
  "Violence",
  "Death & Grief",
  "Divorce",
  "Bullying",
  "Bathroom Humor",
  "Religious Content",
  "Romance",
  "War",
  "Spiders / Bugs",
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildFormData {
  member_id: string;
  child_name: string;
  birthday: string;
  age_group: string;
  favorite_themes: string[];
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

function ThemePickerPublic({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (themes: string[]) => void;
}) {
  const toggle = (theme: string) => {
    onChange(
      selected.includes(theme)
        ? selected.filter(t => t !== theme)
        : [...selected, theme]
    );
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {THEME_OPTIONS.map(theme => {
        const isSelected = selected.includes(theme.label);

        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => toggle(theme.label)}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-all",
              isSelected
                ? "border-transparent shadow-md"
                : "border-gray-200 bg-white hover:border-emerald-300 hover:shadow-sm"
            )}
            style={
              isSelected
                ? {
                    backgroundColor: theme.color.bg,
                    borderColor: theme.color.text,
                  }
                : {}
            }
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">{theme.emoji}</span>
              <div className="flex-1">

  <div className="flex items-center gap-1">
    <p
      className="font-bold text-sm"
      style={isSelected ? { color: theme.color.text } : {}}
    >
      {theme.label}
    </p>

    <div className="group relative">
      <Info className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 transition-colors" />

      <div className="absolute left-1/2 top-6 z-20 hidden w-52 -translate-x-1/2 rounded-xl bg-gray-900 px-3 py-2 text-xs text-white shadow-xl group-hover:block">
        {theme.description}
      </div>
    </div>
  </div>

  {isSelected && (
    <p className="text-xs mt-1" style={{ color: theme.color.text }}>
      Selected
    </p>
  )}
</div>
              {isSelected && (
                <Check className="w-4 h-4" style={{ color: theme.color.text }} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InterestPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (interests: string[]) => void;
}) {
  const toggle = (interest: string) => {
    onChange(
      selected.includes(interest)
        ? selected.filter(i => i !== interest)
        : [...selected, interest]
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">
  Pick as many as you'd like.
</p>
      <div className="flex flex-wrap gap-2">
        {INTEREST_OPTIONS.map(interest => {
          const isSelected = selected.includes(interest);

          return (
            <button
              key={interest}
              type="button"
              onClick={() => toggle(interest)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                isSelected
                  ? "text-white border-transparent shadow-sm"
                  : "bg-white border-gray-200 hover:border-emerald-400 text-gray-700"
              )}
              style={
                isSelected
                  ? { backgroundColor: "oklch(0.35 0.12 155)" }
                  : {}
              }
            >
              {isSelected && <Check className="w-3 h-3 inline mr-1" />}
              {interest}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <p className="text-xs text-emerald-700 font-medium">
          ✓ {selected.length} interest{selected.length !== 1 ? "s" : ""} selected
        </p>
      )}
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
          placeholder="Anything else to avoid? E.g. no scary monsters, no potty humor..."
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
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 px-1">
  1. About the Reader
</p>
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
                <p className={cn("text-[10px] mt-1 leading-snug", isSelected ? "text-white/75" : "text-gray-400")}>
  {ag.desc}
</p>
              </button>
            );
          })}
        </div>
      </SectionCard>

<p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 px-1 pt-2">
  2. What They Enjoy
</p>
      {/* Favorite Themes */}
<SectionCard
  icon={<Sparkles className="w-5 h-5" style={{ color: "oklch(0.55 0.14 75)" }} />}
  iconBg="oklch(0.96 0.05 80)"
  title="Favorite Story Themes"
  subtitle="Pick 2–4 broad story types this child usually enjoys.">
  <ThemePickerPublic
    selected={data.favorite_themes}
    onChange={v => set("favorite_themes", v)}
  />
</SectionCard>

{/* Interests */}
<SectionCard
  icon={<Heart className="w-5 h-5" style={{ color: "oklch(0.35 0.12 155)" }} />}
  iconBg="oklch(0.92 0.06 155)"
  title="Specific Interests"
  subtitle="Choose favorite topics, characters, settings, or story styles.">
  {errors.interests && (
    <p className="text-xs text-red-500 font-medium -mt-2">
      {errors.interests}
    </p>
  )}

  <InterestPicker
    selected={data.interests}
    onChange={v => set("interests", v)}
  />
</SectionCard>

<p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 px-1 pt-2">
  3. What to Avoid
</p>
      {/* Exclusions */}
      <SectionCard
        icon={<ShieldX className="w-5 h-5 text-red-500" />}
        iconBg="oklch(0.96 0.03 25)"
        title="Exclusions"
        subtitle="Optional — tell us anything you'd rather not receive.">
        <AvoidPicker selected={data.topics_to_avoid} onChange={v => set("topics_to_avoid", v)} />
      </SectionCard>

      {/* Notes */}
      <SectionCard
        icon={<MessageSquare className="w-5 h-5" style={{ color: "oklch(0.42 0.11 155)" }} />}
        title="Anything Else?"
        subtitle="Optional notes, favorite details, or anything else you'd like us to know.">
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
    favorite_themes: c.favorite_themes ?? [],
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
      if (child.favorite_themes.length === 0 && child.interests.length === 0) {
  e.interests = "Please select at least one theme or interest";
  valid = false;
}
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
        favorite_themes: c.favorite_themes,
        interests: c.interests,
        topics_to_avoid: c.topics_to_avoid,
        notes: c.notes || undefined,
      })),
    });
  };

  const updateChild = (index: number, updated: ChildFormData) => {
    setChildren(prev => prev.map((c, i) => i === index ? updated : c));
  };

  const childLabels = children.map((child, i) => {
  if (child.child_name?.trim()) {
    return child.child_name;
  }

  return `Reader ${i + 1} of ${children.length}`;
});

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
            Let’s Build Their Perfect Book Box
          </h1>
          <p className="text-white/80 text-sm leading-relaxed max-w-md mx-auto">
            Tell us what your little {children.length > 1 ? "ones love" : "one loves"} so we can choose stories that actually fit.
            Pick favorite themes, interests, and anything you'd like us to avoid.
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