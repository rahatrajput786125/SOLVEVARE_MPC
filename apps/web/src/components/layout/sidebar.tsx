"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, FileText, Database,
  Globe, Link2, Settings, CreditCard, Users,
  Zap, ChevronDown, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { Badge } from "@/components/ui/card";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderOpen },
];

const SETTINGS_ITEMS = [
  { label: "AI Settings", href: "/settings/ai", icon: Zap },
  { label: "Team", href: "/settings/team", icon: Users },
  { label: "Billing", href: "/settings/billing", icon: CreditCard },
];

// Project-level nav — shown when inside a project
export const PROJECT_NAV = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Data Sources", href: "/data-sources", icon: Database },
  { label: "Pages", href: "/pages", icon: Globe },
  { label: "SEO", href: "/seo", icon: Globe },
  { label: "Linking", href: "/linking", icon: Link2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, org, clearAuth } = useAuthStore();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          M
        </div>
        <span className="font-semibold text-sm">MPC</span>
        {org && (
          <Badge variant="outline" className="ml-auto text-xs">
            {org.plan}
          </Badge>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        <div className="pt-4 pb-1">
          <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Settings
          </p>
        </div>

        {SETTINGS_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-medium">
            {user?.name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name ?? user?.email}</p>
            <p className="text-xs text-muted-foreground truncate">{org?.name}</p>
          </div>
          <button
            onClick={clearAuth}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  href, label, icon: Icon, active,
}: {
  href: string; label: string; icon: React.ElementType; active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}
