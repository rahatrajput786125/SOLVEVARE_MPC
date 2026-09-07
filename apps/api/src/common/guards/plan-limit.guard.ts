import {
  Injectable, CanActivate, ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { BillingService } from "../../modules/billing/billing.service";

// =============================================================================
// PLAN LIMIT GUARD
//
// Checks plan limits BEFORE allowing generation/AI requests.
// Applied per-route with @CheckLimit() decorator.
//
// Usage:
//   @CheckLimit("pages")
//   @UseGuards(PlanLimitGuard)
//   async generatePages() { ... }
//
// Why a guard instead of service-level check?
// Guards run before the controller — fail fast before any DB work.
// Also keeps limit logic out of business logic (separation of concerns).
//
// On limit exceeded: throws 402 Payment Required
// Why 402? It's the semantically correct HTTP status for "pay to continue".
// The frontend shows an upgrade prompt when it receives 402.
// =============================================================================

export const CHECK_LIMIT_KEY = "check_limit";
export type LimitType = "pages" | "ai_tokens";
export const CheckLimit = (type: LimitType) =>
  SetMetadata(CHECK_LIMIT_KEY, type);

@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    private readonly billingService: BillingService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limitType = this.reflector.getAllAndOverride<LimitType>(
      CHECK_LIMIT_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!limitType) return true;

    const request = context.switchToHttp().getRequest<{
      user?: { orgId: string };
    }>();

    const orgId = request.user?.orgId;
    if (!orgId) return true; // JWT guard handles unauthenticated

    if (limitType === "pages") {
      // Throws BadRequestException if limit exceeded
      await this.billingService.checkPageLimit(orgId);
    }

    if (limitType === "ai_tokens") {
      // Estimate ~500 tokens per AI request
      await this.billingService.checkAiTokenLimit(orgId, 500);
    }

    return true;
  }
}
