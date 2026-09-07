"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus, MoreHorizontal, Loader2, X, Upload } from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

interface Template {
  id: string;
  name: string;
  description?: string;
  content: string;
  titleTemplate: string;
  descriptionTemplate: string;
  slugTemplate: string;
  version: number;
  createdAt: string;
  _count?: { pages: number };
}

const EMPTY_FORM = {
  name: "",
  description: "",
  content: "",
  headContent: "",
  titleTemplate: "",
  descriptionTemplate: "",
  slugTemplate: "",
};

export default function TemplatesPage() {
  const { id: projectId } = useParams<{ id: string }>();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState(false);
  const [htmlImported, setHtmlImported] = useState(false);

  async function fetchTemplates() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: Template[] }>(`/projects/${projectId}/templates`);
      setTemplates(res.items ?? []);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, [projectId]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImportMode(false);
    setModalOpen(true);
  }

  function openImport() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setImportMode(true);
    setHtmlImported(false);
    setModalOpen(true);
  }

  function handleHtmlFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const html = ev.target?.result as string;

      // Extract title/desc with regex from raw string — avoids DOMParser moving <style> into body
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const title = titleMatch?.[1]?.trim() ?? "";
      const metaMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
      const metaDesc = metaMatch?.[1]?.trim() ?? "";
      const slug = file.name.replace(/\.html?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");

      // Extract full <head> inner content — preserves ALL CSS links, JS links, meta tags
      const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
      const rawHead = headMatch?.[1] ?? "";
      // Remove the auto-generated <style> block that has no variables (it's generic CSS)
      const headContent = rawHead.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").trim();

      // Extract only what's between first <body> and last </body> — no CSS, no double HTML
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const bodyContent = bodyMatch?.[1]?.trim() ?? html.trim();

      setForm((f) => ({
        ...f,
        name: f.name || file.name.replace(/\.html?$/i, ""),
        content: bodyContent,
        headContent,
        titleTemplate: title || f.titleTemplate,
        descriptionTemplate: metaDesc || f.descriptionTemplate,
        slugTemplate: slug || f.slugTemplate,
      }));
      setHtmlImported(true);
    };
    reader.readAsText(file);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      content: t.content,
      headContent: (t as any).headContent ?? "",
      titleTemplate: t.titleTemplate,
      descriptionTemplate: t.descriptionTemplate,
      slugTemplate: t.slugTemplate,
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.content || !form.titleTemplate || !form.descriptionTemplate || !form.slugTemplate) {
      setFormError("Name, Content, Title, Description, and Slug are required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await apiPatch(`/projects/${projectId}/templates/${editing.id}`, form);
      } else {
        await apiPost(`/projects/${projectId}/templates`, form);
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      await fetchTemplates();
    } catch (e: unknown) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: Template) {
    if (!confirm(`Delete "${t.name}"? This action cannot be undone.`)) return;
    setError(null);
    try {
      await apiDelete(`/projects/${projectId}/templates/${t.id}`);
      await fetchTemplates();
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  }

  function field(key: keyof typeof form, label: string, placeholder: string, textarea = false) {
    return (
      <div className="space-y-1">
        <label className="text-sm font-medium">{label}</label>
        {textarea ? (
          <textarea
            rows={10}
            placeholder={placeholder}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <input
            type="text"
            placeholder={placeholder}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Templates</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage the design templates for your generated pages
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openImport}>
            <Upload className="h-4 w-4 mr-2" /> Import HTML Page
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Create Template
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed shadow-none bg-muted/20">
          <CardContent className="p-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-1">No templates yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create a template with <code className="bg-muted px-1 rounded">{"{{variable}}"}</code> placeholders.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        v{t.version} · {t._count?.pages ?? 0} pages ·{" "}
                        {new Date(t.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(t)}
                    className="text-muted-foreground hover:text-red-500 p-1 rounded"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 pt-4 border-t flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                    Edit Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {editing ? "Edit Template" : importMode ? "Import HTML Page" : "Create Template"}
              </h3>
              <button onClick={() => setModalOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            {field("name", "Template Name", "e.g. City Landing Page")}
            {importMode ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Upload HTML File</label>
                  <input
                    type="file"
                    accept=".html,.htm"
                    onChange={handleHtmlFileChange}
                    className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">Title, description, and slug are auto-extracted then you can add <code className="bg-muted px-1 rounded">{"{{variables}}"}</code> for per-row variation.</p>
                </div>
                {htmlImported && (
                  <>
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      ⚠️ Add <code className="bg-yellow-100 px-1 rounded">{"{{variables}}"}</code> to Title, Description, and Slug so each CSV row generates a unique page. e.g. slug: <code className="bg-yellow-100 px-1 rounded">{"{{service}}-in-{{city}}"}</code>
                    </div>
                    {field("titleTemplate", "Title Template", "Best {{service}} in {{city}} | Solvevare")}
                    {field("descriptionTemplate", "Meta Description Template", "Find top {{service}} in {{city}}.")}
                    {field("slugTemplate", "Slug Template", "{{service}}-in-{{city}}")}
                  </>
                )}
              </div>
            ) : (
              <>
                {field("description", "Description (optional)", "Short description")}
                {field("titleTemplate", "Title Template", "Best {{service}} in {{city}} | {{brand}}")}
                {field("descriptionTemplate", "Meta Description Template", "Find top {{service}} in {{city}}.")}
                {field("slugTemplate", "Slug Template", "{{service}}-in-{{city}}")}
                {field("content", "HTML / Markdown Content", "<h1>{{service}} in {{city}}</h1>\n<p>...</p>", true)}
              </>
            )}

            {formError && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save Template"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
