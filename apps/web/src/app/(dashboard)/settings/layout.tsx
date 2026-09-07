"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Billing", href: "/settings/billing" },
  { label: "Team", href: "/settings/team" },
  { label: "AI Settings", href: "/settings/ai" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and billing</p>
      </div>
      <div className="flex gap-8">
        <nav className="w-48 shrink-0 space-y-1">
          {NAV.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname === href
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
