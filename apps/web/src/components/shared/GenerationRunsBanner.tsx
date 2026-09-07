"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, X } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GenerationRun {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED" | "CANCELLED";
  totalRows: number;
  processedRows: number;
  generatedPages: number;
  failedPages: number;
  totalChunks: number;
  doneChunks: number;
  progressPct: number;
  estimatedRemainingMs: number | null;
  estimatedCompletionTime: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface Props {
  projectId: string;
}

const TERMINAL = new Set(["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"]);
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

function fmt(n: number) { return n.toLocaleString(); }

function fmtMs(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `~${s}s`;
  if (s < 3600) return `~${Math.ceil(s / 60)}m`;
  return `~${(s / 3600).toFixed(1)}h`;
}

// ── SSE hook — one EventSource per active run ─────────────────────────────────

function useRunStream(
  runId: string,
  enabled: boolean,
  onUpdate: (run: GenerationRun) => void
) {
  useEffect(() => {
    if (!enabled) return;
    const token = typeof window !== "undefined" ? localStorage.getItem("mpc_token") : null;

    // EventSource doesn't support custom headers natively; pass token as query param.
    // The API reads it from ?token= only for SSE routes (not exposed elsewhere).
    const url = `${API_BASE}/generation-runs/${runId}/stream${token ? `?token=${token}` : ""}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const run: GenerationRun = JSON.parse(e.data);
        onUpdate(run);
        if (TERMINAL.has(run.status)) es.close();
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => es.close();

    return () => es.close();
  }, [runId, enabled, onUpdate]);
}

// ── Banner ────────────────────────────────────────────────────────────────────

export function GenerationRunsBanner({ projectId }: Props) {
  const queryClient = useQueryClient();

  // Initial fetch — discovers which runs are active on mount.
  // After that, SSE streams keep individual run state up to date.
  const { data: runs = [] } = useQuery<GenerationRun[]>({
    queryKey: ["generation-runs", projectId],
    queryFn: () => apiGet<GenerationRun[]>("/generation-runs", { projectId }),
    // Only re-poll every 30 s as a heartbeat; SSE handles live updates
    refetchInterval: (query) => {
      const data = query.state.data ?? [];
      const hasActive = data.some((r) => !TERMINAL.has(r.status));
      return hasActive ? 5_000 : 30_000;
    },
    staleTime: 0,
  });

  // Local overrides: SSE events patch individual runs in place without a full refetch
  const [liveRuns, setLiveRuns] = useState<Map<string, GenerationRun>>(new Map());

  const patchRun = useCallback((run: GenerationRun) => {
    setLiveRuns((prev) => new Map(prev).set(run.id, run));

    if (run.status === "COMPLETED" || run.status === "PARTIAL") {
      // Refresh page counts after generation finishes
      queryClient.invalidateQueries({ queryKey: ["pages-by-template", projectId] });
    }
  }, [projectId, queryClient]);

  // Merge server list with live SSE patches
  const merged: GenerationRun[] = runs.map((r) => liveRuns.get(r.id) ?? r);

  // Show active runs + recently finished (< 15 s)
  const visible = merged.filter((r) => {
    if (!TERMINAL.has(r.status)) return true;
    if (!r.completedAt) return true;
    return Date.now() - new Date(r.completedAt).getTime() < 15_000;
  });

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {visible.map((run) => (
        <RunCard key={run.id} run={run} projectId={projectId} onUpdate={patchRun} />
      ))}
    </div>
  );
}

// ── Single run card ───────────────────────────────────────────────────────────

function RunCard({
  run,
  projectId,
  onUpdate,
}: {
  run: GenerationRun;
  projectId: string;
  onUpdate: (r: GenerationRun) => void;
}) {
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const isActive = !TERMINAL.has(run.status);

  // Subscribe to SSE for this run while it's active
  useRunStream(run.id, isActive, onUpdate);

  async function handleCancel() {
    setCancelling(true);
    try {
      const updated = await apiPatch<GenerationRun>(`/generation-runs/${run.id}/cancel`);
      onUpdate(updated);
      queryClient.invalidateQueries({ queryKey: ["generation-runs", projectId] });
    } catch { /* ignore */ }
    finally { setCancelling(false); }
  }

  const remaining = run.totalChunks - run.doneChunks;

  // Throughput: pages/sec over the last observed window
  const throughput = (() => {
    if (!run.startedAt || run.processedRows === 0) return null;
    const elapsedSec = (Date.now() - new Date(run.startedAt).getTime()) / 1000;
    if (elapsedSec < 1) return null;
    const pps = run.processedRows / elapsedSec;
    return pps >= 1 ? `${Math.round(pps)}/s` : `${(pps * 60).toFixed(1)}/min`;
  })();

  const borderCls =
    run.status === "COMPLETED" ? "bg-green-50 border-green-200"
    : run.status === "PARTIAL"  ? "bg-yellow-50 border-yellow-200"
    : run.status === "FAILED"   ? "bg-red-50 border-red-200"
    : run.status === "CANCELLED"? "bg-gray-50 border-gray-200"
    :                             "bg-blue-50 border-blue-200";

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${borderCls}`}>
      {/* Row 1: icon + summary + cancel */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {run.status === "COMPLETED" ? (
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          ) : run.status === "PARTIAL" ? (
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
          ) : run.status === "FAILED" ? (
            <XCircle className="h-4 w-4 text-red-600 shrink-0" />
          ) : run.status === "CANCELLED" ? (
            <XCircle className="h-4 w-4 text-gray-500 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 text-blue-600 shrink-0 animate-spin" />
          )}

          <span className="font-medium truncate">
            {run.status === "QUEUED" && "Queued — waiting for worker…"}
            {run.status === "PROCESSING" && (
              <>
                {fmt(run.generatedPages)}{" "}
                <span className="text-muted-foreground font-normal">
                  / {fmt(run.totalRows)} pages
                </span>
              </>
            )}
            {run.status === "COMPLETED" && (
              <span className="text-green-700">✓ {fmt(run.generatedPages)} pages generated</span>
            )}
            {run.status === "PARTIAL" && (
              <span className="text-yellow-700">
                ⚠ Partial — {fmt(run.generatedPages)} generated, {fmt(run.failedPages)} failed
              </span>
            )}
            {run.status === "FAILED" && <span className="text-red-700">Generation failed</span>}
            {run.status === "CANCELLED" && <span className="text-gray-600">Cancelled</span>}
          </span>

          {run.status === "PROCESSING" && (
            <span className="text-blue-700 font-semibold shrink-0">{run.progressPct}%</span>
          )}
        </div>

        {isActive && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="text-muted-foreground hover:text-foreground shrink-0 disabled:opacity-40"
            title="Cancel generation"
          >
            {cancelling
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <X className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Row 2: progress bar */}
      {(isActive || run.status === "COMPLETED") && (
        <div className="mt-2 h-1.5 w-full bg-white/70 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              run.status === "COMPLETED" ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${run.progressPct}%` }}
          />
        </div>
      )}

      {/* Row 3: live stats */}
      {run.status === "PROCESSING" && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-blue-700">
          <span>Chunks: {run.doneChunks}/{run.totalChunks}</span>
          <span>Remaining: {remaining}</span>
          {throughput && <span>{throughput}</span>}
          {run.failedPages > 0 && (
            <span className="text-red-600">Failed: {fmt(run.failedPages)}</span>
          )}
          {run.estimatedRemainingMs != null && run.estimatedRemainingMs > 0 && (
            <span>ETA: {fmtMs(run.estimatedRemainingMs)}</span>
          )}
        </div>
      )}
    </div>
  );
}
