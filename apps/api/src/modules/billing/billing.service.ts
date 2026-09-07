import {
  Injectable, Logger, BadRequestException,
  NotFoundException, RawBodyRequest,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { WebhookSignatureService } from "../../common/security/webhook-signature.service";
import { AuditService } from "../audit/audit.service";
import { OrgPlan, PLAN_LIMITS, AuditAction } from "@mpc/shared";
import { CreateCheckoutSessionDto, CreatePortalSessionDto } from "./dto/billing.dto";

// =============================================================================
// BILLING SERVICE — Stripe Integration
//
// Flow:
//   1. User clicks "Upgrade" → POST /billing/checkout → Stripe Checkout Session
//   2. User pays on Stripe-hosted page → Stripe redirects to successUrl
//   3. Stripe fires webhook → POST /billing/webhook → we update DB
//   4. User manages subscription → POST /billing/portal → Stripe Customer Portal
//
// Why Stripe Checkout + Portal?
//   - We never handle card data — PCI compliance is Stripe's problem
//   - Checkout handles SCA (Strong Customer Authentication) for EU
//   - Portal handles upgrades, downgrades, cancellations, invoices
//
// Webhook events we handle:
//   checkout.session.completed    → create/update Billing record, upgrade plan
//   customer.subscription.updated → plan change, interval change
//   customer.subscription.deleted → downgrade to FREE
//   invoice.payment_failed        → suspend org after grace period
//
// Price IDs: stored in env vars, not hardcoded.
// Each plan × interval = one Stripe Price ID.
// =============================================================================

// Map plan + interval → Stripe Price ID (set in .env)
const PRICE_ID_MAP: Record<string, string> = {
  STARTER_MONTHLY:  process.env.STRIPE_PRICE_STARTER_MONTHLY  ?? "",
  STARTER_YEARLY:   process.env.STRIPE_PRICE_STARTER_YEARLY   ?? "",
  GROWTH_MONTHLY:   process.env.STRIPE_PRICE_GROWTH_MONTHLY   ?? "",
  GROWTH_YEARLY:    process.env.STRIPE_PRICE_GROWTH_YEARLY    ?? "",
  BUSINESS_MONTHLY: process.env.STRIPE_PRICE_BUSINESS_MONTHLY ?? "",
  BUSINESS_YEARLY:  process.env.STRIPE_PRICE_BUSINESS_YEARLY  ?? "",
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhookSig: WebhookSignatureService,
    private readonly audit: AuditService,
  ) {
    this.stripe = new Stripe(config.get<string>("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
      typescript: true,
    });
  }

  // ── Get current billing status ────────────────────────────────────────────

  async getBillingStatus(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        plan: true,
        billing: {
          select: {
            plan: true, interval: true, status: true,
            currentPeriodEnd: true, cancelAtPeriodEnd: true,
            trialEndsAt: true, stripeSubscriptionId: true,
          },
        },
      },
    });

    if (!org) throw new NotFoundException("Organization not found");

    // Current month usage
    const usage = await this.getMonthlyUsage(orgId);
    const limits = PLAN_LIMITS[org.plan as OrgPlan];

    return {
      plan: org.plan,
      billing: org.billing,
      usage,
      limits,
      // Percentage of limits used — for dashboard progress bars
      usagePercent: {
        pages: limits.maxPagesPerMonth === Infinity
          ? 0
          : Math.round((usage.pages / limits.maxPagesPerMonth) * 100),
        aiTokens: limits.maxAiTokensPerMonth === Infinity
          ? 0
          : Math.round((usage.aiTokens / limits.maxAiTokensPerMonth) * 100),
      },
    };
  }

  // ── Stripe Checkout Session ───────────────────────────────────────────────

  async createCheckoutSession(
    orgId: string,
    userId: string,
    dto: CreateCheckoutSessionDto
  ) {
    if (dto.plan === OrgPlan.FREE) {
      throw new BadRequestException("Cannot checkout for FREE plan");
    }

    const priceKey = `${dto.plan}_${dto.interval}`;
    const priceId = PRICE_ID_MAP[priceKey];

    if (!priceId) {
      throw new BadRequestException(`No price configured for ${priceKey}`);
    }

    // Get or create Stripe customer
    const stripeCustomerId = await this.getOrCreateStripeCustomer(orgId, userId);

    const frontendUrl = this.config.get<string>("FRONTEND_URL");

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: dto.successUrl ?? `${frontendUrl}/settings/billing?success=true`,
      cancel_url: dto.cancelUrl ?? `${frontendUrl}/settings/billing?cancelled=true`,
      // Pass orgId in metadata so webhook can identify the org
      metadata: { orgId, plan: dto.plan, interval: dto.interval },
      subscription_data: {
        metadata: { orgId },
        // 14-day trial for new subscriptions
        trial_period_days: await this.isFirstSubscription(orgId) ? 14 : undefined,
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    return { url: session.url, sessionId: session.id };
  }

  // ── Stripe Customer Portal ────────────────────────────────────────────────

  async createPortalSession(orgId: string, dto: CreatePortalSessionDto) {
    const billing = await this.prisma.billing.findUnique({
      where: { orgId },
      select: { stripeCustomerId: true },
    });

    if (!billing?.stripeCustomerId) {
      throw new BadRequestException("No billing account found. Please subscribe first.");
    }

    const frontendUrl = this.config.get<string>("FRONTEND_URL");

    const session = await this.stripe.billingPortal.sessions.create({
      customer: billing.stripeCustomerId,
      return_url: dto.returnUrl ?? `${frontendUrl}/settings/billing`,
    });

    return { url: session.url };
  }

  // ── Stripe Webhook Handler ────────────────────────────────────────────────

  async handleWebhook(req: RawBodyRequest<Request>): Promise<void> {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = this.config.get<string>("STRIPE_WEBHOOK_SECRET")!;

    // Verify signature — throws if invalid
    this.webhookSig.verifyStripe(req.rawBody!, sig, webhookSecret);

    const event = this.stripe.webhooks.constructEvent(
      req.rawBody!,
      sig,
      webhookSecret
    );

    this.logger.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case "checkout.session.completed":
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await this.onSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await this.onSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await this.onPaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Ignore unhandled events
        break;
    }
  }

  // ── Plan limit enforcement ────────────────────────────────────────────────

  async checkPageLimit(orgId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });

    const plan = (org?.plan ?? "FREE") as OrgPlan;
    const limit = PLAN_LIMITS[plan].maxPagesPerMonth;

    if (limit === Infinity) return;

    const used = await this.getMonthlyUsageValue(orgId, "pages_generated");

    if (used >= limit) {
      throw new BadRequestException(
        `Monthly page limit reached (${used}/${limit}). Upgrade your plan to generate more pages.`
      );
    }
  }

  async checkAiTokenLimit(orgId: string, estimatedTokens: number): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true },
    });

    const plan = (org?.plan ?? "FREE") as OrgPlan;
    const limit = PLAN_LIMITS[plan].maxAiTokensPerMonth;

    if (limit === Infinity) return;

    const used = await this.getMonthlyUsageValue(orgId, "ai_tokens");

    if (used + estimatedTokens > limit) {
      throw new BadRequestException(
        `AI token limit would be exceeded (${used}/${limit}). Upgrade your plan for more AI tokens.`
      );
    }
  }

  // ── Private: Stripe event handlers ───────────────────────────────────────

  private async onCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const orgId = session.metadata?.orgId;
    const plan = session.metadata?.plan as OrgPlan;
    const interval = session.metadata?.interval;

    if (!orgId || !plan) return;

    const subscription = await this.stripe.subscriptions.retrieve(
      session.subscription as string
    );

    await this.upsertBilling(orgId, {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      stripePriceId: subscription.items.data[0]?.price.id,
      plan,
      interval: interval as "MONTHLY" | "YEARLY",
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    });

    this.logger.log(`Checkout completed: org=${orgId} plan=${plan}`);
  }

  private async onSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
    const orgId = sub.metadata?.orgId;
    if (!orgId) return;

    // Determine new plan from price ID
    const priceId = sub.items.data[0]?.price.id;
    const plan = this.planFromPriceId(priceId);

    await this.upsertBilling(orgId, {
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId,
      plan,
      status: sub.status,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
  }

  private async onSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
    const orgId = sub.metadata?.orgId;
    if (!orgId) return;

    // Downgrade to FREE
    await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: orgId },
        data: { plan: "FREE" },
      }),
      this.prisma.billing.updateMany({
        where: { orgId },
        data: { plan: "FREE", status: "canceled", cancelAtPeriodEnd: false },
      }),
    ]);

    this.logger.log(`Subscription cancelled: org=${orgId} → FREE`);
  }

  private async onPaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;

    const billing = await this.prisma.billing.findFirst({
      where: { stripeCustomerId: customerId },
      select: { orgId: true },
    });

    if (!billing) return;

    // After 3 failed payments Stripe cancels — we just log for now
    // In production: send email, show banner in dashboard
    this.logger.warn(`Payment failed for org=${billing.orgId}`);
  }

  // ── Private: helpers ──────────────────────────────────────────────────────

  private async upsertBilling(
    orgId: string,
    data: {
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
      stripePriceId?: string;
      plan: OrgPlan | string;
      interval?: "MONTHLY" | "YEARLY";
      status: string;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      cancelAtPeriodEnd?: boolean;
      trialEndsAt?: Date | null;
    }
  ): Promise<void> {
    const plan = data.plan as OrgPlan;

    await this.prisma.$transaction([
      // Update org plan
      this.prisma.organization.update({
        where: { id: orgId },
        data: { plan },
      }),
      // Upsert billing record
      this.prisma.billing.upsert({
        where: { orgId },
        create: {
          orgId,
          stripeCustomerId: data.stripeCustomerId ?? "",
          stripeSubscriptionId: data.stripeSubscriptionId,
          stripePriceId: data.stripePriceId,
          plan,
          interval: data.interval ?? "MONTHLY",
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          trialEndsAt: data.trialEndsAt,
        },
        update: {
          ...(data.stripeCustomerId && { stripeCustomerId: data.stripeCustomerId }),
          ...(data.stripeSubscriptionId && { stripeSubscriptionId: data.stripeSubscriptionId }),
          ...(data.stripePriceId && { stripePriceId: data.stripePriceId }),
          plan,
          ...(data.interval && { interval: data.interval }),
          status: data.status,
          ...(data.currentPeriodStart && { currentPeriodStart: data.currentPeriodStart }),
          ...(data.currentPeriodEnd && { currentPeriodEnd: data.currentPeriodEnd }),
          ...(data.cancelAtPeriodEnd !== undefined && { cancelAtPeriodEnd: data.cancelAtPeriodEnd }),
          ...(data.trialEndsAt !== undefined && { trialEndsAt: data.trialEndsAt }),
        },
      }),
    ]);
  }

  private async getOrCreateStripeCustomer(orgId: string, userId: string): Promise<string> {
    // Check if customer already exists
    const billing = await this.prisma.billing.findUnique({
      where: { orgId },
      select: { stripeCustomerId: true },
    });

    if (billing?.stripeCustomerId) return billing.stripeCustomerId;

    // Get org + user info for Stripe customer
    const [org, user] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } }),
    ]);

    const customer = await this.stripe.customers.create({
      email: user?.email,
      name: org?.name,
      metadata: { orgId },
    });

    // Store customer ID
    await this.prisma.billing.upsert({
      where: { orgId },
      create: {
        orgId,
        stripeCustomerId: customer.id,
        plan: "FREE",
        status: "active",
      },
      update: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  private async isFirstSubscription(orgId: string): Promise<boolean> {
    const billing = await this.prisma.billing.findUnique({
      where: { orgId },
      select: { stripeSubscriptionId: true },
    });
    return !billing?.stripeSubscriptionId;
  }

  private async getMonthlyUsage(orgId: string) {
    const [pages, aiTokens] = await Promise.all([
      this.getMonthlyUsageValue(orgId, "pages_generated"),
      this.getMonthlyUsageValue(orgId, "ai_tokens"),
    ]);
    return { pages, aiTokens };
  }

  private async getMonthlyUsageValue(orgId: string, metric: string): Promise<number> {
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.usageRecord.aggregate({
      _sum: {
        value: true,
      },
      where: {
        orgId,
        metric,
        date: {
          gte: startOfMonth,
        },
      },
    });
    return result._sum.value ?? 0;
  }

  private planFromPriceId(priceId: string): OrgPlan {
    for (const [key, id] of Object.entries(PRICE_ID_MAP)) {
      if (id === priceId) {
        return key.split("_")[0] as OrgPlan;
      }
    }
    return OrgPlan.FREE;
  }
}
