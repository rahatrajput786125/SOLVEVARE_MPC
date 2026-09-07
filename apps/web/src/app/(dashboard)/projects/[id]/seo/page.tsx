"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { toast } from "@/components/ui/toaster";

interface SeoSettings {
  siteName?: string;
  baseUrl?: string;
  twitterSite?: string;
  defaultOgImage?: string;
  blockAiBots?: boolean;
  defaultNoIndex?: boolean;
  defaultNoFollow?: boolean;
}

interface SeoAudit {
  totalPages: number;
  averageSeoScore: number;
  scoreBuckets: { excellent: number; good: number; fair: number; poor: number };
  issues: {
    missingTitle: number;
    missingDescription: number;
    missingFocusKeyword: number;
    noSchemaMarkup: number;
  };
}

export default function SeoPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [settings, setSettings] = useState<SeoSettings>({});
  const [audit, setAudit] = useState<SeoAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [projectRes, auditRes] = await Promise.all([
          apiGet<{ settings: { seo?: SeoSettings } }>(`/projects/${projectId}`),
          apiGet<SeoAudit>(`/seo/projects/${projectId}/audit`).catch(() => null),
        ]);

        setSettings(projectRes.settings?.seo ?? {});
        setAudit(auditRes);
      } catch (e: unknown) {
        const msg = (e as Error).message;
        if (msg.includes("Project not found")) {
          setError(`Project not found. Please check if the project ID (${projectId}) is correct.`);
        } else if (msg.includes("401") || msg.includes("Unauthorized")) {
          setError("Authentication required. Please login again.");
        } else {
          setError(`Error loading SEO data: ${msg}`);
        }
        setAudit(null);
      } finally {
        setLoading(false);
      }
    }

    if (projectId) {
      load();
    } else {
      setError("Project ID is missing from URL");
      setLoading(false);
    }
  }, [projectId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (!settings.siteName?.trim()) throw new Error("Site Name is required");
      if (!settings.baseUrl?.trim()) throw new Error("Base URL is required");
      if (settings.baseUrl && !settings.baseUrl.startsWith("http")) {
        throw new Error("Base URL must start with http:// or https://");
      }

      await apiPatch(`/seo/projects/${projectId}/settings`, settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);

      const [projectRes, auditRes] = await Promise.all([
        apiGet<{ settings: { seo?: SeoSettings } }>(`/projects/${projectId}`),
        apiGet<SeoAudit>(`/seo/projects/${projectId}/audit`).catch(() => null),
      ]);
      setSettings(projectRes.settings?.seo ?? {});
      setAudit(auditRes);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      if (msg.includes("Project not found")) {
        setError(`Project not found. Please check if the project ID (${projectId}) is correct.`);
      } else if (msg.includes("401") || msg.includes("Unauthorized")) {
        setError("Authentication required. Please login again.");
      } else if (msg.includes("403") || msg.includes("Forbidden")) {
        setError("You don't have permission to update SEO settings.");
      } else {
        setError(`Error saving SEO settings: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, key: keyof SeoSettings, placeholder = "", type: "text" | "url" = "text") {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{label}</label>
        <input
          type={type}
          placeholder={placeholder}
          value={(settings[key] as string) ?? ""}
          onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
    );
  }

  if (loading) return (
    <div className="p-8 flex justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">SEO Configuration</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Global SEO settings for this project</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : saved ? "Saved ✓" : "Save Settings"}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => window.location.reload()}
              className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded"
            >
              Retry
            </button>
          </div>
          {error.includes("Project not found") && (
            <div className="mt-2 text-xs text-red-600">
              <p>Possible solutions:</p>
              <ul className="list-disc pl-4 mt-1">
                <li>Check if you have access to this project</li>
                <li>Make sure the project exists in your organization</li>
                <li>Try accessing from the Projects page first</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {audit ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">SEO Audit Summary</h3>
            <div className="text-sm text-muted-foreground">Last updated: Just now</div>
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Total Pages", value: audit.totalPages, description: "Pages in project" },
              { label: "Avg SEO Score", value: `${audit.averageSeoScore}/100`, description: "Overall quality" },
              { label: "Missing Titles", value: audit.issues.missingTitle, description: "Need attention" },
              { label: "No Schema", value: audit.issues.noSchemaMarkup, description: "Structured data" },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-2xl font-bold mt-1">{item.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          {audit.totalPages === 0 && (
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No pages found in this project. Generate pages first to see SEO audit data.
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground bg-muted border rounded px-3 py-2">
          SEO audit data will appear here once pages are generated.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Site Settings</CardTitle>
            <CardDescription>Used in meta tags and robots.txt</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {field("Site Name", "siteName", "My Website", "text")}
            {field("Base URL", "baseUrl", "https://example.com", "url")}
            {field("Twitter Handle", "twitterSite", "@handle", "text")}
            {field("Default OG Image URL", "defaultOgImage", "https://example.com/og.jpg", "url")}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Robots & Indexing</CardTitle>
            <CardDescription>Control how search engines crawl your pages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Block AI Bots (GPTBot, CCBot, etc.)", key: "blockAiBots" as keyof SeoSettings },
              { label: "Default NoIndex on all pages", key: "defaultNoIndex" as keyof SeoSettings },
              { label: "Default NoFollow on all pages", key: "defaultNoFollow" as keyof SeoSettings },
            ].map(({ label, key }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(settings[key] as boolean) ?? false}
                  onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.checked }))}
                  className="h-4 w-4 rounded border"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SEO Tools</CardTitle>
          <CardDescription>Generate essential SEO files</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Canonical URLs</p>
              <p className="text-sm text-muted-foreground">
                Set <code className="text-xs bg-muted px-1 rounded">baseUrl/slug</code> as canonical on all existing pages
              </p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                if (!settings.baseUrl?.trim()) {
                  toast({ title: "Error", description: "Save a Base URL in Site Settings first.", variant: "destructive" });
                  return;
                }
                try {
                  const res = await apiPost<{ updated: number; baseUrl: string }>(`/projects/${projectId}/pages/apply-canonicals`);
                  toast({ title: `Canonical URLs applied to ${res.updated} pages`, description: `Base: ${res.baseUrl}` });
                } catch (e: unknown) {
                  toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
                }
              }}
            >
              Apply to All Pages
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Robots.txt</p>
              <p className="text-sm text-muted-foreground">Generate robots.txt file for search engines</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await apiPost(`/seo/projects/${projectId}/robots`);
                  toast({ title: "Robots.txt generated successfully" });
                } catch (e: unknown) {
                  toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
                }
              }}
            >
              Generate
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Sitemap</p>
              <p className="text-sm text-muted-foreground">Regenerate XML sitemap for all pages</p>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await apiPost(`/seo/projects/${projectId}/sitemap/regenerate`);
                  toast({ title: "Sitemap regeneration queued" });
                } catch (e: unknown) {
                  toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
                }
              }}
            >
              Regenerate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO Best Practices</CardTitle>
          <CardDescription>Tips for better search engine optimization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            "Set a descriptive Site Name for better brand recognition",
            "Use HTTPS in your Base URL for better security and ranking",
            "Add Twitter handle for better social media integration",
            "Block AI bots if you want to prevent content scraping",
          ].map((tip) => (
            <div key={tip} className="flex items-start gap-2">
              <div className="h-2 w-2 rounded-full bg-primary mt-1.5" />
              <p className="text-sm">{tip}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
