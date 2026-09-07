import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@mpc/shared";
import { ROLES_KEY } from "../decorators";

// Role hierarchy — higher index = more permissions
// A user with ORG_OWNER can access routes requiring ORG_ADMIN or ORG_MEMBER
const ROLE_HIERARCHY: UserRole[] = [
  UserRole.ORG_VIEWER,
  UserRole.ORG_MEMBER,
  UserRole.ORG_ADMIN,
  UserRole.ORG_OWNER,
  UserRole.SUPER_ADMIN,
];

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    // No @Roles() decorator = any authenticated user can access
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException("No user context");

    const userRoleIndex = ROLE_HIERARCHY.indexOf(user.role as UserRole);
    const hasPermission = requiredRoles.some(
      (role) => userRoleIndex >= ROLE_HIERARCHY.indexOf(role)
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Requires one of: ${requiredRoles.join(", ")}`
      );
    }

    return true;
  }
}
