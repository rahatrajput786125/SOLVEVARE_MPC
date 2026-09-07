"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/card";
import { apiGet, apiPatch } from "@/lib/api";
import { toast } from "@/components/ui/toaster";
import { Loader2 } from "lucide-react";

const MODEL_OPTIONS = [
  { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "claude-3-haiku-20240307", label: "Claude 3 Haiku" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

interface AiSettings {
  defaultModel?: string;
  temperature?: number;
  maxTokens?: number;
}

export default function AISettingsPage() {
  const params = useParams<{ id?: string }>();
  const projectId = params?.id;

  const [settings, setSettings] = useState<AiSettings>({ defaultModel: "claude-3-5-sonnet-20241022", temperature: 0.7, maxTokens: 1000 });
  const [loading, setLoading] = useState(!!projectId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    apiGet<{ settings: { ai?: AiSettings } }>(`/projects/${projectId}`)
      .then((res) => setSettings(res.settings?.ai ?? settings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  async function handleSave() {
    if (!projectId) {
      toast({ title: "No project selected", description: "Open AI settings from within a project.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiPatch(`/ai/projects/${projectId}/settings`, settings);
      toast({ title: "AI settings saved" });
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>Manage AI models and generation settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Default Language Model</Label>
            <select
              className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={settings.defaultModel ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, defaultModel: e.target.value }))}
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Temperature ({settings.temperature ?? 0.7})</Label>
            <input
              type="range"
              min={0} max={2} step={0.1}
              value={settings.temperature ?? 0.7}
              onChange={(e) => setSettings((s) => ({ ...s, temperature: parseFloat(e.target.value) }))}
              className="w-full max-w-sm"
            />
            <p className="text-xs text-muted-foreground">Lower = more focused, Higher = more creative</p>
          </div>

          <div className="space-y-2">
            <Label>Max Tokens</Label>
            <input
              type="number"
              min={100} max={4000}
              value={settings.maxTokens ?? 1000}
              onChange={(e) => setSettings((s) => ({ ...s, maxTokens: parseInt(e.target.value, 10) }))}
              className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <Button onClick={handleSave} loading={saving}>Save Preferences</Button>
        </CardContent>
      </Card>
    </div>
  );
}
