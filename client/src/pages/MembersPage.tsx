// BookNest Ops — Members Page (wired to real Supabase data)
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Users, Search, UserCheck, ChevronDown, RefreshCw, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_LABELS: Record<string, string> = {
  little_nest: "Little Nest",
  cozy_nest: "Cozy Nest",
  story_nest: "Story Nest",
};

const AGE_LABELS: Record<string, string> = {
  hatchlings: "🐣 Hatchlings",
  fledglings: "🐥 Fledglings",
  soarers: "🦅 Soarers",
  sky_readers: "🌟 Sky Readers",
  "sky readers": "🌟 Sky Readers",
};

export default function MembersPage() {
  const [filter, setFilter] = useState<"all" | "active" | "waitlist" | "paused">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = trpc.members.list.useQuery(undefined, {
    refetchInterval: 120_000,
  });

  const members = data?.data ?? [];

  const filtered = members.filter((m) => {
    const matchesFilter = filter === "all" || m.subscription_status === filter;
    const matchesSearch =
      !search ||
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const activeCount = members.filter((m) => m.subscription_status === "active").length;
  const waitlistCount = members.filter((m) => m.subscription_status === "waitlist").length;
  const pausedCount = members.filter((m) => m.subscription_status === "paused").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "Loading..." : `${data?.total ?? 0} total members`}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", (isLoading || isRefetching) && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="section-label">Active</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{activeCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">current subscribers</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="section-label">Waitlist</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{waitlistCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">waiting to join</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="section-label">Paused</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{pausedCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">temporarily paused</p>
        </div>
      </div>

      {/* Filter + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden bg-card">
          {(["all", "active", "waitlist", "paused"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize transition-colors",
                filter === f ? "text-white" : "text-muted-foreground hover:text-foreground"
              )}
              style={filter === f ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
            >
              {f === "all"
                ? `All (${members.length})`
                : f === "active"
                ? `Active (${activeCount})`
                : f === "waitlist"
                ? `Waitlist (${waitlistCount})`
                : `Paused (${pausedCount})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading members...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No members match your search.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {/* Table Header */}
            <div className="grid grid-cols-12 px-5 py-3 bg-muted/30">
              <span className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Member</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tier</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Age Group</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
              <span className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Next Ship</span>
              <span className="col-span-1"></span>
            </div>

            {filtered.map((member) => {
              const isExpanded = expanded === member.id;
              const tierLabel = TIER_LABELS[member.tier?.toLowerCase() ?? ""] ?? member.tier;

              return (
                <div key={member.id}>
                  <div
                    className="grid grid-cols-12 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : member.id)}
                  >
                    {/* Name + Email */}
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>

                    {/* Tier */}
                    <div className="col-span-2">
                      {tierLabel ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                          style={{ backgroundColor: "oklch(0.95 0.03 155)", color: "oklch(0.35 0.10 155)", borderColor: "oklch(0.85 0.06 155)" }}>
                          {tierLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Age Group */}
                    <div className="col-span-2">
                      <span className="text-xs text-foreground">
                        {AGE_LABELS[member.age_group?.toLowerCase() ?? ""] ?? member.age_group ?? "—"}
                      </span>
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <span className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
                        member.subscription_status === "active" && "bg-green-50 text-green-700 border-green-200",
                        member.subscription_status === "waitlist" && "bg-amber-50 text-amber-700 border-amber-200",
                        member.subscription_status === "paused" && "bg-blue-50 text-blue-700 border-blue-200",
                        member.subscription_status === "cancelled" && "bg-red-50 text-red-700 border-red-200",
                        !["active","waitlist","paused","cancelled"].includes(member.subscription_status ?? "") && "bg-muted text-muted-foreground border-border",
                      )}>
                        {member.subscription_status
                          ? member.subscription_status.charAt(0).toUpperCase() + member.subscription_status.slice(1)
                          : "Unknown"}
                      </span>
                    </div>

                    {/* Next Ship */}
                    <div className="col-span-2">
                      <span className="text-xs text-foreground">
                        {member.next_ship_date
                          ? new Date(member.next_ship_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                          : "—"}
                      </span>
                    </div>

                    {/* Expand */}
                    <div className="col-span-1 flex justify-end">
                      <ChevronDown className={cn(
                        "w-4 h-4 text-muted-foreground transition-transform",
                        isExpanded && "rotate-180"
                      )} />
                    </div>
                  </div>

                  {/* Expanded Row */}
                  {isExpanded && (
                    <div className="px-5 pb-4 bg-muted/10 border-t border-border/50">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Phone</p>
                          <p className="text-sm text-foreground">{member.phone || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Founding Flock</p>
                          <p className="text-sm text-foreground">{member.is_founding_flock ? "✅ Yes" : "No"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">VIP</p>
                          <p className="text-sm text-foreground">{member.is_vip ? "⭐ Yes" : "No"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Welcome Form</p>
                          <p className="text-sm text-foreground">{member.welcome_form_completed ? "✅ Completed" : "⏳ Pending"}</p>
                        </div>
                        {member.topics_to_avoid && member.topics_to_avoid.length > 0 && (
                          <div className="col-span-2 md:col-span-4">
                            <p className="text-xs text-muted-foreground mb-1">Topics to Avoid</p>
                            <div className="flex flex-wrap gap-1.5">
                              {member.topics_to_avoid.map((t) => (
                                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                                  {t}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Member Since</p>
                          <p className="text-sm text-foreground">
                            {new Date(member.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                      {member.subscription_status === "waitlist" && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.info("To activate this member, update their status in Supabase or your Shopify admin.");
                            }}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
                            style={{ borderColor: "oklch(0.42 0.11 155)", color: "oklch(0.42 0.11 155)" }}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Activate Member
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {filtered.length} of {members.length} members
        </p>
      )}
    </div>
  );
}
