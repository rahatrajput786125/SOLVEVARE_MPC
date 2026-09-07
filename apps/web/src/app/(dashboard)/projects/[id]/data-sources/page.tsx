"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, UploadCloud, FileSpreadsheet, Loader2, X } from "lucide-react";
import { api, apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/toaster";

interface DataSource {
  id: string;
  name: string;
  type: string;
  sourceUrl: string | null;
  createdAt: string;
  imports: { status: string; totalRows: number; processedRows: number; createdAt: string }[];
}

export default function DataSourcesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchDataSources() {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<{ items: DataSource[] } | DataSource[]>(
        `/projects/${projectId}/data-sources`
      );
      // Handle both response formats: { items: [] } or []
      const dataSourceList = Array.isArray(res) ? res : (res.items ?? []);
      setDataSources(dataSourceList);
    } catch (e: unknown) {
      const errorMsg = (e as Error).message;
      setError(errorMsg);
      console.error('Failed to fetch data sources:', errorMsg);
    } finally {
      setLoading(false);
    }
  }

  async function fetchDataSource(id: string) {
    if (!projectId) return null;
    setSelectedLoading(true);
    setError(null);
    try {
      const ds = await apiGet<DataSource>(
        `/projects/${projectId}/data-sources/${id}`
      );
      return ds;
    } catch (e: unknown) {
      const errorMsg = (e as Error).message;
      setError(errorMsg);
      console.error('Failed to fetch data source:', errorMsg);
      return null;
    } finally {
      setSelectedLoading(false);
    }
  }

  useEffect(() => {
    fetchDataSources();
  }, [projectId]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!projectId) {
      setError('Project ID is missing');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Step 1: Create data source record
      const ds = await apiPost<DataSource>(`/projects/${projectId}/data-sources`, {
        name: file.name.replace(/\.[^.]+$/, ""),
        type: file.name.toLowerCase().endsWith(".csv") ? "CSV" : "EXCEL",
      });

      // Step 2: Upload file directly
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(`http://localhost:4000/api/v1/projects/${projectId}/data-sources/${ds.id}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('mpc_token')}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.message || 'Upload failed');
      }

      toast({ title: "CSV uploaded", description: "Your data source is being processed.", variant: "default" });
      await fetchDataSources();

      const refreshedDs = await fetchDataSource(ds.id);
      if (refreshedDs) {
        setDataSources((prev) => [refreshedDs, ...prev.filter((item) => item.id !== refreshedDs.id)]);
        setSelectedDataSource(refreshedDs);
        setModalOpen(true);
      }
    } catch (e: unknown) {
      const errorMsg = (e as Error).message;
      setError(errorMsg);
      console.error('Upload failed:', errorMsg);
      toast({ title: "Upload failed", description: errorMsg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Data Sources</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload CSVs or connect APIs to drive your page generation
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading…</>
          ) : (
            <><UploadCloud className="h-4 w-4 mr-2" /> Upload CSV</>
          )}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />
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
      ) : dataSources.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {dataSources.map((ds) => {
                const lastImport = ds.imports?.[0];
                return (
                  <div
                    key={ds.id}
                    onClick={async () => {
                      try {
                        const refreshedDs = await fetchDataSource(ds.id);
                        if (refreshedDs) {
                          setSelectedDataSource(refreshedDs);
                          setModalOpen(true);
                        }
                      } catch {
                        // error state handled in fetchDataSource
                      }
                    }}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-8 w-8 text-green-600" />
                      <div>
                        <h4 className="font-medium">{ds.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {lastImport
                            ? `${lastImport.totalRows} rows · ${lastImport.status} · ${formatDate(lastImport.createdAt)}`
                            : `Added ${formatDate(ds.createdAt)}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`"${ds.name}" delete karna chahte hain?`)) return;
                        setDeletingId(ds.id);
                        try {
                          await apiDelete(`/projects/${projectId}/data-sources/${ds.id}`);
                          setDataSources((prev) => prev.filter((d) => d.id !== ds.id));
                          toast({ title: "Deleted", description: `${ds.name} delete ho gaya.` });
                        } catch (err) {
                          toast({ title: "Delete failed", description: (err as Error).message, variant: "destructive" });
                        } finally {
                          setDeletingId(null);
                        }
                      }}
                      className="ml-4 p-2 rounded-full text-muted-foreground hover:bg-red-50 hover:text-red-500 transition"
                      title="Delete"
                    >
                      {deletingId === ds.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <X className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed shadow-none bg-muted/20">
          <CardContent className="p-12 text-center">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="font-semibold text-lg mb-1">No data sources yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Upload a CSV file to get started.
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <UploadCloud className="h-4 w-4 mr-2" /> Upload CSV
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed shadow-none bg-muted/20">
        <CardContent className="p-12 text-center">
          <Database className="h-10 w-10 text-muted-foreground/50 mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-1">Connect External API</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Pull live data from your CRM or external database directly into your templates.
          </p>
          <Button variant="secondary">Configure Integration</Button>
        </CardContent>
      </Card>

      {modalOpen && selectedDataSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-background shadow-xl">
            <div className="flex items-start justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedDataSource.name}</h3>
                <p className="text-sm text-muted-foreground">Data source preview</p>
              </div>
              <button
                aria-label="Close preview"
                onClick={() => setModalOpen(false)}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              {selectedLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Type</p>
                      <p className="font-medium">{selectedDataSource.type}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Created</p>
                      <p className="font-medium">{formatDate(selectedDataSource.createdAt)}</p>
                    </div>
                  </div>

                  {selectedDataSource.sourceUrl && (
                    <div className="rounded-xl border bg-muted p-4 text-sm">
                      <p className="text-xs uppercase text-muted-foreground">Source file</p>
                      <p className="font-medium break-all">{selectedDataSource.sourceUrl}</p>
                    </div>
                  )}

                  <div className="rounded-xl border bg-muted p-4">
                    <h4 className="font-medium mb-2">Latest import</h4>
                    {selectedDataSource.imports?.[0] ? (
                      <div className="space-y-2 text-sm">
                        <p>Status: {selectedDataSource.imports[0].status}</p>
                        <p>Rows: {selectedDataSource.imports[0].totalRows}</p>
                        <p>Processed: {selectedDataSource.imports[0].processedRows}</p>
                        <p>Date: {formatDate(selectedDataSource.imports[0].createdAt)}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No import preview is available yet. Your upload has been received and will be processed shortly.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
