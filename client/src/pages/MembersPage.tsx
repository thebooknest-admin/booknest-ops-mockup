// BookNest Ops — Members
import { useState } from "react";
import { toast } from "sonner";
import { Users, Search, UserCheck, Edit2, Trash2 } from "lucide-react";
import { members } from "@/lib/data";
import { cn } from "@/lib/utils";

export default function MembersPage() {
  const [filter, setFilter] = useState<"all" | "active" | "waitlist">("all");
  const [search, setSearch] = useState("");

  const filtered = members.filter(m => {
    const matchesFilter = filter === "all" || m.status === filter;
    const matchesSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const activeCount = members.filter(m => m.status === "active").length;
  const waitlistCount = members.filter(m => m.status === "waitlist").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Members</h1>
          <p className="page-subtitle">{activeCount} active · {waitlistCount} on waitlist</p>
        </div>
        <button
          onClick={() => toast.info("Add member — connect to live system")}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
        >
          <Users className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {/* Filter + Search */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border border-border overflow-hidden bg-card">
          {(["all", "active", "waitlist"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize transition-colors",
                filter === f ? "text-white" : "text-muted-foreground hover:text-foreground"
              )}
              style={filter === f ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
            >
              {f === "all" ? `All (${members.length})` : f === "active" ? `Active (${activeCount})` : `Waitlist (${waitlistCount})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Tier</th>
              <th>Age Group</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(member => (
              <tr key={member.id}>
                <td className="font-medium">{member.name}</td>
                <td className="text-muted-foreground text-xs">{member.email}</td>
                <td>
                  <span className={member.status === "active" ? "badge-active" : "badge-waitlist"}>
                    {member.status === "active" ? "Active" : "Waitlist"}
                  </span>
                </td>
                <td>
                  {member.tier
                    ? <span className="badge-tier">{member.tier}</span>
                    : <span className="text-muted-foreground text-xs">—</span>}
                </td>
                <td className="text-sm text-muted-foreground">
                  {member.ageGroup?.split(" (")[0] || "—"}
                </td>
                <td className="text-sm text-muted-foreground">{member.joinedDate}</td>
                <td>
                  <div className="flex items-center gap-2">
                    {member.status === "waitlist" && (
                      <button
                        onClick={() => toast.success(`${member.name} converted to active member!`)}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors"
                        style={{ backgroundColor: "oklch(0.92 0.04 155)", color: "oklch(0.32 0.10 155)" }}
                      >
                        <UserCheck className="w-3 h-3" />
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => toast.info(`Editing ${member.name}`)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toast.error(`Delete ${member.name}? (mockup — no data changed)`)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">No members match your search.</div>
        )}
      </div>
    </div>
  );
}
