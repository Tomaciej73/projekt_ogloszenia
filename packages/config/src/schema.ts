import { z } from "zod";

export const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // S3 / MinIO
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v: string) => v === "true")
    .pipe(z.boolean())
    .default(true),

  // Authentication
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(16),

  // Token Encryption (32-byte hex string for AES-256-GCM)
  TOKEN_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),

  // Application
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  API_PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive()),
  WEB_PORT: z
    .string()
    .transform(Number)
    .pipe(z.number().int().positive()),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),

  // Provider OAuth App Registration (optional until official API access obtained)
  OLX_CLIENT_ID: z.string().optional(),
  OLX_CLIENT_SECRET: z.string().optional(),
  OLX_CALLBACK_URL: z.string().url().optional(),
  VINTED_CLIENT_ID: z.string().optional(),
  VINTED_CLIENT_SECRET: z.string().optional(),
  VINTED_CALLBACK_URL: z.string().url().optional(),
  FACEBOOK_MARKETPLACE_CLIENT_ID: z.string().optional(),
  FACEBOOK_MARKETPLACE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_MARKETPLACE_CALLBACK_URL: z.string().url().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;