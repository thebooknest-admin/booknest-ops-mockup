// BookNest Ops — Admin Sign-Up Form Control Page (wired to live Supabase data)
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  ToggleLeft, ToggleRight, ExternalLink, Copy, Eye,
  Users, CheckCircle, XCircle, Info, UserPlus, RefreshCw,
  Loader2, ChevronDown, ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "booknest_signup_open";

const TIER_LABELS: Record<string, string> = {
  little_nest: "Little Nest",
  cozy_nest: "Cozy Nest",
  story_nest: "Story Nest",
};

const LEVEL_LABELS: Record<string, string> = {
  hatchlings: "🐣 Hatchlings",
  fledglings: "🐥 Fledglings",
  soarers: "🦅 Soarers",
  sky_readers: "🌟 Sky Readers",
};

export default function SignupControlPage() {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });
  const [copied, setCopied] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  const { data, isLoading, refetch, isRefetching } = trpc.signups.list.useQuery();
  const signups = data?.data ?? [];
  const pending = signups.filter((s: any) => !s.converted_to_member);
  const converted = signups.filter((s: any) => s.converted_to_member);

  const convertMutation = trpc.signups.convertToMember.useMutation({
    onSuccess: (result, vars) => {
      toast.success("Member created successfully!");
      setConvertingId(null);
      refetch();
    },
    onError: (err: any) => {
      toast.error("Failed to convert: " + err.message);
      setConvertingId(null);
    },
  });

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    toast.success(next ? "✅ Sign-up form is now OPEN" : "🔒 Sign-up form is now CLOSED", {
      description: next
        ? "Visitors can now fill out the form at your sign-up link."
        : "Visitors will see a friendly 'closed' message.",
      duration: 4000,
    });
  };

  const signupUrl = `${window.location.origin}/signup`;

  const handleCopy = () => {
    navigator.clipboard.writeText(signupUrl).then(() => {
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleConvert = (signupId: string) => {
    setConvertingId(signupId);
    convertMutation.mutate({ signup_id: signupId });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Event Sign-Up Form</h1>
        <p className="page-subtitle">Control your public sign-up form · manage submissions</p>
      </div>

      {/* Status card */}
      <div className={cn(
        "rounded-2xl border-2 p-6 transition-all",
        isOpen ? "border-green-300" : "border-border"
      )} style={{ backgroundColor: isOpen ? "oklch(0.96 0.04 155)" : "oklch(0.975 0.008 80)" }}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              {isOpen
                ? <CheckCircle className="w-5 h-5" style={{ color: "oklch(0.42 0.11 155)" }} />
                : <XCircle className="w-5 h-5 text-muted-foreground" />
              }
              <span className="font-bold text-lg text-foreground">
                Form is {isOpen ? "OPEN" : "CLOSED"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isOpen
                ? "Visitors can fill out the sign-up form at your event link."
                : "Visitors will see a friendly 'Sign-ups are closed' message."}
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-sm shrink-0",
              isOpen
                ? "text-white hover:opacity-90"
                : "border-2 border-border hover:bg-muted text-foreground"
            )}
            style={isOpen ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
            {isOpen
              ? <><ToggleRight className="w-5 h-5" />Close Form</>
              : <><ToggleLeft className="w-5 h-5" />Open Form</>
            }
          </button>
        </div>
      </div>

      {/* Share link */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <ExternalLink className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
          <h2 className="font-bold text-foreground">Your Sign-Up Link</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-muted/40">
            <span className="text-sm font-mono text-foreground truncate">{signupUrl}</span>
          </div>
          <button onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all shrink-0",
              copied ? "text-white border-transparent" : "border-border hover:bg-muted"
            )}
            style={copied ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
            {copied ? <><CheckCircle className="w-4 h-4" />Copied!</> : <><Copy className="w-4 h-4" />Copy</>}
          </button>
          <a href={signupUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border border-border hover:bg-muted transition-all shrink-0">
            <Eye className="w-4 h-4" />Preview
          </a>
        </div>
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-border/60"
          style={{ backgroundColor: "oklch(0.97 0.02 80)" }}>
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Tip for events:</strong> Generate a QR code from this URL (free at{" "}
            <a href="https://qr.io" target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground">qr.io</a>
            ) and print it on your table sign so parents can scan and sign up instantly.
          </p>
        </div>
      </div>

      {/* Submissions */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
            <h2 className="font-bold text-foreground">Submissions</h2>
            {!isLoading && (
              <span className="ml-1 text-xs text-muted-foreground">
                {pending.length} pending · {converted.length} converted
              </span>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading submissions…</p>
          </div>
        ) : signups.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-foreground">No submissions yet</p>
            <p className="text-xs text-muted-foreground mt-1">Sign-ups will appear here as they come in.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {signups.map((s: any) => {
              const isExpanded = expandedId === s.id;
              const isConverting = convertingId === s.id;
              return (
                <div key={s.id} className={cn("transition-colors", s.converted_to_member && "opacity-60")}>
                  <div
                    className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{s.parent_name}</p>
                        {s.converted_to_member && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)" }}>
                            <CheckCircle className="w-3 h-3" />Converted
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{s.parent_email} · {s.child_name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {LEVEL_LABELS[s.reading_level] ?? s.reading_level ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      {!s.converted_to_member && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConvert(s.id); }}
                          disabled={isConverting}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-60"
                          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
                        >
                          {isConverting
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <UserPlus className="w-3.5 h-3.5" />
                          }
                          Convert
                        </button>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-5 pt-1 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm"
                      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
                      {[
                        { label: "Child", value: s.child_name },
                        { label: "Birthday", value: s.child_birthday ?? "—" },
                        { label: "Reading Level", value: LEVEL_LABELS[s.reading_level] ?? s.reading_level ?? "—" },
                        { label: "Subscription", value: TIER_LABELS[s.subscription_tier] ?? s.subscription_tier ?? "—" },
                        { label: "Address", value: s.street ? `${s.street}, ${s.city} ${s.state} ${s.zip}` : "—" },
                        { label: "How Heard", value: s.how_heard ?? "—" },
                        { label: "Gift", value: s.is_gift ? `Yes — ${s.gift_note ?? "no note"}` : "No" },
                        { label: "Interests", value: (s.interests ?? []).join(", ") || "—" },
                        { label: "Avoid", value: (s.topics_to_avoid ?? []).join(", ") || "—" },
                        { label: "Notes", value: s.additional_notes ?? "—" },
                      ].map(f => (
                        <div key={f.label}>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{f.label}</p>
                          <p className="text-xs font-medium text-foreground mt-0.5 break-words">{f.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
