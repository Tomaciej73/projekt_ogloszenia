import { z } from "zod";

function emptyStringToUndefined(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

const requiredStringSchema = z.string().trim().min(1);
const requiredUrlSchema = z.string().trim().url();
const requiredEmailSchema = z.string().trim().email();

const optionalStringSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const optionalUrlSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().url().optional(),
);

const optionalEmailSchema = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().email().optional(),
);

const integerFromEnvSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    return Number.parseInt(value.trim(), 10);
  }

  return value;
}, z.number().int().positive());

const booleanFromEnvSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "true") return true;
    if (normalizedValue === "false") return false;
    if (normalizedValue === "") return undefined;
  }

  return value;
}, z.boolean());

const optionalBooleanFromEnvSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "true") return true;
    if (normalizedValue === "false") return false;
    if (normalizedValue === "") return undefined;
  }

  return value;
}, z.boolean().optional());

function defaultedIntegerFromEnvSchema(defaultValue: number) {
  return z.preprocess((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number.parseInt(value.trim(), 10);
    return undefined;
  }, z.number().int().positive().default(defaultValue));
}

function defaultedBooleanFromEnvSchema(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalizedValue = value.trim().toLowerCase();
      if (normalizedValue === "true") return true;
      if (normalizedValue === "false") return false;
    }
    return undefined;
  }, z.boolean().default(defaultValue));
}

export const baseRuntimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: requiredUrlSchema,
});

export const redisEnvSchema = z.object({
  REDIS_URL: requiredUrlSchema,
});

export const storageEnvSchema = z.object({
  S3_ENDPOINT: requiredUrlSchema,
  S3_REGION: requiredStringSchema.default("us-east-1"),
  S3_BUCKET: requiredStringSchema,
  S3_ACCESS_KEY: requiredStringSchema,
  S3_SECRET_KEY: requiredStringSchema,
  S3_FORCE_PATH_STYLE: booleanFromEnvSchema.default(true),
});

export const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/),
});

export const authRateLimitEnvSchema = z.object({
  AUTH_RATE_LIMIT_WINDOW_MS: integerFromEnvSchema,
  AUTH_RATE_LIMIT_MAX_REQUESTS: integerFromEnvSchema,
  AUTH_LOGIN_RATE_LIMIT_WINDOW_MS: integerFromEnvSchema,
  AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS: integerFromEnvSchema,
  AUTH_REGISTER_RATE_LIMIT_WINDOW_MS: integerFromEnvSchema,
  AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS: integerFromEnvSchema,
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS: integerFromEnvSchema,
  AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS: integerFromEnvSchema,
  AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS: integerFromEnvSchema,
  AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS: integerFromEnvSchema,
  AUTH_ACTIVATE_RATE_LIMIT_WINDOW_MS: integerFromEnvSchema,
  AUTH_ACTIVATE_RATE_LIMIT_MAX_REQUESTS: integerFromEnvSchema,
  AUTH_PASSWORD_RESET_RESEND_COOLDOWN_MS: integerFromEnvSchema,
});

export const passwordSecurityEnvSchema = z.object({
  PASSWORD_BREACH_CHECK_ENABLED: defaultedBooleanFromEnvSchema(true),
  PASSWORD_BREACH_CHECK_FAIL_CLOSED: defaultedBooleanFromEnvSchema(true),
  PASSWORD_BREACH_CHECK_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().url().default("https://api.pwnedpasswords.com/range/"),
  ),
  PASSWORD_BREACH_CHECK_TIMEOUT_MS: defaultedIntegerFromEnvSchema(3000),
});

export const smtpEnvSchema = z.object({
  SMTP_HOST: requiredStringSchema,
  SMTP_PORT: integerFromEnvSchema,
  SMTP_SECURE: optionalBooleanFromEnvSchema,
  SMTP_REQUIRE_TLS: optionalBooleanFromEnvSchema,
  SMTP_TLS_ALLOW_INVALID_CERTS: optionalBooleanFromEnvSchema,
  SMTP_USER: requiredStringSchema,
  SMTP_PASSWORD: requiredStringSchema,
  SMTP_FROM: requiredEmailSchema,
  SMTP_FROM_NAME: optionalStringSchema.default("MultiPortal"),
  SMTP_REPLY_TO: optionalEmailSchema,
  SMTP_SENDER: optionalEmailSchema,
});

export const providerOAuthEnvSchema = z.object({
  OLX_CLIENT_ID: optionalStringSchema,
  OLX_CLIENT_SECRET: optionalStringSchema,
  OLX_CALLBACK_URL: optionalUrlSchema,
  VINTED_CLIENT_ID: optionalStringSchema,
  VINTED_CLIENT_SECRET: optionalStringSchema,
  VINTED_CALLBACK_URL: optionalUrlSchema,
  FACEBOOK_MARKETPLACE_CLIENT_ID: optionalStringSchema,
  FACEBOOK_MARKETPLACE_CLIENT_SECRET: optionalStringSchema,
  FACEBOOK_MARKETPLACE_CALLBACK_URL: optionalUrlSchema,
});

export const appPortsEnvSchema = z.object({
  API_PORT: integerFromEnvSchema,
  WEB_PORT: integerFromEnvSchema,
});

export const publicUrlEnvSchema = z.object({
  API_PUBLIC_URL: optionalUrlSchema,
  WEB_PUBLIC_URL: optionalUrlSchema,
});

export const webProxyEnvSchema = z.object({
  API_PROXY_URL: requiredUrlSchema,
  WEB_PORT: integerFromEnvSchema,
});

export const apiRuntimeEnvSchema = baseRuntimeEnvSchema
  .merge(databaseEnvSchema)
  .merge(redisEnvSchema)
  .merge(storageEnvSchema)
  .merge(authEnvSchema)
  .merge(authRateLimitEnvSchema)
  .merge(passwordSecurityEnvSchema)
  .merge(smtpEnvSchema)
  .merge(appPortsEnvSchema)
  .merge(publicUrlEnvSchema)
  .merge(providerOAuthEnvSchema);

export const workerRuntimeEnvSchema = baseRuntimeEnvSchema.merge(redisEnvSchema);

export const webRuntimeEnvSchema = baseRuntimeEnvSchema.merge(webProxyEnvSchema);

export const prismaEnvSchema = databaseEnvSchema;

export const envSchema = apiRuntimeEnvSchema;

export type BaseRuntimeConfig = z.infer<typeof baseRuntimeEnvSchema>;
export type DatabaseConfig = z.infer<typeof databaseEnvSchema>;
export type RedisConfig = z.infer<typeof redisEnvSchema>;
export type StorageConfig = z.infer<typeof storageEnvSchema>;
export type AuthConfig = z.infer<typeof authEnvSchema>;
export type AuthRateLimitConfig = z.infer<typeof authRateLimitEnvSchema>;
export type PasswordSecurityConfig = z.infer<typeof passwordSecurityEnvSchema>;
export type SmtpConfig = z.infer<typeof smtpEnvSchema>;
export type ProviderOAuthConfig = z.infer<typeof providerOAuthEnvSchema>;
export type AppPortsConfig = z.infer<typeof appPortsEnvSchema>;
export type PublicUrlConfig = z.infer<typeof publicUrlEnvSchema>;
export type WebProxyConfig = z.infer<typeof webProxyEnvSchema>;
export type ApiRuntimeConfig = z.infer<typeof apiRuntimeEnvSchema>;
export type WorkerRuntimeConfig = z.infer<typeof workerRuntimeEnvSchema>;
export type WebRuntimeConfig = z.infer<typeof webRuntimeEnvSchema>;
export type PrismaRuntimeConfig = z.infer<typeof prismaEnvSchema>;
export type EnvConfig = ApiRuntimeConfig;
