// BookNest Ops — Donation Log (wired to real Supabase data)
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Heart, Search, RefreshCw, Plus } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const CONDITION_COLORS: Record<string, { bg: string; text: string }> = {
  new:      { bg: "oklch(0.95 0.06 155)", text: "oklch(0.30 0.14 155)" },
  like_new: { bg: "oklch(0.95 0.06 155)", text: "oklch(0.35 0.12 155)" },
  good:     { bg: "oklch(0.96 0.06 75)",  text: "oklch(0.40 0.14 75)"  },
  fair:     { bg: "oklch(0.96 0.06 50)",  text: "oklch(0.40 0.14 50)"  },
  poor:     { bg: "oklch(0.96 0.06 25)",  text: "oklch(0.40 0.14 25)"  },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:  { bg: "oklch(0.95 0.06 220)", text: "oklch(0.30 0.14 220)" },
  processed: { bg: "oklch(0.95 0.06 155)", text: "oklch(0.30 0.12 155)" },
  rejected:  { bg: "oklch(0.96 0.06 25)",  text: "oklch(0.40 0.14 25)"  },
};

export default function DonationLogPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, refetch } = trpc.donations.list.useQuery();
  const donations = data?.data ?? [];

  const filtered = donations.filter((d: any) => {
    const matchSearch =
      !search ||
      d.title?.toLowerCase().includes(search.toLowerCase()) ||
      d.author?.toLowerCase().includes(search.toLowerCase()) ||
      d.donor_name?.toLowerCase().includes(search.toLowerCase()) ||
      d.isbn?.includes(search);
    const matchStatus = statusFilter === "all" || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalReceived  = donations.filter((d: any) => d.status !== "rejected").length;
  const totalRejected  = donations.filter((d: any) => d.status === "rejected").length;
  const totalProcessed = donations.filter((d: any) => d.status === "processed").length;
  const uniqueDonors   = new Set(donations.map((d: any) => d.donor_email).filter(Boolean)).size;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Donation Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data?.total ?? 0} total donations recorded</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          <Link href="/donations/intake">
            <button
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
            >
              <Plus className="w-4 h-4" />
              Log Donation
            </button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Received",  value: totalReceived,  color: "oklch(0.42 0.11 155)" },
          { label: "Processed", value: totalProcessed, color: "oklch(0.52 0.14 220)" },
          { label: "Rejected",  value: totalRejected,  color: "oklch(0.55 0.22 25)"  },
          { label: "Donors",    value: uniqueDonors,   color: "oklch(0.55 0.14 75)"  },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, donor, or ISBN…"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex gap-1.5">
          {["all", "received", "processed", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-2 rounded-lg text-xs font-medium capitalize border transition-colors",
                statusFilter === s
                  ? "text-white border-transparent"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
              style={statusFilter === s ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading donations…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Heart className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No donations found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              {search || statusFilter !== "all" ? "Try adjusting your filters" : "Log your first donation to get started"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Date","Title","Author","Condition","Donor","Age Group","Bin","Status"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d: any) => {
                  const condColor = CONDITION_COLORS[d.condition] ?? CONDITION_COLORS.good;
                  const statColor = STATUS_COLORS[d.status] ?? STATUS_COLORS.received;
                  return (
                    <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                        {d.created_at ? new Date(d.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground max-w-[200px] truncate">{d.title}</td>
                      <td className="px-4 py-3 text-muted-foreground">{d.author}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{ backgroundColor: condColor.bg, color: condColor.text }}>
                          {d.condition?.replace("_", " ") ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{d.donor_name ?? "Anonymous"}</td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">{d.age_group?.replace("_", " ") ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.bin_id ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                          style={{ backgroundColor: statColor.bg, color: statColor.text }}>
                          {d.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
