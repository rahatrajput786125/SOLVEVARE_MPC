"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { useAuthStore } from "@/store/auth.store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // 🔴 Fix 1: isAuthenticated() use karo — token + user dono check hoga
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  // 🟡 Fix 3: router ko ref mein wrap karo — stable reference
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, isAuthenticated]);

  // 🔴 Fix 2 + 🟡 Fix 4: Blank screen ki jagah loading spinner dikhao
  if (!isHydrated || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}