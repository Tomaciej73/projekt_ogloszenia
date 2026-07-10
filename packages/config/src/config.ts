import type { ZodType } from "zod";
import {
  apiRuntimeEnvSchema,
  envSchema,
  prismaEnvSchema,
  webRuntimeEnvSchema,
  workerRuntimeEnvSchema,
  type ApiRuntimeConfig,
  type EnvConfig,
  type PrismaRuntimeConfig,
  type WebRuntimeConfig,
  type WorkerRuntimeConfig,
} from "./schema";

const configCache = new Map<string, unknown>();
const API_CACHE_KEY = "api";

function formatConfigIssues(label: string, issues: Array<{ path: Array<string | number>; message: string }>): string {
  const formattedIssues = issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");

  return [
    `Configuration validation failed for ${label}.`,
    "The following environment variables are missing or invalid:",
    formattedIssues,
    "",
    "Check your .env file and container environment before starting the process.",
  ].join("\n");
}

function loadRuntimeConfig<T>(cacheKey: string, label: string, schema: ZodType<T>): T {
  const cachedConfig = configCache.get(cacheKey);
  if (cachedConfig) {
    return cachedConfig as T;
  }

  const result = schema.safeParse(process.env);

  if (!result.success) {
    throw new Error(formatConfigIssues(label, result.error.issues));
  }

  configCache.set(cacheKey, result.data);
  return result.data;
}

export function loadApiConfig(): ApiRuntimeConfig {
  return loadRuntimeConfig(API_CACHE_KEY, "the API runtime", apiRuntimeEnvSchema);
}

export function loadWorkerConfig(): WorkerRuntimeConfig {
  return loadRuntimeConfig("worker", "the worker runtime", workerRuntimeEnvSchema);
}

export function loadWebConfig(): WebRuntimeConfig {
  return loadRuntimeConfig("web", "the web runtime", webRuntimeEnvSchema);
}

export function loadPrismaConfig(): PrismaRuntimeConfig {
  return loadRuntimeConfig("prisma", "Prisma", prismaEnvSchema);
}

/**
 * Backward-compatible alias for the API runtime loader.
 */
export function loadConfig(): EnvConfig {
  return loadApiConfig();
}

/**
 * Returns the cached API configuration. Throws if loadConfig() / loadApiConfig()
 * has not been called yet.
 */
export function getConfig(): EnvConfig {
  const cachedConfig = configCache.get(API_CACHE_KEY);

  if (!cachedConfig) {
    throw new Error(
      "Configuration has not been loaded. Call loadConfig() or loadApiConfig() at application startup before accessing configuration.",
    );
  }

  return cachedConfig as EnvConfig;
}

/**
 * Returns true if the current API runtime environment is production.
 */
export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export { envSchema };
