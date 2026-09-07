import {
  Controller, Get, Post, Body,
  Req, Headers, RawBodyRequest,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { Request } from "express";
import { BillingService } from "./billing.service";
import { CreateCheckoutSessionDto, CreatePortalSessionDto } from "./dto/billing.dto";
import { OrgId, GetUser, Public, Roles } from "../../common/decorators";
import { UserRole, JwtPayload } from "@mpc/shared";

@ApiTags("billing")
@ApiBearerAuth()
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Current billing status + usage + limits
  @Get()
  @Get("status")
  getStatus(@OrgId() orgId: string) {
    return this.billingService.getBillingStatus(orgId);
  }

  // Create Stripe Checkout Session → returns redirect URL
  @Post("checkout")
  @Roles(UserRole.ORG_OWNER)
  createCheckout(
    @Body() dto: CreateCheckoutSessionDto,
    @OrgId() orgId: string,
    @GetUser() user: JwtPayload
  ) {
    return this.billingService.createCheckoutSession(orgId, user.sub, dto);
  }

  // Create Stripe Customer Portal Session → returns redirect URL
  @Post("portal")
  @Roles(UserRole.ORG_OWNER)
  createPortal(
    @Body() dto: CreatePortalSessionDto,
    @OrgId() orgId: string
  ) {
    return this.billingService.createPortalSession(orgId, dto);
  }

  // Stripe webhook — must be @Public() and use raw body
  // Nginx/Express must NOT parse this body — Stripe signature needs raw bytes
  @Post("webhook")
  @Public()
  handleWebhook(@Req() req: RawBodyRequest<Request>) {
    return this.billingService.handleWebhook(req);
  }
}
