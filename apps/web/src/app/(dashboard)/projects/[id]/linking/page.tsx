"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link2, AlertTriangle, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { toast } from "@/components/ui/toaster";

interface LinkOverview {
  totalLinks: number;
  totalPages: number;
  avgLinksPerPage: number;
  orphanPages: number;
  byType: { type: string; count: number }[];
}

interface OrphanPage {
  id: string;
  slug: string;
  title: string;
  seoScore: number | null;
}

export default function LinkingPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ["link-overview", projectId],
    queryFn: () => apiGet<LinkOverview>(`/linking/projects/${projectId}/overview`),
  });

  const { data: orphans, isLoading: orphansLoading } = useQuery({
    queryKey: ["link-orphans", projectId],
    queryFn: () => apiGet<OrphanPage[]>(`/linking/projects/${projectId}/orphans`),
  });

  async function handleRebuild() {
    try {
      await apiPost(`/linking/projects/${projectId}/rebuild`);
      toast({ title: "Link rebuild started" });
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  }

  const isLoading = overviewLoading || orphansLoading;

  if (isLoading) return (
    <div className="p-8 flex justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Internal Linking</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Link graph overview for this project</p>
        </div>
        <Button variant="outline" onClick={handleRebuild}>Rebuild Links</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Links", value: overview?.totalLinks ?? 0 },
          { label: "Total Pages", value: overview?.totalPages ?? 0 },
          { label: "Avg Links / Page", value: overview?.avgLinksPerPage ?? 0 },
          { label: "Orphan Pages", value: overview?.orphanPages ?? 0 },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-bold mt-1">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Links by type */}
      {overview?.byType && overview.byType.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Links by Type</CardTitle>
            <CardDescription>Distribution of internal link types</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overview.byType.map(({ type, count }) => {
                const pct = overview.totalLinks > 0
                  ? Math.round((count / overview.totalLinks) * 100)
                  : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium capitalize">{type.toLowerCase().replace("_", " ")}</span>
                        <span className="text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Orphan pages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Orphan Pages
          </CardTitle>
          <CardDescription>Pages with no inbound internal links — may not be discovered by Google</CardDescription>
        </CardHeader>
        <CardContent>
          {!orphans?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No orphan pages — great internal linking!
            </p>
          ) : (
            <div className="divide-y">
              {orphans.map((page) => (
                <div key={page.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{page.title}</p>
                    <p className="text-xs text-muted-foreground">/{page.slug}</p>
                  </div>
                  {page.seoScore !== null && (
                    <span className="text-xs text-muted-foreground">SEO: {page.seoScore}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
