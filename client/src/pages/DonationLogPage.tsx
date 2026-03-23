// BookNest Ops — Donation Log
import { useState } from "react";
import { Link } from "wouter";
import { Gift, BookMarked, TrendingUp, Search } from "lucide-react";
import { donations, dashboardStats } from "@/lib/data";
import { cn } from "@/lib/utils";

const conditionColors: Record<string, { bg: string; text: string }> = {
  "New / Like New": { bg: "oklch(0.92 0.06 155)", text: "oklch(0.32 0.10 155)" },
  "Good": { bg: "oklch(0.94 0.04 155)", text: "oklch(0.35 0.10 155)" },
  "Acceptable": { bg: "oklch(0.96 0.06 75)", text: "oklch(0.50 0.14 75)" },
  "Poor": { bg: "oklch(0.95 0.06 25)", text: "oklch(0.50 0.20 25)" },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  "In Inventory": { bg: "oklch(0.92 0.06 155)", text: "oklch(0.32 0.10 155)" },
  "Pending": { bg: "oklch(0.94 0.06 220)", text: "oklch(0.35 0.14 220)" },
  "Rejected": { bg: "oklch(0.95 0.06 25)", text: "oklch(0.50 0.20 25)" },
  "Donated Out": { bg: "oklch(0.96 0.04 75)", text: "oklch(0.50 0.14 75)" },
};

export default function DonationLogPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = donations.filter(d => {
    const matchesSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || (d.donor || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const inInventory = donations.filter(d => d.status === "In Inventory").length;
  const pending = donations.filter(d => d.status === "Pending").length;
  const rejected = donations.filter(d => d.status === "Rejected").length;
  const pctDonated = Math.round((inInventory / dashboardStats.totalInventory) * 100);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Donation Log</h1>
          <p className="page-subtitle">Track all donated books and their status</p>
        </div>
        <Link href="/donations/intake">
          <button className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
            <Gift className="w-4 h-4" />
            Log Donation
          </button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="stat-card">
          <span className="section-label">This Month</span>
          <p className="text-3xl font-bold text-foreground mt-1">{donations.length}</p>
          <p className="text-xs text-muted-foreground">donations received</p>
        </div>
        <div className="stat-card">
          <span className="section-label">In Inventory</span>
          <p className="text-3xl font-bold text-foreground mt-1">{inInventory}</p>
          <p className="text-xs" style={{ color: "oklch(0.42 0.11 155)" }} >{pctDonated}% of total stock</p>
        </div>
        <div className="stat-card">
          <span className="section-label">Pending</span>
          <p className="text-3xl font-bold text-foreground mt-1">{pending}</p>
          <p className="text-xs text-muted-foreground">awaiting processing</p>
        </div>
        <div className="stat-card">
          <span className="section-label">Rejected</span>
          <p className="text-3xl font-bold text-foreground mt-1">{rejected}</p>
          <p className="text-xs text-muted-foreground">poor condition</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden bg-card">
          {["all", "In Inventory", "Pending", "Rejected", "Donated Out"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn("px-3 py-2 text-sm font-medium transition-colors", statusFilter === s ? "text-white" : "text-muted-foreground hover:text-foreground")}
              style={statusFilter === s ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}>
              {s === "all" ? "All" : s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by title or donor..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>
      </div>

      {/* Donations Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Author</th>
              <th>Condition</th>
              <th>Donor</th>
              <th>SKU Assigned</th>
              <th>Age Group</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => (
              <tr key={d.id}>
                <td className="text-xs text-muted-foreground">{d.date}</td>
                <td className="font-medium">{d.title}</td>
                <td className="text-sm text-muted-foreground">{d.author}</td>
                <td>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: conditionColors[d.condition]?.bg, color: conditionColors[d.condition]?.text }}>
                    {d.condition}
                  </span>
                </td>
                <td className="text-sm text-muted-foreground">{d.donor || "Anonymous"}</td>
                <td className="font-mono text-xs text-muted-foreground">{d.skuAssigned || "—"}</td>
                <td className="text-xs text-muted-foreground">{d.ageGroup?.split(" (")[0] || "—"}</td>
                <td>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: statusColors[d.status]?.bg, color: statusColors[d.status]?.text }}>
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No donations match your search.</div>
        )}
      </div>
    </div>
  );
}
