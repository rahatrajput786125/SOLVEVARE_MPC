"use client";

import { useParams, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { LayoutDashboard, FileText, Database, Globe, Search, Link2 } from "lucide-react";

interface Project {
  id: string; name: string; slug: string; status: string;
  _count: { pages: number; templates: number; dataSources: number };
}

const TABS = [
  { label: "Overview", href: "", icon: LayoutDashboard },
  { label: "Templates", href: "/templates", icon: FileText },
  { label: "Data Sources", href: "/data-sources", icon: Database },
  { label: "Pages", href: "/pages", icon: Globe },
  { label: "SEO", href: "/seo", icon: Search },
  { label: "Linking", href: "/linking", icon: Link2 },
];

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();

  const { data: projectQuery, error, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: () => apiGet<Project>(`/projects/${id}`),
    enabled: !!id,
    retry: 1,
  });

  const project = projectQuery;

  if (!isLoading && (error || !project)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <p className="text-muted-foreground text-sm">This project no longer exists or was deleted.</p>
        <a href="/projects" className="text-sm text-primary underline">← Back to Projects</a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Project header */}
      <div className="border-b bg-card px-8 pt-6 pb-0">
        <div className="flex items-center gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{project?.name ?? "Loading..."}</h1>
              {project && (
                <Badge variant={project.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                  {project.status.toLowerCase()}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {project?._count.pages ?? 0} pages · {project?._count.templates ?? 0} templates · {project?._count.dataSources ?? 0} data sources
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <nav className="flex gap-1 -mb-px">
          {TABS.map((tab) => {
            const href = `/projects/${id}${tab.href}`;
            const isActive = tab.href === ""
              ? pathname === `/projects/${id}`
              : pathname.startsWith(href);

            return (
              <Link
                key={tab.href}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
