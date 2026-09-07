"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Plus, FolderOpen, FileText, ArrowRight, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { Input, Label, Card, CardContent, CardHeader, CardTitle, CardDescription, Badge } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";

interface Project {
  id: string; name: string; slug: string; description: string | null;
  status: string; createdAt: string;
  _count: { templates: number; dataSources: number };
}

const createSchema = z.object({
  name: z.string().min(2, "Name required"),
  description: z.string().optional(),
});
type CreateForm = z.infer<typeof createSchema>;

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const qc = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project deleted" });
      setDeletingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setDeletingId(null);
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<{ items: Project[]; meta: unknown }>("/projects"),
    staleTime: 0,
  });

  const projects = data?.items ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => apiPost("/projects", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast({ title: "Project created" });
      setShowCreate(false);
      reset();
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Each project has its own templates, data sources, and generated pages
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Project
        </Button>
      </div>

      {/* Create form inline card */}
      {showCreate && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="text-base">New Project</CardTitle>
          </CardHeader>
          <form onSubmit={handleSubmit((d) => createMutation.mutate(d))}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project name</Label>
                  <Input placeholder="e.g. Plumber Pages US" {...register("name")} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input placeholder="What is this project for?" {...register("description")} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={createMutation.isPending}>
                  Create Project
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => { setShowCreate(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </form>
        </Card>
      )}

      {/* Projects grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <FolderOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first project to get started</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> Create Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onDelete={() => setDeletingId(project.id)}
            />
          ))}
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold">Delete Project</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {projects.find((p) => p.id === deletingId)?.name}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This will permanently delete the project along with all its templates, data sources, and generated pages. This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingId(null)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingId)}
              >
                Delete Project
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Project; onDelete: () => void }) {
  return (
    <div className="relative group">
      <Link href={`/projects/${project.id}`}>
        <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full">
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <Badge variant={project.status === "ACTIVE" ? "default" : "secondary"} className="text-xs">
                {project.status.toLowerCase()}
              </Badge>
            </div>

            <h3 className="font-semibold mb-1">{project.name}</h3>
            {project.description && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{project.description}</p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-4 pt-4 border-t">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {project._count.templates} templates
              </span>
              <ArrowRight className="h-3 w-3 ml-auto" />
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Delete button — bottom-right corner, visible on hover */}
      <button
        onClick={(e) => { e.preventDefault(); onDelete(); }}
        className="absolute bottom-3 right-3 z-10 h-9 w-9 rounded-md flex items-center justify-center bg-background border border-border text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive hover:text-white hover:border-destructive transition-all"
        title="Delete project"
      >
        <Trash2 className="h-5 w-5" />
      </button>
    </div>
  );
}
