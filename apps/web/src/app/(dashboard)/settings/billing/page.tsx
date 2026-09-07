"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Zap, CreditCard, FileText, Users, Globe, ExternalLink } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber, formatCost } from "@/lib/utils";

interface BillingStatus {
  plan: string;
  billing: {
    plan: string;
    interval: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEndsAt: string | null;
    stripeSubscriptionId: string | null;
  } | null;
  usage: { pages: number; aiTokens: number };
  limits: {
    maxPagesPerMonth: number;
    maxAiTokensPerMonth: number;
    maxProjects: number;
    maxTeamMembers: number;
    canUseCustomDomains: boolean;
    canUseWebhooks: boolean;
    canUseApiKeys: boolean;
  };
  usagePercent: { pages: number; aiTokens: number };
}

const PLAN_DISPLAY: Record<string, { label: string; color: string }> = {
  FREE:       { label: "Free",       color: "text-muted-foreground" },
  STARTER:    { label: "Starter",    color: "text-blue-500" },
  GROWTH:     { label: "Growth",     color: "text-violet-500" },
  BUSINESS:   { label: "Business",   color: "text-amber-500" },
  ENTERPRISE: { label: "Enterprise", color: "text-emerald-500" },
};

export default function BillingPage() {
  const org = useAuthStore((s) => s.org);
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  const { data, isLoading } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => apiGet<BillingStatus>("/billing/status"),
  });

  const checkoutMutation = useMutation({
    mutationFn: (plan: string) =>
      apiPost<{ url: string }>("/billing/checkout", { plan, interval }),
    onSuccess: ({ url }) => { if (url) window.location.href = url; },
  });

  const portalMutation = useMutation({
    mutationFn: () => apiPost<{ url: string }>("/billing/portal", {}),
    onSuccess: ({ url }) => { if (url) window.location.href = url; },
  });

  if (isLoading) return <BillingSkeleton />;
  if (!data) return <BillingSkeleton />;

  const b = data;
  const planInfo = PLAN_DISPLAY[b.plan] ?? PLAN_DISPLAY.FREE;
  const hasSubscription = !!b.billing?.stripeSubscriptionId;
  const isFree = b.plan === "FREE";

  const periodEnd = b.billing?.currentPeriodEnd
    ? new Date(b.billing.currentPeriodEnd).toLocaleDateString()
    : null;
  const trialEnd = b.billing?.trialEndsAt
    ? new Date(b.billing.trialEndsAt).toLocaleDateString()
    : null;

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Current Plan
          </CardTitle>
          <CardDescription>{org?.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xl font-bold ${planInfo.color}`}>{planInfo.label}</p>
              {b.billing && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {b.billing.interval === "YEARLY" ? "Billed yearly" : "Billed monthly"}
                  {periodEnd && ` · renews ${periodEnd}`}
                  {b.billing.cancelAtPeriodEnd && " · cancels at period end"}
                </p>
              )}
              {trialEnd && (
                <p className="text-xs text-amber-500 mt-0.5">Trial ends {trialEnd}</p>
              )}
            </div>
            {hasSubscription ? (
              <Button
                variant="outline"
                size="sm"
                loading={portalMutation.isPending}
                onClick={() => portalMutation.mutate()}
              >
                Manage subscription <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setInterval(interval === "MONTHLY" ? "YEARLY" : "MONTHLY")}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  {interval === "YEARLY" ? "Switch to monthly" : "Switch to yearly (save 20%)"}
                </button>
                <Button
                  size="sm"
                  loading={checkoutMutation.isPending}
                  onClick={() => checkoutMutation.mutate("STARTER")}
                >
                  Upgrade
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" /> Usage This Month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <UsageBar
            label="Pages generated"
            used={b.usage.pages}
            limit={b.limits.maxPagesPerMonth}
            pct={b.usagePercent.pages}
            icon={FileText}
          />
          <UsageBar
            label="AI tokens"
            used={b.usage.aiTokens}
            limit={b.limits.maxAiTokensPerMonth}
            pct={b.usagePercent.aiTokens}
            icon={Zap}
          />
        </CardContent>
      </Card>

      {/* Plan features */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <FeatureRow label="Projects" value={limitLabel(b.limits.maxProjects)} icon={FileText} />
            <FeatureRow label="Team members" value={limitLabel(b.limits.maxTeamMembers)} icon={Users} />
            <FeatureRow label="Custom domains" value={b.limits.canUseCustomDomains ? "Yes" : "No"} icon={Globe} />
            <FeatureRow label="Webhooks" value={b.limits.canUseWebhooks ? "Yes" : "No"} icon={Zap} />
          </div>
          {isFree && (
            <div className="mt-4 rounded-md bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              Upgrade to unlock more pages, AI tokens, team members, and advanced features.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function UsageBar({
  label, used, limit, pct, icon: Icon,
}: {
  label: string; used: number; limit: number; pct: number; icon: React.ElementType;
}) {
  const isUnlimited = limit === Infinity || limit > 10_000_000;
  const barColor = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {label}
        </span>
        <span className="font-medium">
          {formatNumber(used)}{isUnlimited ? "" : ` / ${formatNumber(limit)}`}
          {isUnlimited && <span className="text-muted-foreground ml-1 font-normal">unlimited</span>}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function FeatureRow({
  label, value, icon: Icon,
}: {
  label: string; value: string; icon: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground flex-1">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function limitLabel(n: number): string {
  return n === Infinity || n > 10_000_000 ? "Unlimited" : formatNumber(n);
}

function BillingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-36 bg-muted rounded-lg" />
      <div className="h-40 bg-muted rounded-lg" />
      <div className="h-44 bg-muted rounded-lg" />
    </div>
  );
}
