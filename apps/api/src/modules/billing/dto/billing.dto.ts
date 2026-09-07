import { IsEnum, IsString, IsOptional } from "class-validator";
import { OrgPlan } from "@mpc/shared";

export enum BillingIntervalDto {
  MONTHLY = "MONTHLY",
  YEARLY = "YEARLY",
}

export class CreateCheckoutSessionDto {
  @IsEnum(OrgPlan)
  plan: OrgPlan;

  @IsEnum(BillingIntervalDto)
  interval: BillingIntervalDto;

  // Where to redirect after successful payment
  @IsString()
  @IsOptional()
  successUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;
}

export class CreatePortalSessionDto {
  @IsString()
  @IsOptional()
  returnUrl?: string;
}
