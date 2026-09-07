import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import { UserRole } from "@mpc/shared";
import { JwtPayload } from "@mpc/shared";

// Pulls the authenticated user from the request.
// Usage: @GetUser() user: JwtPayload
export const GetUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  }
);

// Pulls the active org ID from the JWT payload.
// Usage: @OrgId() orgId: string
export const OrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.orgId;
  }
);

// Metadata key for RBAC guard
export const ROLES_KEY = "roles";

// Marks a route as requiring specific roles.
// Usage: @Roles(UserRole.ORG_ADMIN, UserRole.ORG_OWNER)
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// Marks a route as public (skips JWT guard).
// Usage: @Public() on login/register endpoints
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
