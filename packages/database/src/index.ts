import type { PrismaClient as PrismaClientType } from "@prisma/client";
import { PrismaClient as PrismaClientCtor } from "@prisma/client";

// In development, Next.js hot reload would create a new PrismaClient on every
// module reload, quickly exhausting the PostgreSQL connection limit.
// We attach the client to the global object in dev to reuse it across reloads.
// In production, module-level singletons are fine — no hot reload.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientType | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClientCtor({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { PrismaClientCtor as PrismaClient };
export * from "@prisma/client";
