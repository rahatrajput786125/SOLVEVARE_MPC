"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Globe, FileText, Database, TrendingUp, ArrowRight, Play, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber, scoreColor, statusColor } from "@/lib/utils";

interface Stats {
  total: number;
  published?: number;
  generated?: number;
  [key: string]: number | undefined;
}

interface RecentPage {
  id: string;
  slug: string;
  title: string;
  seoScore: number | null;
  status: string;
}

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ["project-stats", id],
    queryFn: () => apiGet<Stats>(`/projects/${id}/pages/stats`),
    enabled: !!id,
    retry: 1,
  });

  const { data: recentPages, isLoading: pagesLoading, error: pagesError } = useQuery({
    queryKey: ["project-recent-pages", id],
    queryFn: () => apiGet<RecentPage[]>(`/projects/${id}/pages/recent`),
    enabled: !!id,
    retry: 1,
  });

  const isLoading = statsLoading || pagesLoading;
  const hasError = statsError || pagesError;

  if (isLoading) return (
    <div className="p-8 flex justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (hasError) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-600">
          Failed to load project data. Please try refreshing the page.
        </p>
      </div>
    </div>
  );

  const totalPages = stats?.total ?? 0;
  const published = stats?.published ?? 0;
  const generated = stats?.generated ?? 0;
  const avgSeoScore = stats?.avgSeoScore ?? null;

  return (
    <div className="p-8 space-y-6">
      <div className="flex gap-3">
        <Link href={`/projects/${id}/data-sources`}>
          <Button variant="outline" size="sm">
            <Database className="h-4 w-4 mr-2" /> Upload Data
          </Button>
        </Link>
        <Link href={`/projects/${id}/pages`}>
          <Button size="sm">
            <Play className="h-4 w-4 mr-2" /> Generate Pages
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Pages", value: formatNumber(totalPages), icon: Globe },
          { label: "Published", value: formatNumber(published), icon: Globe },
          { label: "Generated", value: formatNumber(generated), icon: FileText },
          { label: "Avg SEO Score", value: avgSeoScore ? avgSeoScore.toFixed(0) : "—", icon: TrendingUp },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <item.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Pages</CardTitle>
            <CardDescription>Latest generated pages in this project</CardDescription>
          </div>
          <Link href={`/projects/${id}/pages`}>
            <Button variant="ghost" size="sm">
              View all <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {!recentPages?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No pages generated yet.{" "}
              <Link href={`/projects/${id}/data-sources`} className="text-primary hover:underline">
                Upload data to start
              </Link>
            </p>
          ) : (
            <div className="space-y-1">
              {recentPages.map((page) => (
                <div key={page.id} className="flex items-center gap-4 px-3 py-2.5 rounded-md hover:bg-muted/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{page.title}</p>
                    <p className="text-xs text-muted-foreground">/{page.slug}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {page.seoScore !== null && (
                      <span className={`text-sm font-semibold ${scoreColor(page.seoScore)}`}>
                        {page.seoScore}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(page.status)}`}>
                      {page.status.toLowerCase()}
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
