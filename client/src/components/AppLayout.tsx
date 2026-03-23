// BookNest Ops — AppLayout with Sidebar Navigation
// Design: Warm Linen Artisan Light — dark forest sidebar, warm linen main content

import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Package, Truck, Tag, Archive, BookOpen,
  RotateCcw, Users, Gift, BookMarked, Bell, ChevronDown,
  ChevronRight, Menu, X, LogOut, Settings
} from "lucide-react";
import { notifications } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
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
];

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

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(() => {
    if (!item.children) return false;
    return item.children.some(c => location === c.href || location.startsWith(c.href));
  });

  const isActive = item.href
    ? location === item.href || (item.href === "/dashboard" && location === "/")
    : item.children?.some(c => location === c.href || location.startsWith(c.href));

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
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
            <SidebarNavItem key={item.label} item={item} collapsed={collapsed} />
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
  );
}
