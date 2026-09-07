import { IsEmail, IsEnum, IsOptional, IsString } from "class-validator";
import { UserRole } from "@mpc/shared";

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.ORG_MEMBER;
}

export class UpdateMemberRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateOrgDto {
  @IsString()
  @IsOptional()
  name?: string;
}
