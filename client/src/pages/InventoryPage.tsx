// BookNest Ops — Inventory Snapshot
import { useState } from "react";
import { Link } from "wouter";
import { Archive, AlertTriangle, AlertCircle, BookOpen, TrendingDown } from "lucide-react";
import { bins, dashboardStats } from "@/lib/data";
import { cn } from "@/lib/utils";

const ageGroups = ["Hatchlings (0-2)", "Fledglings (3-5)", "Soarers (6-8)", "Sky Readers (9-12)"];
const ageShort = { "Hatchlings (0-2)": "Hatchlings", "Fledglings (3-5)": "Fledglings", "Soarers (6-8)": "Soarers", "Sky Readers (9-12)": "Sky Readers" };
const topics = Array.from(new Set(bins.map(b => b.topic))).sort();

function getBinColor(count: number): string {
  if (count === 0) return "oklch(0.95 0.06 25)";
  if (count <= 5) return "oklch(0.97 0.05 25)";
  if (count <= 10) return "oklch(0.96 0.06 75)";
  if (count <= 20) return "oklch(0.97 0.04 155)";
  return "oklch(0.92 0.06 155)";
}
function getBinTextColor(count: number): string {
  if (count === 0) return "oklch(0.50 0.20 25)";
  if (count <= 5) return "oklch(0.50 0.20 25)";
  if (count <= 10) return "oklch(0.50 0.14 75)";
  return "oklch(0.32 0.10 155)";
}
function getBinLabel(count: number): string {
  if (count === 0) return "EMPTY";
  if (count <= 5) return "CRITICAL";
  if (count <= 10) return "LOW";
  return "";
}

const criticalBins = bins.filter(b => b.count <= 5).sort((a, b) => a.count - b.count);
const totalBooks = bins.reduce((sum, b) => sum + b.count, 0);

export default function InventoryPage() {
  const [showAll, setShowAll] = useState(false);
  const displayTopics = showAll ? topics : topics.slice(0, 6);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Inventory Snapshot</h1>
          <p className="page-subtitle">{totalBooks} books across {bins.length} bins</p>
        </div>
        <Link href="/receive">
          <button className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
            style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
            <BookOpen className="w-4 h-4" />
            Receive Books
          </button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {ageGroups.map(ag => {
          const agBins = bins.filter(b => b.ageGroup === ag);
          const total = agBins.reduce((s, b) => s + b.count, 0);
          const low = agBins.filter(b => b.count <= 10 && b.count > 0).length;
          const empty = agBins.filter(b => b.count === 0).length;
          return (
            <div key={ag} className="stat-card">
              <span className="section-label">{ageShort[ag as keyof typeof ageShort]}</span>
              <p className="text-2xl font-bold text-foreground mt-1">{total}</p>
              <p className="text-xs text-muted-foreground">
                {low > 0 && <span style={{ color: "oklch(0.55 0.14 75)" }} className="font-medium">{low} low</span>}
                {low > 0 && empty > 0 && " · "}
                {empty > 0 && <span style={{ color: "oklch(0.55 0.22 25)" }} className="font-medium">{empty} empty</span>}
                {low === 0 && empty === 0 && <span style={{ color: "oklch(0.42 0.11 155)" }}>All stocked</span>}
              </p>
            </div>
          );
        })}
      </div>

      {/* Needs Attention */}
      {criticalBins.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <TrendingDown className="w-4 h-4" style={{ color: "oklch(0.55 0.22 25)" }} />
            <h2 className="font-semibold text-sm text-foreground">Needs Restocking</h2>
            <span className="ml-auto text-xs text-muted-foreground">{criticalBins.length} bins</span>
          </div>
          <div className="divide-y divide-border/50">
            {criticalBins.map(bin => (
              <div key={bin.bin} className="px-5 py-3 flex items-center gap-4">
                <div className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  bin.count === 0 ? "bg-red-500" : "bg-amber-500"
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium font-mono">{bin.bin}</p>
                  <p className="text-xs text-muted-foreground">{bin.ageGroup} · {bin.topic}</p>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-sm font-bold",
                    bin.count === 0 ? "text-red-600" : "text-amber-600"
                  )}>{bin.count}</span>
                  <p className="text-xs text-muted-foreground">books</p>
                </div>
                <Link href="/receive">
                  <button className="text-xs font-medium px-2.5 py-1 rounded-md transition-colors"
                    style={{ backgroundColor: "oklch(0.92 0.04 155)", color: "oklch(0.32 0.10 155)" }}>
                    Restock
                  </button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap Grid */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-sm text-foreground">Books by Age × Topic</h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: "oklch(0.92 0.06 155)" }} />Stocked (&gt;20)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: "oklch(0.96 0.06 75)" }} />Low (≤10)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ backgroundColor: "oklch(0.95 0.06 25)" }} />Critical (≤5)</span>
          </div>
        </div>
        <div className="overflow-x-auto p-5">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-muted-foreground font-medium pb-2 pr-3 w-24">Topic</th>
                {ageGroups.map(ag => (
                  <th key={ag} className="text-center text-muted-foreground font-medium pb-2 px-1 w-28">
                    {ageShort[ag as keyof typeof ageShort]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTopics.map(topic => (
                <tr key={topic}>
                  <td className="text-muted-foreground font-medium pr-3 py-1 text-xs">{topic}</td>
                  {ageGroups.map(ag => {
                    const bin = bins.find(b => b.ageGroup === ag && b.topic === topic);
                    const count = bin?.count ?? null;
                    return (
                      <td key={ag} className="text-center py-1 px-1">
                        {count !== null ? (
                          <div
                            className="rounded-lg py-2 px-1 text-center"
                            style={{ backgroundColor: getBinColor(count), color: getBinTextColor(count) }}
                          >
                            <p className="font-bold text-sm">{count}</p>
                            {getBinLabel(count) && (
                              <p className="text-[9px] font-semibold uppercase tracking-wider mt-0.5 opacity-80">
                                {getBinLabel(count)}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg py-2 px-1 bg-muted/30">
                            <p className="text-muted-foreground/30">—</p>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!showAll && topics.length > 6 && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-3 text-xs font-medium"
              style={{ color: "oklch(0.42 0.11 155)" }}
            >
              Show all {topics.length} topics →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
