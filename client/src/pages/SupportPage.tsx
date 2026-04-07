import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PackageX,
  XCircle,
} from "lucide-react";
import { useState } from "react";

const STATUS_TABS = ["pending", "resolved", "dismissed"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const REPORT_TABS = ["damage", "missing"] as const;
type ReportTab = (typeof REPORT_TABS)[number];

const damageLabels: Record<string, string> = {
  torn_pages: "Torn pages",
  cover: "Cover damage",
  writing_marks: "Writing/marks",
  water: "Water damage",
  missing_pages: "Missing pages",
  other: "Other",
};

const missingReasonLabels: Record<string, string> = {
  marked_delivered_not_received: "Marked delivered, not received",
  tracking_not_updated: "Tracking not updated",
  return_to_sender: "Returned to sender",
  lost_in_transit: "Lost in transit",
  other_not_sure: "Other / Not sure",
};

export default function SupportPage() {
  const [statusTab, setStatusTab] = useState<StatusTab>("pending");
  const [reportTab, setReportTab] = useState<ReportTab>("damage");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState<
    Record<string, string>
  >({});

  const {
    data: damageReports = [],
    isLoading: damageLoading,
    refetch: refetchDamage,
  } = trpc.support.list.useQuery(
    { status: statusTab },
    { refetchOnWindowFocus: false }
  );

  const {
    data: missingReports = [],
    isLoading: missingLoading,
    refetch: refetchMissing,
  } = trpc.support.listMissing.useQuery(
    { status: statusTab },
    { refetchOnWindowFocus: false }
  );

  const resolve = trpc.support.resolve.useMutation({
    onSuccess: () => refetchDamage(),
  });
  const dismiss = trpc.support.dismiss.useMutation({
    onSuccess: () => refetchDamage(),
  });
  const resolveMissing = trpc.support.resolveMissing.useMutation({
    onSuccess: () => refetchMissing(),
  });
  const dismissMissing = trpc.support.dismissMissing.useMutation({
    onSuccess: () => refetchMissing(),
  });

  const isLoading = reportTab === "damage" ? damageLoading : missingLoading;
  const reports = reportTab === "damage" ? damageReports : missingReports;

  const getDamageTypes = (report: any) =>
    Object.keys(damageLabels).filter(key => report[key] === true);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">
          Support Queue
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Member-submitted reports
        </p>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => {
            setReportTab("damage");
            setExpandedId(null);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
            reportTab === "damage"
              ? "bg-red-50 text-red-600 border-red-200"
              : "bg-card text-muted-foreground border-border hover:text-foreground"
          )}
        >
          <AlertCircle className="w-4 h-4" />
          Damaged Books
          {damageReports.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-600">
              {damageReports.length}
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setReportTab("missing");
            setExpandedId(null);
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
            reportTab === "missing"
              ? "bg-amber-50 text-amber-600 border-amber-200"
              : "bg-card text-muted-foreground border-border hover:text-foreground"
          )}
        >
          <PackageX className="w-4 h-4" />
          Missing Bundles
          {missingReports.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-600">
              {missingReports.length}
            </span>
          )}
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-2 border-b border-border">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => {
              setStatusTab(tab);
              setExpandedId(null);
            }}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              statusTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Report List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            No {statusTab}{" "}
            {reportTab === "damage" ? "damage" : "missing bundle"} reports
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report: any) => {
            const isExpanded = expandedId === report.id;
            const isDamage = reportTab === "damage";
            const damages = isDamage ? getDamageTypes(report) : [];
            const photos = isDamage
              ? [report.photo1, report.photo2, report.photo3].filter(Boolean)
              : [];

            return (
              <div
                key={report.id}
                className="bg-card rounded-xl border border-border overflow-hidden"
              >
                {/* Summary Row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                        isDamage ? "bg-red-50" : "bg-amber-50"
                      )}
                    >
                      {isDamage ? (
                        <AlertCircle className="w-4 h-4 text-red-400" />
                      ) : (
                        <PackageX className="w-4 h-4 text-amber-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {report.member_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isDamage
                          ? report.book_title
                          : `Tracking: ${report.tracking_number ?? "N/A"}`}{" "}
                        · {formatDate(report.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {isDamage ? (
                      <div className="flex gap-1 flex-wrap justify-end">
                        {damages.map(d => (
                          <span
                            key={d}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100"
                          >
                            {damageLabels[d]}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
                        {missingReasonLabels[report.problem] ?? report.problem}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-border space-y-4 pt-4">
                    {/* Notes */}
                    {report.notes && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Notes
                        </p>
                        <p className="text-sm text-foreground">
                          {report.notes}
                        </p>
                      </div>
                    )}

                    {/* Missing: carrier info */}
                    {!isDamage && report.carrier && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Carrier
                        </p>
                        <p className="text-sm text-foreground">
                          {report.carrier}
                        </p>
                      </div>
                    )}

                    {/* Photos */}
                    {photos.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Photos
                        </p>
                        <div className="flex gap-3">
                          {photos.map((photo: string, i: number) => (
                            <a
                              key={i}
                              href={photo}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <img
                                src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${photo}`}
                                alt={`Damage photo ${i + 1}`}
                                className="w-24 h-24 object-cover rounded-lg border border-border hover:opacity-80 transition-opacity"
                              />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Resolution Note Input */}
                    {statusTab === "pending" && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Resolution Note{" "}
                          <span className="font-normal normal-case">
                            (optional)
                          </span>
                        </p>
                        <textarea
                          rows={2}
                          placeholder={
                            isDamage
                              ? "e.g. Replacement book added to next bundle"
                              : "e.g. Reshipped on April 10"
                          }
                          value={resolutionNotes[report.id] ?? ""}
                          onChange={e =>
                            setResolutionNotes(prev => ({
                              ...prev,
                              [report.id]: e.target.value,
                            }))
                          }
                          className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                        />
                      </div>
                    )}

                    {/* Resolved note display */}
                    {statusTab !== "pending" && report.resolution_note && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                          Resolution Note
                        </p>
                        <p className="text-sm text-foreground">
                          {report.resolution_note}
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {statusTab === "pending" && (
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() =>
                            isDamage
                              ? resolve.mutate({
                                  id: report.id,
                                  resolution_note: resolutionNotes[report.id],
                                })
                              : resolveMissing.mutate({
                                  id: report.id,
                                  resolution_note: resolutionNotes[report.id],
                                })
                          }
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark Resolved
                        </button>
                        <button
                          onClick={() =>
                            isDamage
                              ? dismiss.mutate({
                                  id: report.id,
                                  resolution_note: resolutionNotes[report.id],
                                })
                              : dismissMissing.mutate({
                                  id: report.id,
                                  resolution_note: resolutionNotes[report.id],
                                })
                          }
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-muted text-muted-foreground border border-border hover:bg-muted/80 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-4 h-4" />
                          Dismiss
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
  );
}
