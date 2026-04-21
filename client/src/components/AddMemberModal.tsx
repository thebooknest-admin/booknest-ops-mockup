// BookNest Ops — Add Member Modal
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { X, UserPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClass = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted-foreground/50";

interface AddMemberModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddMemberModal({ onClose, onSuccess }: AddMemberModalProps) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    tier: "Little Nest",
    age_group: "",
    subscription_status: "active",
    street: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    is_founding_flock: false,
  });

  const createMember = trpc.members.create.useMutation({
    onSuccess: () => {
      toast.success("Member created successfully!");
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message ?? "Failed to create member");
    },
  });

  const set = (field: string, value: string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    createMember.mutate(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl border border-border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Add Member</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Basic Info */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member Info</h3>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Full Name <span className="text-red-500">*</span></label>
                <input type="text" value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="Jane Smith" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Email <span className="text-red-500">*</span></label>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
                  placeholder="jane@example.com" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)}
                  placeholder="(304) 555-0123" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Subscription</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Tier</label>
                <select value={form.tier} onChange={e => set("tier", e.target.value)} className={inputClass}>
                  <option>Little Nest</option>
                  <option>Cozy Nest</option>
                  <option>Story Nest</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Status</label>
                <select value={form.subscription_status} onChange={e => set("subscription_status", e.target.value)} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="waitlist">Waitlist</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Age Group</label>
                <select value={form.age_group} onChange={e => set("age_group", e.target.value)} className={inputClass}>
                  <option value="">Select...</option>
                  <option value="Hatchlings">🐣 Hatchlings (0–2)</option>
                  <option value="Fledglings">🐦 Fledglings (3–5)</option>
                  <option value="Soarers">🦅 Soarers (6–8)</option>
                  <option value="Sky Readers">🌟 Sky Readers (9–12)</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input type="checkbox" id="founding" checked={form.is_founding_flock}
                  onChange={e => set("is_founding_flock", e.target.checked)}
                  className="w-4 h-4 rounded border-border" />
                <label htmlFor="founding" className="text-xs font-medium text-foreground">Founding Flock</label>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipping Address</h3>
            <div className="space-y-3">
              <input type="text" value={form.street} onChange={e => set("street", e.target.value)}
                placeholder="Street address" className={inputClass} />
              <input type="text" value={form.street2} onChange={e => set("street2", e.target.value)}
                placeholder="Apt, suite, unit (optional)" className={inputClass} />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <input type="text" value={form.city} onChange={e => set("city", e.target.value)}
                    placeholder="City" className={inputClass} />
                </div>
                <div>
                  <select value={form.state} onChange={e => set("state", e.target.value)} className={inputClass}>
                    <option value="">State</option>
                    {["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <input type="text" value={form.zip} onChange={e => set("zip", e.target.value)}
                    placeholder="ZIP" maxLength={10} className={inputClass} />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={createMember.isPending}
              className="flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {createMember.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Create Member</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}