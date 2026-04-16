import {
  LayoutDashboard,
  ListOrdered,
  Wallet,
  Target,
  PiggyBank,
  Shapes,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Show in the mobile bottom bar (max 4). */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
  {
    href: "/transactions",
    label: "Transactions",
    icon: ListOrdered,
    primary: true,
  },
  { href: "/accounts", label: "Accounts", icon: Wallet, primary: true },
  { href: "/budgets", label: "Budgets", icon: Target },
  { href: "/categories", label: "Categories", icon: Shapes },
  { href: "/piggy-banks", label: "Piggy banks", icon: PiggyBank },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => !i.primary);
