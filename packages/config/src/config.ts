import { envSchema, type EnvConfig } from "./schema";

let cachedConfig: EnvConfig | null = null;

/**
 * Validates and returns the application configuration from environment variables.
 * Fails fast with a detailed error message if any required variable is missing or invalid.
 * The result is cached after the first successful validation.
 */
export function loadConfig(): EnvConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `Configuration validation failed. The following environment variables are missing or invalid:\n${issues}\n\nCheck your .env file and ensure all required variables are set correctly.`,
    );
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Returns the cached configuration. Throws if loadConfig() has not been called yet.
 */
export function getConfig(): EnvConfig {
  if (!cachedConfig) {
    throw new Error(
      "Configuration has not been loaded. Call loadConfig() at application startup before accessing configuration.",
    );
  }
  return cachedConfig;
}

/**
 * Returns true if the current environment is production.
 */
export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}