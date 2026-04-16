const buildNavItems = (
  pendingLabelCount: number,
  qcCount: number,
  stockCount: number
): NavItem[] => [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Orders",
    icon: Package,
    children: [
      { label: "Picking Queue", href: "/picking", icon: Package },
      { label: "Packing Queue", href: "/packing", icon: BoxIcon },
      { label: "Shipping Queue", href: "/shipping", icon: Truck },
    ],
  },
  {
    label: "Inventory",
    icon: Archive,
    children: [
      { label: "Snapshot", href: "/inventory", icon: Archive },
      { label: "Receive Books", href: "/receive", icon: BookOpen },
      {
        label: "QC Queue",
        href: "/qc",
        icon: ClipboardCheck,
        badge: qcCount > 0 ? qcCount : undefined,
      },
      {
        label: "Print Labels",
        href: "/labels",
        icon: Tag,
        badge: pendingLabelCount > 0 ? pendingLabelCount : undefined,
      },
      {
        label: "Shelve Books",
        href: "/stock",
        icon: Layers,
        badge: stockCount > 0 ? stockCount : undefined,
      },
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
  { label: "Support", href: "/support", icon: AlertCircle },
  { label: "ISBN Lookup", href: "/isbn", icon: BookOpen },
  { label: "Event Sign-Up", overlay: true, icon: CalendarCheck },
];