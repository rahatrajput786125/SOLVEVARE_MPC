"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/card";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { toast } from "@/components/ui/toaster";
import { Loader2, Trash2 } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";

interface Member {
  id: string;
  role: string;
  joinedAt: string;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
}

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
}

export default function TeamSettingsPage() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [inviteEmail, setInviteEmail] = useState("");

  const { data: members, isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: () => apiGet<{ members: Member[]; invites: Invite[] }>("/team"),
  });

  const inviteMutation = useMutation({
    mutationFn: (email: string) => apiPost("/team/invite", { email, role: "ORG_MEMBER" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Invite sent", description: `Invitation sent to ${inviteEmail}` });
      setInviteEmail("");
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) => apiDelete(`/team/members/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members"] });
      toast({ title: "Member removed" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>Manage who has access to your workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Email address"
              className="max-w-sm"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inviteEmail && inviteMutation.mutate(inviteEmail)}
            />
            <Button
              loading={inviteMutation.isPending}
              disabled={!inviteEmail}
              onClick={() => inviteMutation.mutate(inviteEmail)}
            >
              Invite
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mt-4 border rounded-md">
              {members?.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4 border-b last:border-0">
                  <div>
                    <p className="font-medium">{member.user.name ?? member.user.email}</p>
                    <p className="text-sm text-muted-foreground">{member.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-1 bg-muted rounded-full font-medium">
                      {member.role.replace("ORG_", "").toLowerCase()}
                    </span>
                    {member.user.id !== currentUser?.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        loading={removeMutation.isPending}
                        onClick={() => removeMutation.mutate(member.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {members?.invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between p-4 border-b last:border-0 bg-muted/20">
                  <div>
                    <p className="font-medium text-muted-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">Invite pending</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full font-medium">
                    pending
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
