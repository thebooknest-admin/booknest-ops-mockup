// BookNest Ops — Admin Sign-Up Form Control Page
// Design: Warm Linen Artisan Light — inside the ops dashboard (has sidebar)
// Lets MamaBird open/close the public sign-up form and see a preview link.

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ToggleLeft, ToggleRight, ExternalLink, Copy, Eye, EyeOff,
  Users, CheckCircle, XCircle, Info, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "booknest_signup_open";

export default function SignupControlPage() {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  const [copied, setCopied] = useState(false);

  // Persist to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  const signupUrl = `${window.location.origin}/signup`;

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

  const handleCopy = () => {
    navigator.clipboard.writeText(signupUrl).then(() => {
      setCopied(true);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div className="page-header">
        <h1 className="page-title">Event Sign-Up Form</h1>
        <p className="page-subtitle">Control your public sign-up form · share the link at events</p>
      </div>

      {/* Status card */}
      <div className={cn(
        "rounded-2xl border-2 p-6 transition-all",
        isOpen
          ? "border-green-300"
          : "border-border"
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

          {/* Big toggle */}
          <button
            onClick={handleToggle}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-sm",
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

      {/* Share link card */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <ExternalLink className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
          <h2 className="font-bold text-foreground">Your Sign-Up Link</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Share this link at events, on social media, or in emails. It works on any device.
        </p>

        {/* URL display */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-border bg-muted/40">
            <span className="text-sm font-mono text-foreground truncate">{signupUrl}</span>
          </div>
          <button onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all shrink-0",
              copied
                ? "text-white border-transparent"
                : "border-border hover:bg-muted"
            )}
            style={copied ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
            {copied ? <><CheckCircle className="w-4 h-4" />Copied!</> : <><Copy className="w-4 h-4" />Copy</>}
          </button>
          <a href={signupUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold border border-border hover:bg-muted transition-all shrink-0">
            <Eye className="w-4 h-4" />Preview
          </a>
        </div>

        {/* QR hint */}
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

      {/* What the form collects */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4" style={{ color: "oklch(0.42 0.11 155)" }} />
          <h2 className="font-bold text-foreground">What the Form Collects</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: "👤", label: "Parent / Guardian Name", note: "Required" },
            { icon: "✉️", label: "Parent Email", note: "Required · for updates" },
            { icon: "📦", label: "Full Shipping Address", note: "Required · for delivery" },
            { icon: "🧒", label: "Child's First Name", note: "Required" },
            { icon: "🎂", label: "Child's Birthday", note: "Required · for birthday surprises" },
            { icon: "📖", label: "Reading Level / Nest Tier", note: "Required · Hatchlings → Sky Readers" },
            { icon: "⭐", label: "Interests & Topics", note: "Required · from your 8 bin categories" },
            { icon: "🚫", label: "Topics to Avoid", note: "Optional · with custom add" },
            { icon: "📚", label: "Subscription Preference", note: "Optional · 1–3 books/month" },
            { icon: "🎁", label: "Gift flag + note", note: "Optional · for gifted subscriptions" },
            { icon: "💬", label: "How they heard about you", note: "Optional · for your marketing insight" },
            { icon: "📝", label: "Additional notes", note: "Optional · free text for anything else" },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-2.5 p-3 rounded-lg"
              style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
              <span className="text-base shrink-0">{item.icon}</span>
              <div>
                <p className="text-xs font-semibold text-foreground">{item.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{item.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview of closed state */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <EyeOff className="w-4 h-4 text-muted-foreground" />
          <h2 className="font-bold text-foreground">When the Form is Closed</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Visitors will see a friendly branded page letting them know sign-ups are currently closed,
          with your social handle and a warm message. No data can be submitted.
        </p>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium"
            style={{ backgroundColor: "oklch(0.97 0.005 80)" }}>
            Preview — Closed State
          </div>
          <div className="p-6 text-center space-y-3" style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
              style={{ backgroundColor: "oklch(0.96 0.04 80)" }}>
              <span className="text-xl">❤️</span>
            </div>
            <p className="font-bold text-foreground">Sign-ups are closed right now</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              We're not currently accepting new sign-ups at this event, but we'd love to connect with you!
            </p>
            <p className="text-xs font-medium" style={{ color: "oklch(0.42 0.11 155)" }}>@BookNest</p>
          </div>
        </div>
      </div>

      {/* Future features hint */}
      <div className="rounded-xl border border-dashed border-border p-5 space-y-2"
        style={{ backgroundColor: "oklch(0.975 0.008 80)" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: "oklch(0.55 0.14 75)" }} />
          <p className="text-sm font-semibold text-foreground">Coming next</p>
        </div>
        <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
          <li>View all sign-up submissions in a table here</li>
          <li>One-click convert a sign-up to a new Member</li>
          <li>Export sign-ups to CSV for your records</li>
          <li>Set an auto-close date/time for the form</li>
        </ul>
      </div>
    </div>
  );
}
