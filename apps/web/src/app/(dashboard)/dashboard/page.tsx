"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Globe, Zap, TrendingUp, ArrowUpRight, Clock } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui/card";
import { formatNumber, formatCost, statusColor, scoreColor } from "@/lib/utils";
import Link from "next/link";

interface DashboardStats {
  totalProjects: number;
  totalPages: number;
  publishedPages: number;
  generatingPages: number;
  aiTokensUsed: number;
  aiCostUsd: number;
  avgSeoScore: number;
  recentPages: Array<{
    id: string; slug: string; title: string;
    status: string; seoScore: number | null;
    projectName: string; createdAt: string;
  }>;
}

export default function DashboardPage() {
  const org = useAuthStore((s) => s.org);

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<{ items: { id: string; name: string; _count: { pages: number; templates: number } }[]; meta: unknown }>("/projects"),
  });

  const projects = projectsData?.items ?? [];
  const stats = {
    totalProjects: projects.length,
    totalPages: projects.reduce((s, p) => s + p._count.pages, 0),
    publishedPages: 0,
    generatingPages: 0,
    aiTokensUsed: 0,
    aiCostUsd: 0,
    avgSeoScore: 0,
    recentPages: [] as DashboardStats["recentPages"],
  };

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome back — here&apos;s what&apos;s happening with {org?.name}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Pages"
          value={formatNumber(stats.totalPages)}
          sub={`${formatNumber(stats.publishedPages)} published`}
          icon={Globe}
          trend={stats.generatingPages > 0 ? `${stats.generatingPages} generating` : undefined}
        />
        <StatCard
          title="Projects"
          value={stats.totalProjects.toString()}
          sub="Active projects"
          icon={FileText}
        />
        <StatCard
          title="AI Tokens Used"
          value={formatNumber(stats.aiTokensUsed)}
          sub={`Cost: ${formatCost(stats.aiCostUsd)}`}
          icon={Zap}
        />
        <StatCard
          title="Avg SEO Score"
          value={`${stats.avgSeoScore}/100`}
          sub="Across all pages"
          icon={TrendingUp}
          valueClass={scoreColor(stats.avgSeoScore)}
        />
      </div>

      {/* Recent pages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Pages</CardTitle>
            <CardDescription>Latest generated pages across all projects</CardDescription>
          </div>
          <Link
            href="/projects"
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View all <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent>
          {stats.recentPages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-1">
              {stats.recentPages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center gap-4 rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{page.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {page.projectName} · /{page.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {page.seoScore !== null && (
                      <span className={`text-xs font-medium ${scoreColor(page.seoScore)}`}>
                        {page.seoScore}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(page.status)}`}>
                      {page.status.toLowerCase()}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(page.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon: Icon, trend, valueClass,
}: {
  title: string; value: string; sub: string;
  icon: React.ElementType; trend?: string; valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        <p className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        {trend && (
          <Badge variant="warning" className="mt-2 text-xs">{trend}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12">
      <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p className="text-sm font-medium">No pages yet</p>
      <p className="text-xs text-muted-foreground mt-1">
        Create a project and upload your data to start generating pages
      </p>
      <Link href="/projects" className="text-sm text-primary hover:underline mt-3 inline-block">
        Create your first project →
      </Link>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-8 space-y-8 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-32 bg-muted rounded-lg" />
        ))}
      </div>
      <div className="h-64 bg-muted rounded-lg" />
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
 