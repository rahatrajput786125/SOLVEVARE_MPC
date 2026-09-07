import { z } from "zod";

// Validate all required env vars at startup.
// Optional keys are allowed to be empty in development mode.
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  // Read replica is optional in development
  DATABASE_READ_URL: z.string().optional(),

  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(1).default("dev-jwt-secret-at-least-32-chars-long!!"),
  JWT_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().min(1).default("dev-refresh-secret-at-least-32-chars!"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  // OpenAI — optional in development
  OPENAI_API_KEY: z.string().default(""),

  // Stripe — optional in development
  STRIPE_SECRET_KEY: z.string().default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().default("whsec_placeholder"),

  // Encryption — optional in development
  ENCRYPTION_KEY: z.string().default("dev-encryption-key-32-chars-long"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    // Format Zod errors into a readable startup message
    const errors = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }
  return result.data;
}
