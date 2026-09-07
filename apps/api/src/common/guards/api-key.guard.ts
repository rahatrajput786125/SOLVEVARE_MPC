import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiKeyService, ApiKeyScope } from "../security/api-key.service";
import { IS_PUBLIC_KEY } from "../decorators";

// =============================================================================
// API KEY GUARD
//
// Authenticates requests using the X-API-Key header.
// Works alongside JwtAuthGuard — if JWT fails, this guard tries API key.
//
// Usage:
//   @UseGuards(ApiKeyGuard)
//   @RequireScope("pages:read")
//   async getPages() { ... }
//
// Or globally: add to APP_GUARD providers in AppModule.
//
// Request flow:
//   1. Check for X-API-Key header
//   2. Validate key via ApiKeyService (DB lookup by hash)
//   3. Check scope if @RequireScope() decorator present
//   4. Attach { orgId, userId, scopes } to request.user
// =============================================================================

export const REQUIRE_SCOPE_KEY = "require_scope";
export const RequireScope = (scope: ApiKeyScope) =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@nestjs/common").SetMetadata(REQUIRE_SCOPE_KEY, scope);

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip public routes
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: Record<string, unknown>;
    }>();

    const apiKey = request.headers["x-api-key"];

    // No API key header — let JWT guard handle it
    if (!apiKey) return true;

    // Validate the key
    const keyContext = await this.apiKeyService.validateKey(apiKey);

    // Check required scope
    const requiredScope = this.reflector.getAllAndOverride<ApiKeyScope>(
      REQUIRE_SCOPE_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (requiredScope && !this.apiKeyService.hasScope(keyContext.scopes, requiredScope)) {
      throw new UnauthorizedException(
        `API key missing required scope: ${requiredScope}`
      );
    }

    // Attach to request — same shape as JWT payload for compatibility
    request.user = {
      sub: keyContext.userId,
      orgId: keyContext.orgId,
      scopes: keyContext.scopes,
      authMethod: "api_key",
    };

    return true;
  }
}
