// BookNest Ops — Member Profile Page
import { Link, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Mail, Phone, MapPin, Star, Package, Truck,
  BookOpen, CheckCircle2, Clock, AlertTriangle, RefreshCw,
  ExternalLink, BookmarkCheck, Sparkles, ChevronRight, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TIER_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  "Little Nest": { bg: "oklch(0.95 0.03 155)", text: "oklch(0.35 0.10 155)", border: "oklch(0.85 0.06 155)" },
  "Cozy Nest":   { bg: "oklch(0.95 0.03 155)", text: "oklch(0.35 0.10 155)", border: "oklch(0.85 0.06 155)" },
  "Story Nest":  { bg: "oklch(0.95 0.03 155)", text: "oklch(0.35 0.10 155)", border: "oklch(0.85 0.06 155)" },
};

const STATUS_STYLES: Record<string, string> = {
  picking:  "bg-blue-50 text-blue-700 border-blue-200",
  packing:  "bg-amber-50 text-amber-700 border-amber-200",
  packed:   "bg-purple-50 text-purple-700 border-purple-200",
  shipped:  "bg-green-50 text-green-700 border-green-200",
  swap_requested: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const utils = trpc.useUtils();
  const { data: member, isLoading, refetch, isRefetching } = trpc.members.byId.useQuery(
    { id: id! },
    { enabled: !!id }
  );
  const requestBundle = trpc.members.requestBundle.useMutation({
    onSuccess: result => {
      if (result.created) {
        toast.success(`New order ${result.order_number} added to Picking`);
      } else {
        toast.info("This member already has an active order.");
      }
      refetch();
      utils.picking.dailyOrders.invalidate();
      utils.shipments.listAll.invalidate();
    },
    onError: (err: any) => toast.error(`Could not request bundle: ${err.message}`),
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/members">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Members
            </button>
          </Link>
        </div>
        <div className="space-y-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-muted rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-center py-16">
        <p className="text-muted-foreground">Member not found.</p>
        <Link href="/members">
          <button className="mt-4 text-sm text-primary underline">Back to Members</button>
        </Link>
      </div>
    );
  }

  const tierStyle = TIER_STYLES[member.tier ?? ""] ?? TIER_STYLES["Little Nest"];
  const shipments = (member as any).shipments ?? [];
  const keptBooks = (member as any).keptBooks ?? [];
  const creditsAvailable = (member as any).creditsAvailable ?? 0;
  const nextCreditAt = (member as any).nextCreditAt;
  const address = member.address;

  const shippedCount = shipments.filter((s: any) => s.status === "shipped").length;
  const activeShipment = shipments.find((s: any) => ["picking", "packing", "packed"].includes(s.status));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back + Refresh */}
      <div className="flex items-center justify-between">
        <Link href="/members">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Members
          </button>
        </Link>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isRefetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Header Card */}
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              {member.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{member.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Mail className="w-3.5 h-3.5" />{member.email}
                </span>
                {member.phone && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" />{member.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => requestBundle.mutate({ member_id: member.id })}
              disabled={requestBundle.isPending || !!activeShipment}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}
              title={activeShipment ? "Active order already exists" : "Request a new bundle"}
            >
              {requestBundle.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Package className="w-3.5 h-3.5" />
              )}
              Request New Bundle
            </button>
            {member.tier && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border"
                style={{ backgroundColor: tierStyle.bg, color: tierStyle.text, borderColor: tierStyle.border }}>
                {member.tier}
              </span>
            )}
            <span className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border capitalize",
              member.subscription_status === "active" && "bg-green-50 text-green-700 border-green-200",
              member.subscription_status === "waitlist" && "bg-amber-50 text-amber-700 border-amber-200",
              member.subscription_status === "paused" && "bg-blue-50 text-blue-700 border-blue-200",
              member.subscription_status === "cancelled" && "bg-red-50 text-red-700 border-red-200",
            )}>
              {member.subscription_status ?? "Unknown"}
            </span>
            {member.is_founding_flock && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                <Star className="w-3 h-3" /> Founding Flock
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-muted-foreground" />
            <span className="section-label">Total Shipments</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{shippedCount}</p>
          <p className="text-xs text-muted-foreground">shipped</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <BookmarkCheck className="w-4 h-4 text-muted-foreground" />
            <span className="section-label">Books Kept</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{keptBooks.length}</p>
          <p className="text-xs text-muted-foreground">total kept</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-muted-foreground" />
            <span className="section-label">Keep Credits</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{creditsAvailable}</p>
          <p className="text-xs text-muted-foreground">
            {nextCreditAt
              ? `renews ${new Date(nextCreditAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : "available"}
          </p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            <span className="section-label">Welcome Form</span>
          </div>
          <p className="text-sm font-semibold mt-1">
            {member.welcome_form_completed
              ? <span className="text-green-600">Completed</span>
              : <span className="text-amber-600">Pending</span>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-6">
          {/* Address */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" /> Shipping Address
            </h2>
            {address ? (
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p>{address.street}{address.street2 ? `, ${address.street2}` : ""}</p>
                <p>{address.city}, {address.state} {address.zip}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No address on file</p>
            )}
          </div>

          {/* Active shipment */}
          {activeShipment && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-muted-foreground" /> Active Order
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">
                    {activeShipment.order_number ?? activeShipment.shipment_number ?? "—"}
                  </span>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border capitalize", STATUS_STYLES[activeShipment.status] ?? "bg-muted text-muted-foreground border-border")}>
                    {activeShipment.status}
                  </span>
                </div>
                <Link href={`/ship/${activeShipment.id}`}>
                  <button className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors flex items-center justify-center gap-1.5 mt-2">
                    View Order <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </Link>
              </div>
            </div>
          )}

          {/* Kept Books */}
          {keptBooks.length > 0 && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h2 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-muted-foreground" /> Books Kept
              </h2>
              <div className="space-y-2">
                {keptBooks.map((book: any) => (
                  <div key={book.id} className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {book.book_title?.title ?? "Unknown"}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {book.book_title?.author ?? ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column — Shipment History */}
        <div className="lg:col-span-2">
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-sm text-foreground">Shipment History</h2>
            </div>
            {shipments.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No shipments yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {shipments.map((s: any) => {
                  const shipDate = s.actual_ship_date ?? s.scheduled_ship_date;
                  return (
                    <div key={s.id} className="px-5 py-3.5 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-medium text-foreground">
                            {s.order_number ?? s.shipment_number ?? s.id.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize", STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground border-border")}>
                            {s.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {shipDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(shipDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                          {s.tracking_number && (
                            <a
                              href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${s.tracking_number}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary flex items-center gap-1 hover:underline"
                            >
                              Track <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      <Link href={`/ship/${s.id}`}>
                        <button className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors shrink-0">
                          View
                        </button>
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
