import {
  LayoutDashboard,
  Ticket,
  Users,
  Smartphone,
  Package,
  CircuitBoard,
  Microscope,
  Lightbulb,
  Cpu,
  Calculator,
  BookOpen,
  Library,
  DollarSign,
  CreditCard,
  ReceiptText,
  BarChart3,
  Settings,
  DatabaseBackup,
  Puzzle,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: string;
}

/** Single source of truth for sidebar groups and the command palette. */
export const NAV_ITEMS: NavItem[] = [
  { path: "/pos", label: "Point of Sale", icon: CreditCard, group: "Sales" },
  { path: "/sales", label: "Sales History", icon: ReceiptText, group: "Sales" },

  { path: "/", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },

  { path: "/tickets", label: "Repair Tickets", icon: Ticket, group: "Operations" },
  { path: "/customers", label: "Customers", icon: Users, group: "Operations" },
  { path: "/devices", label: "Devices", icon: Smartphone, group: "Operations" },

  { path: "/inventory", label: "Inventory", icon: Package, group: "Stock" },
  { path: "/donors", label: "Donor Boards", icon: CircuitBoard, group: "Stock" },

  { path: "/microsoldering", label: "Microsoldering", icon: Microscope, group: "Bench" },
  { path: "/intelligence", label: "Repair Intelligence", icon: Lightbulb, group: "Bench" },
  { path: "/board-tools", label: "Board Tools", icon: Cpu, group: "Bench" },
  { path: "/calculator", label: "Calculator", icon: Calculator, group: "Bench" },

  { path: "/knowledge", label: "Knowledge Base", icon: BookOpen, group: "Knowledge" },
  { path: "/reference", label: "Parts Reference", icon: Library, group: "Knowledge" },

  { path: "/financial", label: "Financial", icon: DollarSign, group: "Business" },
  { path: "/reporting", label: "Reporting", icon: BarChart3, group: "Business" },

  { path: "/backup", label: "Backup & Restore", icon: DatabaseBackup, group: "System" },
  { path: "/plugins", label: "Plugins", icon: Puzzle, group: "System" },
  { path: "/settings", label: "Settings", icon: Settings, group: "System" },
];

export const NAV_GROUP_ORDER = [
  "Sales",
  "Overview",
  "Operations",
  "Stock",
  "Bench",
  "Knowledge",
  "Business",
  "System",
];
