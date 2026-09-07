"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Download, Plus, X, Loader2, ExternalLink, Eye, ChevronLeft, FileText, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiDelete, api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber, scoreColor, statusColor, truncate } from "@/lib/utils";
import { GenerationRunsBanner } from "@/components/shared/GenerationRunsBanner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Page {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  htmlContent?: string | null;
  templateId?: string;
  status: string;
  seoScore: number | null;
  publishedUrl: string | null;
  canonicalUrl: string | null;
  focusKeyword: string | null;
  updatedAt: string;
}
interface PagesResponse {
  items: Page[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
interface TemplateGroup { templateId: string; templateName: string; totalPages: number; }
interface Template { id: string; name: string; }
interface DataSource { id: string; name: string; rowCount: number | null; }

interface ExportJob {
  exportJobId: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  totalPages: number;
  downloadReady: boolean;
  errorMessage?: string | null;
}

type PreviewTab = "meta" | "content";

// ── Server-side export hook ───────────────────────────────────────────────────
// Triggers POST /export, polls GET /export/:id/status until ready, then downloads.

function useServerExport(projectId: string) {
  const [exportingGroup, setExportingGroup] = useState<string | null>(null); // templateId | "all"
  const [exportError, setExportError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  useEffect(() => () => stopPoll(), []);

  const triggerExport = useCallback(async (templateId?: string) => {
    setExportError(null);
    const key = templateId ?? "all";
    setExportingGroup(key);

    try {
      const job = await apiPost<ExportJob>(
        `/projects/${projectId}/export`,
        undefined,
        templateId ? { templateId } : undefined
      );

      // Poll status every 3 s until COMPLETED or FAILED
      pollRef.current = setInterval(async () => {
        try {
          const status = await apiGet<ExportJob>(
            `/projects/${projectId}/export/${job.exportJobId}/status`
          );

          if (status.status === "COMPLETED" && status.downloadReady) {
            stopPoll();
            setExportingGroup(null);
            // Trigger browser download via direct axios stream
            const token = typeof window !== "undefined" ? localStorage.getItem("mpc_token") : null;
            const res = await api.get(
              `/projects/${projectId}/export/${job.exportJobId}/download`,
              { responseType: "blob", headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            const url = URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = `export-${job.exportJobId}.zip`;
            a.click();
            URL.revokeObjectURL(url);
          } else if (status.status === "FAILED") {
            stopPoll();
            setExportingGroup(null);
            setExportError(status.errorMessage ?? "Export failed");
          }
        } catch (err) {
          stopPoll();
          setExportingGroup(null);
          setExportError((err as Error).message);
        }
      }, 3000);
    } catch (err) {
      setExportingGroup(null);
      setExportError((err as Error).message);
    }
  }, [projectId]);

  return { exportingGroup, exportError, triggerExport, clearError: () => setExportError(null) };
}

// ── Page component ────────────────────────────────────────────────────────────

export default function PagesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [activeTemplate, setActiveTemplate] = useState<TemplateGroup | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [selectedDataSource, setSelectedDataSource] = useState("");

  const [viewPage, setViewPage] = useState<Page | null>(null);
  const [viewPageLoading, setViewPageLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>("meta");

  const [isCleaning, setIsCleaning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TemplateGroup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { exportingGroup, exportError, triggerExport, clearError } = useServerExport(projectId);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: templateGroups, isLoading: groupsLoading } = useQuery({
    queryKey: ["pages-by-template", projectId],
    queryFn: () => apiGet<TemplateGroup[]>(`/projects/${projectId}/pages/by-template`),
    enabled: !!projectId,
  });

  const { data: pagesData, isLoading: pagesLoading } = useQuery({
    queryKey: ["pages", projectId, activeTemplate?.templateId, page, debouncedSearch],
    queryFn: () =>
      apiGet<PagesResponse>(
        `/projects/${projectId}/pages/template/${activeTemplate!.templateId}`,
        { page, limit: 50, search: debouncedSearch || undefined }
      ),
    enabled: !!projectId && !!activeTemplate,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const { data: templates } = useQuery({
    queryKey: ["templates", projectId],
    queryFn: () => apiGet<{ items: Template[] }>(`/projects/${projectId}/templates`),
    enabled: showGenerate && !!projectId,
  });

  const { data: dataSources } = useQuery({
    queryKey: ["data-sources", projectId],
    queryFn: () => apiGet<{ items: DataSource[] }>(`/projects/${projectId}/data-sources`),
    enabled: showGenerate && !!projectId,
  });

  const generateMutation = useMutation({
    mutationFn: () => apiPost<{ jobId: string }>(`/projects/${projectId}/pages/generate`, {
      templateId: selectedTemplate,
      dataSourceId: selectedDataSource,
    }),
    onSuccess: async () => {
      setShowGenerate(false);
      setSelectedTemplate("");
      setSelectedDataSource("");
      // Wait briefly so MongoDB write is visible before refetch
      await new Promise((r) => setTimeout(r, 500));
      await queryClient.refetchQueries({ queryKey: ["generation-runs", projectId] });
      queryClient.invalidateQueries({ queryKey: ["pages-by-template", projectId] });
    },
    onError: (err: Error) => {
      // error already shown in modal via generateMutation.isError
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => { setDebouncedSearch(value); setPage(1); }, 400);
    setDebounceTimer(timer);
  }, [debounceTimer]);

  const openPagePreview = useCallback(async (p: Page) => {
    setActiveTab("meta");
    if (p.content) { setViewPage(p); return; }
    setViewPageLoading(true);
    try {
      const full = await apiGet<Page>(`/projects/${projectId}/pages/${p.id}`);
      setViewPage(full);
    } catch { setViewPage(p); }
    finally { setViewPageLoading(false); }
  }, [projectId]);

  const buildPageHtml = useCallback((p: Page): string => {
    const canonical = p.canonicalUrl ?? `https://yoursite.com/${p.slug}`;
    return p.htmlContent ?? `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${p.title}</title>
  <meta name="description" content="${p.description}" />
  <link rel="canonical" href="${canonical}" />
</head>
<body>
${p.content || `<p>No content available.</p>`}
</body>
</html>`;
  }, []);

  const downloadPageAsHtml = useCallback((p: Page) => {
    const blob = new Blob([buildPageHtml(p)], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${p.slug}.html`; a.click();
    URL.revokeObjectURL(url);
  }, [buildPageHtml]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!projectId || !deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiDelete<{ deleted: number }>(`/projects/${projectId}/pages/template/${deleteTarget.templateId}`);
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["pages-by-template", projectId] });
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setIsDeleting(false);
    }
  }, [projectId, deleteTarget, queryClient]);

  const handleCleanupDrafts = useCallback(async () => {
    if (!projectId) return;
    setIsCleaning(true);
    try {
      const res = await apiDelete<{ deleted: number }>(`/projects/${projectId}/pages/cleanup-drafts`);
      queryClient.invalidateQueries({ queryKey: ["pages-by-template", projectId] });
      alert(res.deleted > 0 ? `Cleaned up ${res.deleted} empty draft pages.` : "No empty draft pages found.");
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setIsCleaning(false);
    }
  }, [projectId, queryClient]);

  const goBack = () => {
    setActiveTemplate(null);
    setPage(1); setSearch(""); setDebouncedSearch("");
    queryClient.invalidateQueries({ queryKey: ["pages-by-template", projectId] });
  };

  // ── Generate Modal ────────────────────────────────────────────────────────
  const GenerateModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Generate Pages</h3>
          <button onClick={() => setShowGenerate(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Template</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Select a template...</option>
              {templates?.items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Data Source</label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedDataSource}
              onChange={(e) => setSelectedDataSource(e.target.value)}
            >
              <option value="">Select a data source...</option>
              {dataSources?.items.map((ds) => (
                <option key={ds.id} value={ds.id}>{ds.name}{ds.rowCount ? ` (${ds.rowCount} rows)` : ""}</option>
              ))}
            </select>
          </div>
          {generateMutation.isError && (
            <p className="text-sm text-red-500">{(generateMutation.error as Error).message}</p>
          )}
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" size="sm" onClick={() => setShowGenerate(false)}>Cancel</Button>
          <Button
            size="sm"
            disabled={!selectedTemplate || !selectedDataSource || generateMutation.isPending}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
              : "Generate"}
          </Button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 1 — Template Groups
  // ═══════════════════════════════════════════════════════════════════════════
  if (!activeTemplate) {
    return (
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Pages</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Organized by template</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleCleanupDrafts} disabled={isCleaning} title="Delete empty draft pages">
              {isCleaning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
            <Button size="sm" onClick={() => setShowGenerate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Generate Pages
            </Button>
          </div>
        </div>

        {showGenerate && <GenerateModal />}

        <GenerationRunsBanner projectId={projectId} />

        {/* Export error toast */}
        {exportError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>Export failed: {exportError}</span>
            <button onClick={clearError}><X className="h-4 w-4" /></button>
          </div>
        )}

        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-red-600">Delete Pages</h3>
                <button onClick={() => setDeleteTarget(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to permanently delete all{" "}
                <span className="font-semibold text-foreground">{deleteTarget.totalPages} pages</span>{" "}
                generated from template{" "}
                <span className="font-semibold text-foreground">"{deleteTarget.templateName}"</span>?
              </p>
              <p className="text-xs text-red-500">This action cannot be undone.</p>
              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>Cancel</Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeleting}
                  onClick={handleDeleteTemplate}
                >
                  {isDeleting
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…</>
                    : <><Trash2 className="h-4 w-4 mr-2" /> Delete All Pages</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {groupsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : !templateGroups?.length ? (
          <Card>
            <div className="px-6 py-16 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No templates yet</p>
              <p className="text-sm mt-1">Create a template first, then click <strong>Generate Pages</strong>.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templateGroups.map((group) => {
              const isThisExporting = exportingGroup === group.templateId;
              return (
                <Card
                  key={group.templateId}
                  className="p-5 cursor-pointer hover:border-primary transition-colors group"
                  onClick={() => setActiveTemplate(group)}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold truncate group-hover:text-primary transition-colors">
                        {group.templateName}
                      </p>
                      <p className="text-2xl font-bold mt-2">{formatNumber(group.totalPages)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.totalPages === 1 ? "page" : "pages"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0 ml-3">
                      <Button
                        variant="outline" size="sm"
                        disabled={group.totalPages === 0 || !!exportingGroup}
                        onClick={(e) => { e.stopPropagation(); triggerExport(group.templateId); }}
                        title="Export as ZIP (server-side)"
                      >
                        {isThisExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline" size="sm"
                        disabled={group.totalPages === 0}
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(group); }}
                        title="Delete all pages for this template"
                        className="text-red-500 hover:text-red-600 hover:border-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEVEL 2 — Pages within selected template
  // ═══════════════════════════════════════════════════════════════════════════
  const isThisExporting = exportingGroup === activeTemplate.templateId;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold">{activeTemplate.templateName}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {pagesData ? formatNumber(pagesData.meta.total) : formatNumber(activeTemplate.totalPages)} pages
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            disabled={!pagesData?.items.length || !!exportingGroup}
            onClick={() => triggerExport(activeTemplate.templateId)}
          >
            {isThisExporting
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</>
              : <><Download className="h-4 w-4 mr-2" /> Export ZIP</>}
          </Button>
          <Button size="sm" onClick={() => setShowGenerate(true)}>
            <Plus className="h-4 w-4 mr-2" /> Generate Pages
          </Button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>Export failed: {exportError}</span>
          <button onClick={clearError}><X className="h-4 w-4" /></button>
        </div>
      )}

      <GenerationRunsBanner projectId={projectId} />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text" placeholder="Search pages..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Title / Slug</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SEO Score</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pagesLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b">
                    <td colSpan={5} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : !pagesData?.items.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    No pages yet for this template. Click <strong>Generate Pages</strong> to create them.
                  </td>
                </tr>
              ) : (
                pagesData.items.map((p) => (
                  <tr
                    key={p.id} onClick={() => openPagePreview(p)}
                    className="border-b hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium">{truncate(p.title, 60)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">/{p.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(p.status)}`}>
                        {p.status.toLowerCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {p.seoScore !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${p.seoScore >= 80 ? "bg-green-500" : p.seoScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${p.seoScore}%` }}
                            />
                          </div>
                          <span className={`text-xs font-medium ${scoreColor(p.seoScore)}`}>{p.seoScore}</span>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openPagePreview(p)} className="text-muted-foreground hover:text-foreground">
                          <Eye className="h-4 w-4" />
                        </button>
                        {p.publishedUrl && (
                          <a href={p.publishedUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pagesData && pagesData.meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              Page {pagesData.meta.page} of {pagesData.meta.totalPages} · {formatNumber(pagesData.meta.total)} total
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pagesData.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {showGenerate && <GenerateModal />}

      {viewPageLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl px-8 py-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm">Loading page…</p>
          </div>
        </div>
      )}

      {viewPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setViewPage(null)}>
          <div className="bg-background rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-4 border-b gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{viewPage.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">/{viewPage.slug}</p>
              </div>
              <button onClick={() => setViewPage(null)} className="shrink-0 text-muted-foreground hover:text-foreground mt-0.5">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex border-b px-6">
              {(["meta", "content"] as PreviewTab[]).map((tab) => (
                <button
                  key={tab} onClick={() => setActiveTab(tab)}
                  className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "meta" ? "Meta Tags" : "Page Content"}
                </button>
              ))}
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {activeTab === "meta" && (
                <div className="space-y-4">
                  <MetaRow label="Title Tag">
                    <p className="text-sm font-medium text-blue-600 truncate">{viewPage.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{viewPage.title.length} chars
                      {viewPage.title.length < 30 && " · too short (aim 50-60)"}
                      {viewPage.title.length > 60 && " · too long (aim 50-60)"}
                      {viewPage.title.length >= 30 && viewPage.title.length <= 60 && " · ✓ good length"}
                    </p>
                  </MetaRow>
                  <MetaRow label="Meta Description">
                    {viewPage.description ? (
                      <>
                        <p className="text-sm">{viewPage.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{viewPage.description.length} chars
                          {viewPage.description.length < 120 && " · too short (aim 120-160)"}
                          {viewPage.description.length > 160 && " · too long (aim 120-160)"}
                          {viewPage.description.length >= 120 && viewPage.description.length <= 160 && " · ✓ good length"}
                        </p>
                      </>
                    ) : <p className="text-sm text-muted-foreground italic">No meta description set</p>}
                  </MetaRow>
                  <MetaRow label="URL Slug">
                    <p className="text-sm font-mono text-green-700">/{viewPage.slug}</p>
                  </MetaRow>
                  <MetaRow label="Canonical URL">
                    {viewPage.canonicalUrl ? (
                      <a href={viewPage.canonicalUrl} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:underline break-all flex items-center gap-1">
                        {viewPage.canonicalUrl}<ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : <p className="text-sm text-muted-foreground italic">Not set</p>}
                  </MetaRow>
                  <MetaRow label="Focus Keyword">
                    {viewPage.focusKeyword
                      ? <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">{viewPage.focusKeyword}</span>
                      : <p className="text-sm text-muted-foreground italic">Not set</p>}
                  </MetaRow>
                  <MetaRow label="SEO Score">
                    {viewPage.seoScore !== null ? (
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${viewPage.seoScore >= 80 ? "bg-green-500" : viewPage.seoScore >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                            style={{ width: `${viewPage.seoScore}%` }}
                          />
                        </div>
                        <span className={`text-sm font-semibold ${scoreColor(viewPage.seoScore)}`}>{viewPage.seoScore} / 100</span>
                      </div>
                    ) : <p className="text-sm text-muted-foreground italic">Not calculated</p>}
                  </MetaRow>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">SERP Preview</p>
                    <div className="border rounded-lg p-4 bg-white space-y-1 max-w-xl">
                      <p className="text-xs text-green-700 truncate">{viewPage.canonicalUrl ?? `https://yoursite.com/${viewPage.slug}`}</p>
                      <p className="text-base text-blue-700 font-medium leading-snug truncate hover:underline cursor-pointer">{viewPage.title}</p>
                      <p className="text-sm text-gray-600 line-clamp-2 leading-snug">{viewPage.description || "No meta description provided for this page."}</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "content" && (
                <div>
                  {viewPage.content ? (
                    <div
                      className="prose prose-sm max-w-none text-sm border rounded-lg px-5 py-4 bg-white"
                      dangerouslySetInnerHTML={{
                        __html: (() => {
                          const c = viewPage.content;
                          const m = c.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                          return m ? m[1].trim() : c;
                        })()
                      }}
                    />
                  ) : (
                    <div className="border rounded-lg px-5 py-10 text-center text-muted-foreground">
                      <p className="text-sm font-medium">No content available</p>
                      <p className="text-xs mt-1">Make sure your template has content saved, then regenerate pages.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t flex items-center justify-between">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(viewPage.status)}`}>
                {viewPage.status.toLowerCase()}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => downloadPageAsHtml(viewPage)}>
                  <Download className="h-4 w-4 mr-2" /> Download HTML
                </Button>
                <Button variant="outline" size="sm" onClick={() => setViewPage(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      {children}
    </div>
  );
}
