// BookNest Ops — AppLayout with Sidebar Navigation
// Design: Warm Linen Artisan Light — dark forest sidebar, warm linen main content
// Sign-Up Overlay: clicking "Event Sign-Up" in the sidebar opens a full-screen overlay
// that hides the entire ops dashboard. Close button (top-right) dismisses it.

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Package, Truck, Tag, Archive, BookOpen,
  RotateCcw, Users, Gift, BookMarked, Bell, ChevronDown,
  ChevronRight, Menu, X, CalendarCheck, ExternalLink,
  ToggleLeft, ToggleRight
} from "lucide-react";
import { notifications } from "@/lib/data";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import SignupPage from "@/pages/SignupPage";

// ─── Nav structure (Event Sign-Up is NOT a route — it's an overlay trigger) ──

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  overlay?: boolean; // if true, clicking opens the overlay instead of navigating
  children?: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Orders",
    icon: Package,
    children: [
      { label: "Picking Queue", href: "/picking", icon: Package },
      { label: "Shipping Queue", href: "/shipping", icon: Truck },
      { label: "Label Queue", href: "/labels", icon: Tag },
    ],
  },
  {
    label: "Inventory",
    icon: Archive,
    children: [
      { label: "Snapshot", href: "/inventory", icon: Archive },
      { label: "Receive Books", href: "/receive", icon: BookOpen },
      { label: "Process Returns", href: "/returns", icon: RotateCcw },
    ],
  },
  {
    label: "Donations",
    icon: Gift,
    children: [
      { label: "Intake", href: "/donations/intake", icon: Gift },
      { label: "Donation Log", href: "/donations/log", icon: BookMarked },
    ],
  },
  { label: "Members", href: "/members", icon: Users },
  // This triggers the overlay — no href
  { label: "Event Sign-Up", overlay: true, icon: CalendarCheck },
];

// ─── Notification Panel ───────────────────────────────────────────────────────

function NotificationPanel() {
  const unread = notifications.filter(n => !n.read);
  const [, navigate] = useLocation();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
          <Bell className="w-5 h-5 text-sidebar-foreground/70" />
          {unread.length > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 shadow-xl" align="end" side="right">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notifications</h3>
            {unread.length > 0 && (
              <span className="text-xs text-muted-foreground">{unread.length} unread</span>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => n.link && navigate(n.link)}
              className={cn(
                "p-4 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                !n.read && "bg-accent/30"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-2 h-2 rounded-full mt-1.5 shrink-0",
                  n.type === "urgent" && "bg-red-500",
                  n.type === "warning" && "bg-amber-500",
                  n.type === "info" && "bg-blue-500",
                  n.type === "success" && "bg-green-500",
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.message}</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{n.time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Sidebar Nav Item ─────────────────────────────────────────────────────────

function SidebarNavItem({
  item,
  collapsed,
  onOverlayOpen,
}: {
  item: NavItem;
  collapsed: boolean;
  onOverlayOpen: () => void;
}) {
  const [location] = useLocation();
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => location === c.href || location.startsWith(c.href));
  });

  const isActive = item.href
    ? location === item.href || (item.href === "/dashboard" && location === "/")
    : item.children?.some(c => location === c.href || location.startsWith(c.href));

  // Overlay trigger button (Event Sign-Up)
  if (item.overlay) {
    return (
      <button
        onClick={onOverlayOpen}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
          "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="w-4 h-4 shrink-0 text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80" />
        {!collapsed && (
          <>
            <span className="text-sm truncate flex-1 text-left">{item.label}</span>
            {/* Small "open in overlay" indicator */}
            <span className="w-4 h-4 rounded flex items-center justify-center opacity-40 group-hover:opacity-70"
              style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              <ExternalLink className="w-2.5 h-2.5 text-white" />
            </span>
          </>
        )}
      </button>
    );
  }

  // Regular link
  if (item.href) {
    return (
      <Link href={item.href}>
        <div className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all group",
          isActive
            ? "bg-sidebar-accent text-white font-medium"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}>
          <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-white" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
          {!collapsed && <span className="text-sm truncate">{item.label}</span>}
          {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60" />}
        </div>
      </Link>
    );
  }

  // Expandable group
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
          isActive
            ? "text-white"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
        )}
      >
        <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-white" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
        {!collapsed && (
          <>
            <span className="text-sm truncate flex-1 text-left">{item.label}</span>
            {open ? <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/40" /> : <ChevronRight className="w-3.5 h-3.5 text-sidebar-foreground/40" />}
          </>
        )}
      </button>
      {open && !collapsed && item.children && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border/50 pl-3">
          {item.children.map(child => {
            const childActive = location === child.href || location.startsWith(child.href);
            return (
              <Link key={child.href} href={child.href}>
                <div className={cn(
                  "flex items-center gap-2.5 px-2 py-2 rounded-md cursor-pointer transition-all text-sm",
                  childActive
                    ? "text-white font-medium bg-sidebar-accent"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                )}>
                  <child.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{child.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Sign-Up Overlay ──────────────────────────────────────────────────────────

const STORAGE_KEY = "booknest_signup_open";

function SignupOverlay({ onClose }: { onClose: () => void }) {
  const [formOpen, setFormOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  // Persist toggle
  const handleToggle = () => {
    const next = !formOpen;
    setFormOpen(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while overlay is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "oklch(0.975 0.008 80)" }}
    >
      {/* Overlay top bar — admin controls, invisible to the public */}
      <div
        className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-border/60 shadow-sm"
        style={{ backgroundColor: "oklch(0.20 0.025 155)" }}
      >
        <div className="flex items-center gap-3">
          {/* Form open/close toggle */}
          <button
            onClick={handleToggle}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all",
              formOpen
                ? "text-white"
                : "border border-sidebar-border/50 text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
            )}
            style={formOpen ? { backgroundColor: "oklch(0.42 0.11 155)" } : {}}
          >
            {formOpen
              ? <><ToggleRight className="w-4 h-4" />Form Open</>
              : <><ToggleLeft className="w-4 h-4" />Form Closed</>
            }
          </button>
          <span className="text-sidebar-foreground/40 text-xs hidden sm:block">
            Toggle to open or close the sign-up form for visitors
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Copy link button */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/signup`);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-sidebar-border/50 text-sidebar-foreground/70 hover:bg-sidebar-accent/60 transition-all"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Copy Public Link</span>
          </button>

          {/* Close overlay */}
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all hover:opacity-80"
            style={{ backgroundColor: "oklch(0.55 0.18 25)" }}
          >
            <X className="w-4 h-4" />
            <span>Close Preview</span>
          </button>
        </div>
      </div>

      {/* The actual sign-up form — scrollable */}
      <div className="flex-1 overflow-y-auto">
        <SignupPage />
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [signupOverlayOpen, setSignupOverlayOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <aside
          className={cn(
            "flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
            collapsed ? "w-16" : "w-60"
          )}
          style={{ backgroundColor: "oklch(0.20 0.025 155)" }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border/30">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "oklch(0.42 0.11 155)" }}>
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-bold text-white leading-tight">BookNest</p>
                <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "oklch(0.62 0.10 155)" }}>Operations</p>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
            {navItems.map(item => (
              <SidebarNavItem
                key={item.label}
                item={item}
                collapsed={collapsed}
                onOverlayOpen={() => setSignupOverlayOpen(true)}
              />
            ))}
          </nav>

          {/* Bottom */}
          <div className="px-3 py-4 border-t border-sidebar-border/30 space-y-1">
            <NotificationPanel />
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              {!collapsed && <span className="text-xs">Collapse</span>}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Full-screen sign-up overlay — rendered outside the layout so it covers everything */}
      {signupOverlayOpen && (
        <SignupOverlay onClose={() => setSignupOverlayOpen(false)} />
      )}
    </>
  );
}
