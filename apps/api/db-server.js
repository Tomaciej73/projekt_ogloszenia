const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Queue } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { config } = require("./runtime-config");
const { ensureBucket, minioClient, BUCKET } = require("./minio");
const { sendPasswordResetEmail, sendAccountActivationEmail, formatMailDeliveryResult } = require("./mail");
const { APP_VERSION } = require("../../packages/config/app-version");

const REDIS_URL = config.REDIS_URL;
const publicationQueue = new Queue("publication", { connection: { url: REDIS_URL } });
const publicationQueueRedisClientPromise = publicationQueue.client;

const JWT_SECRET = config.JWT_SECRET;
const JWT_EXPIRY = "24h";

const pool = new Pool({ connectionString: config.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JSON_SPACES = 2;
const KILOBYTE = 1024;
const MEGABYTE = 1024 * KILOBYTE;
const RESET_EXPIRY_MS = 3600000;
const ACTIVATION_EXPIRY_MS = 3600000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_RESET_ATTEMPTS = 5;
const MEDIA_PROXY_PREFIX = "/media-files";
const AUTH_COOKIE_NAME = "mp_auth";
const CSRF_COOKIE_NAME = "mp_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const AUTH_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_JSON_BODY_LIMIT_BYTES = 1 * MEGABYTE;
const MAX_UPLOAD_BASE64_BODY_BYTES = Math.ceil(MAX_UPLOAD_FILE_SIZE_BYTES / 3) * 4;
const UPLOAD_JSON_BODY_LIMIT_BYTES = MAX_UPLOAD_BASE64_BODY_BYTES + 256 * KILOBYTE;
const MAX_IMAGE_DIMENSION = 12000;
const ALLOWED_IMAGE_FILE_TYPES_LABEL = "JPG, PNG, GIF, or WebP";
const INACTIVE_LOGIN_MESSAGE = "Your account is not active yet. Check your email for the activation link or use Forgot password to activate your account.";
const INACTIVE_REGISTER_MESSAGE = "An account with this email already exists but is not active. Use Forgot password to activate your account and set a new password.";
const LOCKED_LOGIN_MESSAGE = "Your account is locked after 5 failed login attempts. Use Forgot password to unlock your account and set a new password.";
const AUTH_RATE_LIMIT_WINDOW_MS = config.AUTH_RATE_LIMIT_WINDOW_MS;
const AUTH_RATE_LIMIT_MAX_REQUESTS = config.AUTH_RATE_LIMIT_MAX_REQUESTS;
const AUTH_LOGIN_RATE_LIMIT_WINDOW_MS = config.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS;
const AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS = config.AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS;
const AUTH_REGISTER_RATE_LIMIT_WINDOW_MS = config.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS;
const AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS = config.AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS;
const AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS = config.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS;
const AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS = config.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS;
const AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS = config.AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS;
const AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS = config.AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS;
const AUTH_ACTIVATE_RATE_LIMIT_WINDOW_MS = config.AUTH_ACTIVATE_RATE_LIMIT_WINDOW_MS;
const AUTH_ACTIVATE_RATE_LIMIT_MAX_REQUESTS = config.AUTH_ACTIVATE_RATE_LIMIT_MAX_REQUESTS;
const AUTH_PASSWORD_RESET_RESEND_COOLDOWN_MS = config.AUTH_PASSWORD_RESET_RESEND_COOLDOWN_MS;

class RequestBodyTooLargeError extends Error {
  constructor(limitBytes) {
    super(`Request body exceeds the configured limit of ${limitBytes} bytes.`);
    this.name = "RequestBodyTooLargeError";
    this.code = "REQUEST_BODY_TOO_LARGE";
    this.limitBytes = limitBytes;
  }
}

function getBaseSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

function normalizeOrigin(value) {
  if (typeof value !== "string") return null;

  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function getAllowedCorsOrigins(req) {
  const allowedOrigins = new Set();
  const derivedWebOrigin = normalizeOrigin(getWebBaseUrl(req));

  if (config.WEB_PUBLIC_URL) {
    const publicWebOrigin = normalizeOrigin(config.WEB_PUBLIC_URL);
    if (publicWebOrigin) allowedOrigins.add(publicWebOrigin);
  }

  if (derivedWebOrigin) {
    allowedOrigins.add(derivedWebOrigin);
  }

  allowedOrigins.add(`http://localhost:${config.WEB_PORT}`);
  allowedOrigins.add(`http://127.0.0.1:${config.WEB_PORT}`);
  return allowedOrigins;
}

function getCorsHeaders(req) {
  const rawOriginHeader = Array.isArray(req?.headers?.origin) ? req.headers.origin[0] : req?.headers?.origin;
  const requestOrigin = normalizeOrigin(rawOriginHeader);

  if (!requestOrigin || !getAllowedCorsOrigins(req).has(requestOrigin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function jsonResponse(res, status, data, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...getBaseSecurityHeaders(),
    ...getCorsHeaders(res.__request),
    ...extraHeaders,
  });
  res.end(JSON.stringify(data, null, JSON_SPACES));
}

function htmlResponse(res, status, html, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    ...getBaseSecurityHeaders(),
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    ...extraHeaders,
  });
  res.end(html);
}

function formatByteLimit(limitBytes) {
  if (limitBytes >= MEGABYTE) {
    const sizeInMegabytes = limitBytes / MEGABYTE;
    return `${Number.isInteger(sizeInMegabytes) ? sizeInMegabytes : sizeInMegabytes.toFixed(1)} MB`;
  }
  if (limitBytes >= KILOBYTE) {
    return `${Math.ceil(limitBytes / KILOBYTE)} KB`;
  }
  return `${limitBytes} bytes`;
}

function parseContentLengthHeader(req) {
  const rawHeader = String(req.headers["content-length"] || "").trim();
  if (!rawHeader) return null;

  const contentLength = Number.parseInt(rawHeader, 10);
  return Number.isInteger(contentLength) && contentLength >= 0 ? contentLength : null;
}

function parseBody(req, { limitBytes = DEFAULT_JSON_BODY_LIMIT_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const declaredContentLength = parseContentLengthHeader(req);
    if (declaredContentLength !== null && declaredContentLength > limitBytes) {
      req.resume();
      return reject(new RequestBodyTooLargeError(limitBytes));
    }

    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const onData = (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > limitBytes) {
        settle(reject, new RequestBodyTooLargeError(limitBytes));
        req.resume();
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (settled) return;
      try {
        settle(resolve, JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        settle(reject, new Error("Invalid JSON"));
      }
    };

    const onError = (error) => settle(reject, error);
    const onAborted = () => settle(reject, new Error("Request aborted"));

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
    req.on("aborted", onAborted);
  });
}

async function parseJsonBodyOrRespond(req, res, options = {}) {
  try {
    return await parseBody(req, options);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      jsonResponse(res, 413, {
        error: `Request body is too large. Maximum size for this endpoint is ${formatByteLimit(error.limitBytes)}.`,
      });
      return null;
    }

    if (error?.message === "Invalid JSON") {
      jsonResponse(res, 400, { error: "Invalid JSON" });
      return null;
    }

    if (error?.message === "Request aborted") {
      jsonResponse(res, 400, { error: "Request body upload was interrupted before completion." });
      return null;
    }

    throw error;
  }
}

// ── Validation ──
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const SAFE_STRING_RE = /^[\p{L}\p{N}\p{Z}\p{P}]+$/u; // letters, numbers, spaces, punctuation
const PASSWORD_MIN = 8;
const RESET_CODE_RE = /^[0-9]{6}$/;
const NAME_MAX = 100;
const TITLE_MAX = 500;
const DESC_MAX = 10000;
const PHOTO_URL_MAX = 2048;

function validateEmail(email) {
  if (!email || typeof email !== "string") return "Email is required.";
  if (!EMAIL_RE.test(email)) return "Invalid email format.";
  if (email.length > 254) return "Email is too long.";
  return null;
}

function validatePassword(password) {
  if (!password || typeof password !== "string") return "Password is required.";
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (password.length > 128) return "Password is too long (max 128 characters).";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(password)) return "Password must contain at least one number.";
  if (!/[^a-zA-Z0-9]/.test(password)) return "Password must contain at least one special character (e.g. !@#$%^&*).";
  return null;
}

function normalizeResetCode(code) {
  if (code === undefined || code === null) return "";
  return String(code).replace(/\s+/g, "").trim();
}

function validateResetCode(code) {
  if (!code) return "Reset code is required.";
  if (!RESET_CODE_RE.test(code)) return "Reset code must contain exactly 6 digits.";
  return null;
}

function normalizeActivationToken(token) {
  if (token === undefined || token === null) return "";
  return String(token).trim();
}

function sanitize(str, maxLen) {
  if (typeof str !== "string") return "";
  let s = str.trim();
  // Strip HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // Normalize whitespace
  s = s.replace(/\s+/g, " ");
  if (maxLen && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

// ── Password Hashing ──
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const parts = stored.split(":");
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  return hash === crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
}

function hashResetCode(userId, code) {
  return crypto.createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

function hashActivationToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateResetCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function generateActivationToken() {
  return crypto.randomBytes(32).toString("hex");
}

function isMatchingResetCode(expectedHash, userId, actualCode) {
  if (typeof expectedHash !== "string" || typeof userId !== "string" || typeof actualCode !== "string") return false;
  const actualHash = hashResetCode(userId, actualCode);
  if (expectedHash.length !== actualHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));
}

function isMatchingActivationToken(expectedHash, actualToken) {
  if (typeof expectedHash !== "string" || typeof actualToken !== "string") return false;
  const actualHash = hashActivationToken(actualToken);
  if (expectedHash.length !== actualHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(actualHash, "hex"));
}

function getApiBaseUrl(req) {
  if (config.API_PUBLIC_URL) return config.API_PUBLIC_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${req.headers.host}`;
}

function getWebBaseUrl(req) {
  if (config.WEB_PUBLIC_URL) return config.WEB_PUBLIC_URL.replace(/\/$/, "");
  const protocol = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
  const forwardedHostHeader = Array.isArray(req.headers["x-forwarded-host"])
    ? req.headers["x-forwarded-host"][0]
    : req.headers["x-forwarded-host"];
  const forwardedHost = String(forwardedHostHeader || "").split(",")[0].trim();

  if (forwardedHost) {
    return `${protocol}://${forwardedHost}`;
  }

  const hostHeader = String(req.headers.host || "").trim();
  if (!hostHeader) {
    return getApiBaseUrl(req);
  }
  const hostname = hostHeader.split(":")[0];
  return `${protocol}://${hostname}:${config.WEB_PORT}`;
}

function getMediaBaseUrl(req) {
  const forwardedHost = req.headers["x-forwarded-host"];
  if (forwardedHost) {
    const protocol = req.headers["x-forwarded-proto"] || "http";
    return `${protocol}://${forwardedHost}`;
  }
  return getWebBaseUrl(req);
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const rawForwardedFor = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (typeof rawForwardedFor === "string" && rawForwardedFor.trim()) {
    return rawForwardedFor.split(",")[0].trim();
  }

  return String(req.socket?.remoteAddress || req.connection?.remoteAddress || "unknown").trim() || "unknown";
}

function buildRateLimitKey(parts) {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(":");
}

function unwrapRedisMultiValue(entry) {
  if (Array.isArray(entry) && entry.length >= 2) {
    return entry[1];
  }
  return entry;
}

async function consumeAuthRateLimit(key, { windowMs, maxRequests }) {
  const now = Date.now();
  const redisClient = await publicationQueueRedisClientPromise;
  const redisKey = `auth:ratelimit:${key}`;
  const multiResult = await redisClient
    .multi()
    .incr(redisKey)
    .pexpire(redisKey, windowMs, "NX")
    .pttl(redisKey)
    .exec();

  const count = Number(unwrapRedisMultiValue(multiResult?.[0]));
  let ttlMs = Number(unwrapRedisMultiValue(multiResult?.[2]));

  if (!Number.isFinite(count) || count < 1) {
    throw new Error(`Redis returned an invalid auth rate limit counter for key ${redisKey}.`);
  }

  if (!Number.isFinite(ttlMs) || ttlMs < 1) {
    await redisClient.pexpire(redisKey, windowMs);
    ttlMs = windowMs;
  }

  const resetAt = now + ttlMs;
  return {
    allowed: count <= maxRequests,
    limit: maxRequests,
    remaining: count <= maxRequests ? Math.max(0, maxRequests - count) : 0,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
  };
}

function buildRateLimitHeaders(result) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

async function enforceAuthRateLimitOrRespond(req, res, { key, windowMs, maxRequests, error }) {
  try {
    const result = await consumeAuthRateLimit(key, { windowMs, maxRequests });
    if (result.allowed) {
      return true;
    }

    jsonResponse(res, 429, { error, retryAfterSeconds: result.retryAfterSeconds }, buildRateLimitHeaders(result));
    return false;
  } catch (rateLimitError) {
    console.error("Auth rate limit backend failed:", rateLimitError.message);
    jsonResponse(res, 503, {
      error: "Authentication protection is temporarily unavailable. Please try again in a moment.",
    }, {
      "Retry-After": "5",
      "Cache-Control": "no-store",
    });
    return false;
  }
}

function getRemainingCooldownMs(dateValue, cooldownMs) {
  if (!(dateValue instanceof Date)) return 0;
  return Math.max(0, dateValue.getTime() + cooldownMs - Date.now());
}

function buildActivationUrl(req, email, token) {
  const baseUrl = getApiBaseUrl(req);
  return `${baseUrl}/auth/activate?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

function safeDecodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodePathSegments(value) {
  return String(value || "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(safeDecodePathSegment(segment)))
    .join("/");
}

function decodePathSegments(value) {
  return String(value || "")
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => safeDecodePathSegment(segment))
    .join("/");
}

function buildMediaProxyPath(key, bucket = BUCKET) {
  return `${MEDIA_PROXY_PREFIX}/${encodeURIComponent(bucket)}/${encodePathSegments(key)}`;
}

function buildMediaPublicUrl(req, key, bucket = BUCKET) {
  return `${getMediaBaseUrl(req)}${buildMediaProxyPath(key, bucket)}`;
}

function extractMediaObjectKey(rawUrl, bucket = BUCKET) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const bucketPrefix = `/${bucket}/`;
  const proxyPrefix = `${MEDIA_PROXY_PREFIX}/${bucket}/`;

  if (trimmed.startsWith(proxyPrefix)) {
    return decodePathSegments(trimmed.slice(proxyPrefix.length));
  }

  if (trimmed.startsWith(`${bucket}/`)) {
    return decodePathSegments(trimmed.slice(bucket.length + 1));
  }

  try {
    const parsed = new URL(trimmed, "http://placeholder.local");
    if (parsed.pathname.startsWith(proxyPrefix)) {
      return decodePathSegments(parsed.pathname.slice(proxyPrefix.length));
    }
    if (parsed.pathname.startsWith(bucketPrefix)) {
      return decodePathSegments(parsed.pathname.slice(bucketPrefix.length));
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeMediaUrl(req, rawUrl) {
  const storedUrl = normalizeStoredPhotoUrl(rawUrl);
  if (!storedUrl) return null;
  const key = extractMediaObjectKey(storedUrl);
  return key ? buildMediaPublicUrl(req, key) : null;
}

function normalizeStoredPhotoUrl(rawUrl) {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > PHOTO_URL_MAX) return null;
  if (/[\u0000-\u001F\u007F"'<>`\\]/.test(trimmed)) return null;
  const key = extractMediaObjectKey(trimmed);
  return key ? buildMediaProxyPath(key) : null;
}

function sanitizePhotoUrls(rawPhotoUrls) {
  if (rawPhotoUrls === undefined || rawPhotoUrls === null) {
    return { photoUrls: [] };
  }
  if (!Array.isArray(rawPhotoUrls)) {
    return { error: "photoUrls must be an array." };
  }

  const photoUrls = [];
  for (const rawUrl of rawPhotoUrls) {
    const normalizedUrl = normalizeStoredPhotoUrl(rawUrl);
    if (!normalizedUrl) {
      return { error: "Photo URLs must reference uploaded media files." };
    }
    photoUrls.push(normalizedUrl);
  }

  return { photoUrls };
}

function normalizeListingResponse(req, listing) {
  if (!listing) return listing;

  return {
    ...listing,
    photoUrls: Array.isArray(listing.photoUrls)
      ? listing.photoUrls
        .map((url) => normalizeMediaUrl(req, url))
        .filter((url) => typeof url === "string" && url.length > 0)
      : [],
    media: Array.isArray(listing.media)
      ? listing.media
        .map((item) => {
          const normalizedUrl = normalizeMediaUrl(req, item.url);
          return normalizedUrl ? { ...item, url: normalizedUrl } : null;
        })
        .filter(Boolean)
      : listing.media,
  };
}

function getRemainingLoginAttempts(failedLoginAttempts) {
  return Math.max(0, MAX_LOGIN_ATTEMPTS - (failedLoginAttempts ?? 0));
}

function buildInvalidLoginMessage(remainingLoginAttempts) {
  return `Invalid email or password. ${remainingLoginAttempts} login ${remainingLoginAttempts === 1 ? "attempt" : "attempts"} remaining before your account is locked.`;
}

function loginLockStateClearedData() {
  return {
    failedLoginAttempts: 0,
    lockedAt: null,
  };
}

function passwordResetStateClearedData() {
  return {
    passwordResetCodeHash: null,
    passwordResetCodeExpiresAt: null,
    passwordResetRequestedAt: null,
    passwordResetAttempts: 0,
  };
}

function renderAuthStatusPage({ title, heading, message, actionHref, actionLabel, secondaryMessage }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: #fff; font-family: system-ui, -apple-system, sans-serif; }
    .card { width: 100%; max-width: 520px; padding: 32px; border-radius: 20px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 18px 45px rgba(0,0,0,0.25); }
    h1 { margin: 0 0 12px; font-size: 1.8rem; }
    p { margin: 0 0 16px; line-height: 1.6; color: rgba(255,255,255,0.82); }
    a.button { display: inline-block; margin-top: 8px; padding: 12px 18px; border-radius: 10px; background: linear-gradient(90deg, #e94560, #c23152); color: #fff; text-decoration: none; font-weight: 700; }
    .muted { font-size: 0.92rem; color: rgba(255,255,255,0.6); }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p><strong>${heading}</strong></p>
    <p>${message}</p>
    ${actionHref && actionLabel ? `<a class="button" href="${actionHref}">${actionLabel}</a>` : ""}
    ${secondaryMessage ? `<p class="muted">${secondaryMessage}</p>` : ""}
  </div>
</body>
</html>`;
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET).sub;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const rawCookieHeader = req.headers.cookie;
  if (!rawCookieHeader) return {};

  return rawCookieHeader.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (!rawName) return cookies;
    const rawValue = rawValueParts.join("=");
    try {
      cookies[rawName] = rawValue ? decodeURIComponent(rawValue) : "";
    } catch {
      cookies[rawName] = rawValue || "";
    }
    return cookies;
  }, {});
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").toLowerCase();
  return forwardedProto === "https";
}

function buildCookieHeader(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires instanceof Date) parts.push(`Expires=${options.expires.toUTCString()}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function buildAuthCookie(req, token) {
  return buildCookieHeader(AUTH_COOKIE_NAME, token, {
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecureRequest(req),
  });
}

function normalizeCsrfToken(token) {
  const value = String(token || "").trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}

function generateCsrfToken() {
  return crypto.randomBytes(32).toString("hex");
}

function buildCsrfCookie(req, token) {
  return buildCookieHeader(CSRF_COOKIE_NAME, token, {
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: isSecureRequest(req),
  });
}

function buildClearedAuthCookie(req) {
  return buildCookieHeader(AUTH_COOKIE_NAME, "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecureRequest(req),
  });
}

async function seedProviders() {
  await prisma.marketplaceProvider.createMany({
    data: [
      { name: "OLX", slug: "olx", displayName: "OLX" },
      { name: "Vinted Pro", slug: "vinted_pro", displayName: "Vinted Pro" },
      { name: "Facebook Marketplace", slug: "facebook_marketplace", displayName: "Facebook Marketplace" },
    ],
    skipDuplicates: true,
  });
}

function getUserId(req) {
  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer ")) {
    const bearerUserId = verifyToken(auth.slice(7));
    if (bearerUserId) return bearerUserId;
  }
  const cookies = parseCookies(req);
  return verifyToken(cookies[AUTH_COOKIE_NAME] || "");
}

function isMutationMethod(method) {
  return method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
}

function getAllowedOrigins(req) {
  return new Set(
    [getWebBaseUrl(req), getApiBaseUrl(req)]
      .map((value) => String(value || "").replace(/\/$/, ""))
      .filter(Boolean),
  );
}

function timingSafeEqualText(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function getCsrfValidationError(req, path) {
  if (!isMutationMethod(req.method) || path === "/auth/csrf") return null;

  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (origin && !getAllowedOrigins(req).has(origin)) {
    return "Invalid request origin.";
  }

  const cookies = parseCookies(req);
  const cookieToken = normalizeCsrfToken(cookies[CSRF_COOKIE_NAME]);
  const headerToken = normalizeCsrfToken(req.headers[CSRF_HEADER_NAME]);

  if (!cookieToken || !headerToken) {
    return "Security token missing. Refresh the page and try again.";
  }

  if (!timingSafeEqualText(cookieToken, headerToken)) {
    return "Security token mismatch. Refresh the page and try again.";
  }

  return null;
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function inspectPng(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;

  return {
    mimeType: "image/png",
    extension: "png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function inspectGif(buffer) {
  if (buffer.length < 10) return null;
  const signature = buffer.toString("ascii", 0, 6);
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;

  return {
    mimeType: "image/gif",
    extension: "gif",
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function inspectWebp(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;

  const chunkType = buffer.toString("ascii", 12, 16);
  if (chunkType === "VP8X") {
    return {
      mimeType: "image/webp",
      extension: "webp",
      width: 1 + readUInt24LE(buffer, 24),
      height: 1 + readUInt24LE(buffer, 27),
    };
  }

  if (chunkType === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const width = 1 + ((buffer[21] | (buffer[22] << 8)) & 0x3fff);
    const height = 1 + (((buffer[22] >> 6) | (buffer[23] << 2) | ((buffer[24] & 0x0f) << 10)) & 0x3fff);
    return {
      mimeType: "image/webp",
      extension: "webp",
      width,
      height,
    };
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    const startCode = buffer.subarray(23, 26);
    if (startCode[0] !== 0x9d || startCode[1] !== 0x01 || startCode[2] !== 0x2a) return null;

    return {
      mimeType: "image/webp",
      extension: "webp",
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  return null;
}

function inspectJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isStartOfFrame) {
      return {
        mimeType: "image/jpeg",
        extension: "jpg",
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function detectImageDetails(buffer) {
  return inspectPng(buffer) || inspectJpeg(buffer) || inspectGif(buffer) || inspectWebp(buffer);
}

function sanitizeFileStem(fileName) {
  const safeName = sanitize(fileName, 200)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return safeName.slice(0, 80) || "image";
}

function decodeBase64Strict(rawData) {
  if (typeof rawData !== "string") return null;
  const normalized = rawData.replace(/\s+/g, "");
  if (!normalized || normalized.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return null;

  try {
    const buffer = Buffer.from(normalized, "base64");
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

function validateUploadedImage({ fileName, contentType, data }) {
  const buffer = decodeBase64Strict(data);
  if (!buffer) {
    return { error: "Invalid file encoding. Upload a real image file instead of a renamed or corrupted file." };
  }

  if (buffer.length > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return { error: `Image is too large. Maximum size is ${Math.round(MAX_UPLOAD_FILE_SIZE_BYTES / (1024 * 1024))} MB.` };
  }

  const details = detectImageDetails(buffer);
  if (!details) {
    return { error: `Only valid ${ALLOWED_IMAGE_FILE_TYPES_LABEL} image files are accepted. Renamed text, script, or corrupted files are blocked.` };
  }

  if (
    !Number.isInteger(details.width) ||
    !Number.isInteger(details.height) ||
    details.width < 1 ||
    details.height < 1 ||
    details.width > MAX_IMAGE_DIMENSION ||
    details.height > MAX_IMAGE_DIMENSION
  ) {
    return { error: "Image dimensions are invalid or exceed the allowed safety limits." };
  }

  const declaredContentType = String(contentType || "").trim().toLowerCase();
  if (declaredContentType && declaredContentType !== details.mimeType) {
    return { error: "Uploaded file content does not match its declared image type." };
  }

  return {
    buffer,
    mimeType: details.mimeType,
    extension: details.extension,
    fileName: `${sanitizeFileStem(fileName)}.${details.extension}`,
  };
}

const server = http.createServer(async (req, res) => {
  res.__request = req;

  if (req.method === "OPTIONS") {
    const corsHeaders = getCorsHeaders(req);
    const hasOriginHeader = Boolean(Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin);

    if (hasOriginHeader && !corsHeaders["Access-Control-Allow-Origin"]) {
      res.writeHead(403, {
        "Content-Type": "text/plain; charset=utf-8",
        ...getBaseSecurityHeaders(),
      });
      return res.end("Origin not allowed");
    }

    res.writeHead(204, {
      ...getBaseSecurityHeaders(),
      ...corsHeaders,
    });
    return res.end();
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const path = requestUrl.pathname;
  const clientIp = getClientIp(req);

  try {
    if (path.startsWith("/auth/")) {
      const genericAuthLimitKey = buildRateLimitKey(["auth", "all", "ip", clientIp]);
      if (!await enforceAuthRateLimitOrRespond(req, res, {
        key: genericAuthLimitKey,
        windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
        maxRequests: AUTH_RATE_LIMIT_MAX_REQUESTS,
        error: "Too many authentication requests from this IP address. Please try again later.",
      })) {
        return;
      }
    }

    if (path === "/auth/csrf" && req.method === "GET") {
      const existingToken = normalizeCsrfToken(parseCookies(req)[CSRF_COOKIE_NAME]);
      const csrfToken = existingToken || generateCsrfToken();
      return jsonResponse(res, 200, { csrfToken }, {
        "Set-Cookie": buildCsrfCookie(req, csrfToken),
        "Cache-Control": "no-store",
      });
    }

    const csrfError = getCsrfValidationError(req, path);
    if (csrfError) {
      return jsonResponse(res, 403, { error: csrfError }, { "Cache-Control": "no-store" });
    }
    // ── Auth: Register ──
    if (path === "/auth/register" && req.method === "POST") {
      const body = await parseJsonBodyOrRespond(req, res);
      if (body === null) return;

      const name = sanitize(body.name, NAME_MAX);
      const email = sanitize(body.email, 254).toLowerCase();
      const registerIpLimitKey = buildRateLimitKey(["auth", "register", "ip", clientIp]);
      if (!await enforceAuthRateLimitOrRespond(req, res, {
        key: registerIpLimitKey,
        windowMs: AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
        maxRequests: AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS,
        error: "Too many registration attempts from this IP address. Please try again later.",
      })) {
        return;
      }
      if (email) {
        const registerEmailLimitKey = buildRateLimitKey(["auth", "register", "email", email]);
        if (!await enforceAuthRateLimitOrRespond(req, res, {
          key: registerEmailLimitKey,
          windowMs: AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
          maxRequests: AUTH_REGISTER_RATE_LIMIT_MAX_REQUESTS,
          error: "Too many registration attempts for this email address. Please try again later.",
        })) {
          return;
        }
      }
      const pwdErr = validatePassword(body.password);
      const emailErr = validateEmail(email);

      if (!name) return jsonResponse(res, 400, { error: "Name is required." });
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });
      if (pwdErr) return jsonResponse(res, 400, { error: pwdErr });

      const existingUser = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isActive: true },
      });
      if (existingUser) {
        if (!existingUser.isActive) {
          return jsonResponse(res, 409, { error: INACTIVE_REGISTER_MESSAGE });
        }
        return jsonResponse(res, 409, { error: "User with this email already exists" });
      }

      const activationToken = generateActivationToken();
      const activationTokenHash = hashActivationToken(activationToken);
      const activationTokenExpiresAt = new Date(Date.now() + ACTIVATION_EXPIRY_MS);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash: hashPassword(body.password),
          name,
          isActive: false,
          activationTokenHash,
          activationTokenExpiresAt,
        },
      });
      await prisma.workspace.create({
        data: { name: `${name}'s Workspace`, slug: `ws-${user.id.slice(0, 8)}`, members: { create: { userId: user.id, role: "owner" } } },
      });
      await seedProviders();

      let activationEmailSent = false;
      let message = "Account created. Check your email and activate your account using the activation link.";
      try {
        const activationUrl = buildActivationUrl(req, email, activationToken);
        const mailInfo = await sendAccountActivationEmail(email, activationUrl, name);
        activationEmailSent = !(Array.isArray(mailInfo.rejected) && mailInfo.rejected.length > 0);
        if (!activationEmailSent) {
          message = 'Account created, but the activation email was rejected. Use "Forgot password" to activate your account.';
        } else {
          console.log(`Account activation email sent to ${email}`, formatMailDeliveryResult(mailInfo));
        }
      } catch (mailErr) {
        message = 'Account created, but the activation email could not be sent. Use "Forgot password" to activate your account.';
        console.error("Failed to send activation email:", mailErr.message);
      }

      return jsonResponse(res, 201, {
        message,
        requiresActivation: true,
        activationEmailSent,
        email,
      });
    }

    // ── Auth: Login ──
    if (path === "/auth/login" && req.method === "POST") {
      const body = await parseJsonBodyOrRespond(req, res);
      if (body === null) return;

      const email = sanitize(body.email, 254).toLowerCase();
      const loginIpLimitKey = buildRateLimitKey(["auth", "login", "ip", clientIp]);
      if (!await enforceAuthRateLimitOrRespond(req, res, {
        key: loginIpLimitKey,
        windowMs: AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
        maxRequests: AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS,
        error: "Too many login attempts from this IP address. Please try again later.",
      })) {
        return;
      }
      if (email) {
        const loginEmailLimitKey = buildRateLimitKey(["auth", "login", "email", email]);
        if (!await enforceAuthRateLimitOrRespond(req, res, {
          key: loginEmailLimitKey,
          windowMs: AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
          maxRequests: AUTH_LOGIN_RATE_LIMIT_MAX_REQUESTS,
          error: "Too many login attempts for this email address. Please try again later.",
        })) {
          return;
        }
      }
      const emailErr = validateEmail(email);
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });
      if (!body.password) return jsonResponse(res, 400, { error: "Password is required." });

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          passwordHash: true,
          isActive: true,
          failedLoginAttempts: true,
          lockedAt: true,
        },
      });
      if (!user) return jsonResponse(res, 401, { error: "Invalid email or password" });
      if (!user.isActive) return jsonResponse(res, 403, { error: INACTIVE_LOGIN_MESSAGE });
      if (user.lockedAt) {
        return jsonResponse(res, 423, {
          error: LOCKED_LOGIN_MESSAGE,
          accountLocked: true,
          failedLoginAttempts: user.failedLoginAttempts ?? MAX_LOGIN_ATTEMPTS,
          remainingLoginAttempts: 0,
        });
      }

      const pwdOk = verifyPassword(body.password, user.passwordHash);
      if (!pwdOk) {
        const failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
        if (failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
              lockedAt: new Date(),
            },
          });
          return jsonResponse(res, 423, {
            error: LOCKED_LOGIN_MESSAGE,
            accountLocked: true,
            failedLoginAttempts: MAX_LOGIN_ATTEMPTS,
            remainingLoginAttempts: 0,
          });
        }

        const remainingLoginAttempts = getRemainingLoginAttempts(failedLoginAttempts);
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts },
        });
        return jsonResponse(res, 401, {
          error: buildInvalidLoginMessage(remainingLoginAttempts),
          accountLocked: false,
          failedLoginAttempts,
          remainingLoginAttempts,
        });
      }

      if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedAt) {
        await prisma.user.update({
          where: { id: user.id },
          data: loginLockStateClearedData(),
        });
      }

      await seedProviders();
      const token = signToken(user.id);
      return jsonResponse(
        res,
        200,
        { user: { id: user.id, email: user.email, name: user.name }, session: "cookie" },
        { "Set-Cookie": buildAuthCookie(req, token) },
      );
    }

    // ── Auth: Forgot Password ──
    if (path === "/auth/activate" && req.method === "GET") {
      const email = sanitize(requestUrl.searchParams.get("email"), 254).toLowerCase();
      const token = normalizeActivationToken(requestUrl.searchParams.get("token"));
      const appUrl = `${getWebBaseUrl(req)}/`;
      const activateIpLimitKey = buildRateLimitKey(["auth", "activate", "ip", clientIp]);
      if (!await enforceAuthRateLimitOrRespond(req, res, {
        key: activateIpLimitKey,
        windowMs: AUTH_ACTIVATE_RATE_LIMIT_WINDOW_MS,
        maxRequests: AUTH_ACTIVATE_RATE_LIMIT_MAX_REQUESTS,
        error: "Too many activation requests from this IP address. Please try again later.",
      })) {
        return;
      }

      if (!email || !token) {
        return htmlResponse(res, 400, renderAuthStatusPage({
          title: "Invalid Activation Link",
          heading: "We could not verify your account.",
          message: 'This activation link is incomplete. Open MultiPortal and use "Forgot password" to activate your account.',
          actionHref: appUrl,
          actionLabel: "Open MultiPortal",
          secondaryMessage: 'If the original link expired, use "Forgot password" with the same email address.',
        }));
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          isActive: true,
          activationTokenHash: true,
          activationTokenExpiresAt: true,
        },
      });

      if (!user) {
        return htmlResponse(res, 404, renderAuthStatusPage({
          title: "Account Not Found",
          heading: "This activation link does not match any account.",
          message: "No account was found for this activation link.",
          actionHref: appUrl,
          actionLabel: "Open MultiPortal",
          secondaryMessage: 'If you already registered, try "Forgot password" to activate your account.',
        }));
      }

      if (user.isActive) {
        return htmlResponse(res, 200, renderAuthStatusPage({
          title: "Account Already Active",
          heading: "Your account is already confirmed.",
          message: "You can log in to MultiPortal now.",
          actionHref: appUrl,
          actionLabel: "Go to Login",
        }));
      }

      if (!user.activationTokenHash || !user.activationTokenExpiresAt) {
        return htmlResponse(res, 400, renderAuthStatusPage({
          title: "Activation Link Invalid",
          heading: "This activation link is no longer valid.",
          message: 'Use "Forgot password" with the same email address to activate your account and set a new password.',
          actionHref: appUrl,
          actionLabel: "Open MultiPortal",
        }));
      }

      if (Date.now() > user.activationTokenExpiresAt.getTime()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { activationTokenHash: null, activationTokenExpiresAt: null },
        });
        return htmlResponse(res, 400, renderAuthStatusPage({
          title: "Activation Link Expired",
          heading: "This activation link has expired.",
          message: 'Use "Forgot password" with the same email address to activate your account and set a new password.',
          actionHref: appUrl,
          actionLabel: "Open MultiPortal",
        }));
      }

      if (!isMatchingActivationToken(user.activationTokenHash, token)) {
        return htmlResponse(res, 400, renderAuthStatusPage({
          title: "Activation Link Invalid",
          heading: "We could not verify this activation request.",
          message: 'Use "Forgot password" with the same email address to activate your account and set a new password.',
          actionHref: appUrl,
          actionLabel: "Open MultiPortal",
        }));
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isActive: true,
          activatedAt: new Date(),
          activationTokenHash: null,
          activationTokenExpiresAt: null,
        },
      });

      return htmlResponse(res, 200, renderAuthStatusPage({
        title: "Account Activated",
        heading: "Your account is now active.",
        message: "You can log in to MultiPortal with the password you chose during registration.",
        actionHref: appUrl,
        actionLabel: "Go to Login",
      }));
    }

    if (path === "/auth/forgot-password" && req.method === "POST") {
      const body = await parseJsonBodyOrRespond(req, res);
      if (body === null) return;

      const email = sanitize(body.email, 254).toLowerCase();
      const forgotPasswordIpLimitKey = buildRateLimitKey(["auth", "forgot-password", "ip", clientIp]);
      if (!await enforceAuthRateLimitOrRespond(req, res, {
        key: forgotPasswordIpLimitKey,
        windowMs: AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
        maxRequests: AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
        error: "Too many password reset requests from this IP address. Please try again later.",
      })) {
        return;
      }
      if (email) {
        const forgotPasswordEmailLimitKey = buildRateLimitKey(["auth", "forgot-password", "email", email]);
        if (!await enforceAuthRateLimitOrRespond(req, res, {
          key: forgotPasswordEmailLimitKey,
          windowMs: AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
          maxRequests: AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
          error: "Too many password reset requests for this email address. Please try again later.",
        })) {
          return;
        }
      }
      const emailErr = validateEmail(email);
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, isActive: true, lockedAt: true, passwordResetRequestedAt: true },
      });
      if (!user) return jsonResponse(res, 404, { error: "No account found for this email address." });

      const remainingResetCooldownMs = getRemainingCooldownMs(user.passwordResetRequestedAt, AUTH_PASSWORD_RESET_RESEND_COOLDOWN_MS);
      if (remainingResetCooldownMs > 0) {
        return jsonResponse(res, 429, {
          error: "A reset code was already sent recently. Please wait before requesting another code.",
          retryAfterSeconds: Math.max(1, Math.ceil(remainingResetCooldownMs / 1000)),
        }, {
          "Retry-After": String(Math.max(1, Math.ceil(remainingResetCooldownMs / 1000))),
        });
      }

      const resetCode = generateResetCode();
      const passwordResetCodeExpiresAt = new Date(Date.now() + RESET_EXPIRY_MS);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetCodeHash: hashResetCode(user.id, resetCode),
          passwordResetCodeExpiresAt,
          passwordResetRequestedAt: new Date(),
          passwordResetAttempts: 0,
        },
      });

      // Send password reset email via SMTP
      try {
        const mailInfo = await sendPasswordResetEmail(email, resetCode, user.name, !user.isActive);
        if (Array.isArray(mailInfo.rejected) && mailInfo.rejected.length > 0) {
          await prisma.user.update({
            where: { id: user.id },
            data: passwordResetStateClearedData(),
          });
          return jsonResponse(res, 502, { error: "Reset email was rejected by the mail server. Please verify the address and try again." });
        }
        console.log(`Password reset email sent to ${email}`, formatMailDeliveryResult(mailInfo));
      } catch (mailErr) {
        await prisma.user.update({
          where: { id: user.id },
          data: passwordResetStateClearedData(),
        });
        console.error("Failed to send reset email:", mailErr.message);
        return jsonResponse(res, 502, { error: "Failed to send reset email. Please try again later." });
      }

      return jsonResponse(res, 200, {
        message: !user.isActive && user.lockedAt
          ? "Activation and unlock code sent. Check your email for the 6-digit code and set a new password to restore access."
          : !user.isActive
            ? "Activation code sent. Check your email for the 6-digit code and set a new password to activate your account."
            : user.lockedAt
              ? "Unlock code sent. Check your email for the 6-digit code and set a new password to unlock your account."
              : "Reset code sent. Check your email for the 6-digit code.",
      });
    }

    // ── Auth: Reset Password ──
    if (path === "/auth/reset-password" && req.method === "POST") {
      const body = await parseJsonBodyOrRespond(req, res);
      if (body === null) return;

      const email = sanitize(body.email, 254).toLowerCase();
      const resetPasswordIpLimitKey = buildRateLimitKey(["auth", "reset-password", "ip", clientIp]);
      if (!await enforceAuthRateLimitOrRespond(req, res, {
        key: resetPasswordIpLimitKey,
        windowMs: AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS,
        maxRequests: AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
        error: "Too many password reset submissions from this IP address. Please try again later.",
      })) {
        return;
      }
      if (email) {
        const resetPasswordEmailLimitKey = buildRateLimitKey(["auth", "reset-password", "email", email]);
        if (!await enforceAuthRateLimitOrRespond(req, res, {
          key: resetPasswordEmailLimitKey,
          windowMs: AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS,
          maxRequests: AUTH_RESET_PASSWORD_RATE_LIMIT_MAX_REQUESTS,
          error: "Too many password reset submissions for this email address. Please try again later.",
        })) {
          return;
        }
      }
      const emailErr = validateEmail(email);
      const resetCode = normalizeResetCode(body.code ?? body.token);
      const resetCodeErr = validateResetCode(resetCode);
      const pwdErr = validatePassword(body.password);
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });
      if (resetCodeErr) return jsonResponse(res, 400, { error: resetCodeErr });
      if (pwdErr) return jsonResponse(res, 400, { error: pwdErr });

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          isActive: true,
          lockedAt: true,
          passwordResetCodeHash: true,
          passwordResetCodeExpiresAt: true,
          passwordResetAttempts: true,
        },
      });
      if (!user) return jsonResponse(res, 404, { error: "No account found for this email address." });

      if (!user.passwordResetCodeHash || !user.passwordResetCodeExpiresAt) {
        return jsonResponse(res, 400, { error: "Reset code not found. Request a new code and try again." });
      }
      if (Date.now() > user.passwordResetCodeExpiresAt.getTime()) {
        await prisma.user.update({
          where: { id: user.id },
          data: passwordResetStateClearedData(),
        });
        return jsonResponse(res, 400, { error: "Reset code has expired. Request a new code and try again." });
      }
      if ((user.passwordResetAttempts ?? 0) >= MAX_RESET_ATTEMPTS) {
        await prisma.user.update({
          where: { id: user.id },
          data: passwordResetStateClearedData(),
        });
        return jsonResponse(res, 400, { error: "Too many invalid reset code attempts. Request a new code and try again." });
      }
      if (!isMatchingResetCode(user.passwordResetCodeHash, user.id, resetCode)) {
        const nextResetAttempts = (user.passwordResetAttempts ?? 0) + 1;
        if (nextResetAttempts >= MAX_RESET_ATTEMPTS) {
          await prisma.user.update({
            where: { id: user.id },
            data: passwordResetStateClearedData(),
          });
          return jsonResponse(res, 400, { error: "Too many invalid reset code attempts. Request a new code and try again." });
        }
        await prisma.user.update({
          where: { id: user.id },
          data: { passwordResetAttempts: nextResetAttempts },
        });
        return jsonResponse(res, 400, { error: "Invalid reset code." });
      }

      await prisma.user.update({
        where: { email },
        data: {
          passwordHash: hashPassword(body.password),
          isActive: true,
          activationTokenHash: null,
          activationTokenExpiresAt: null,
          ...loginLockStateClearedData(),
          ...passwordResetStateClearedData(),
          ...(user.isActive ? {} : { activatedAt: new Date() }),
        },
      });

      const wasLocked = Boolean(user.lockedAt);
      return jsonResponse(res, 200, {
        message: !user.isActive && wasLocked
          ? "Your account has been activated, unlocked, and your password has been updated. You can now log in."
          : !user.isActive
            ? "Your account has been activated and your password has been updated. You can now log in."
            : wasLocked
              ? "Your account has been unlocked and your password has been updated. You can now log in."
              : "Password has been reset. You can now log in with the new password.",
      });
    }

    // ── Auth: Me ──
    if (path === "/auth/me" && req.method === "GET") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      const user = await prisma.user.findUnique({ where: { id: uid } });
      return jsonResponse(res, 200, { user: { id: user.id, email: user.email, name: user.name } });
    }

    if (path === "/auth/logout" && req.method === "POST") {
      return jsonResponse(
        res,
        200,
        { message: "Logged out successfully." },
        { "Set-Cookie": buildClearedAuthCookie(req) },
      );
    }

    // ── Health ──
    if (path === "/" || path === "/health")
      return jsonResponse(res, 200, { status: "ok", db: "connected", version: APP_VERSION });

    // ── Listings ──
    if (path === "/listings") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });

      if (req.method === "GET") {
        const listings = await prisma.listingDraft.findMany({
          where: { userId: uid },
          orderBy: { createdAt: "desc" },
          include: { media: true },
        });
        return jsonResponse(res, 200, { listings: listings.map((listing) => normalizeListingResponse(req, listing)) });
      }
      if (req.method === "POST") {
        const body = await parseJsonBodyOrRespond(req, res);
        if (body === null) return;

        const title = sanitize(body.title, TITLE_MAX);
        const description = sanitize(body.description, DESC_MAX);
        const category = sanitize(body.category, 200);
        const { photoUrls, error: photoUrlsErr } = sanitizePhotoUrls(body.photoUrls);

        if (!title) return jsonResponse(res, 400, { error: "Title is required." });
        if (photoUrlsErr) return jsonResponse(res, 400, { error: photoUrlsErr });

        const ws = await prisma.workspace.findFirst({ where: { members: { some: { userId: uid } } } });
        if (!ws) return jsonResponse(res, 400, { error: "No workspace found. Please register first." });

        const listing = await prisma.listingDraft.create({
          data: {
            title, description, price: Number(body.price) || 0,
            currency: body.currency || "PLN", category: category || "Other",
            attributes: body.attributes || {}, location: body.location || {},
            photoUrls, deliveryOptions: body.deliveryOptions || [],
            userId: uid, workspaceId: ws.id,
          },
        });
        return jsonResponse(res, 201, { listing: normalizeListingResponse(req, listing) });
      }
    }

    // ── Listing by ID ──
    const listingMatch = path.match(/^\/listings\/([^/]+)$/);
    if (listingMatch) {
      const id = listingMatch[1];
      const uid = getUserId(req);
      if (req.method === "GET") {
        if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
        const listing = await prisma.listingDraft.findFirst({ where: { id, userId: uid } });
        return listing
          ? jsonResponse(res, 200, { listing: normalizeListingResponse(req, listing) })
          : jsonResponse(res, 404, { error: "Listing not found" });
      }
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      if (req.method === "PUT") {
        const body = await parseJsonBodyOrRespond(req, res);
        if (body === null) return;
        if (body.title !== undefined) body.title = sanitize(body.title, TITLE_MAX);
        if (body.description !== undefined) body.description = sanitize(body.description, DESC_MAX);
        if (body.category !== undefined) body.category = sanitize(body.category, 200);
        if (body.photoUrls !== undefined) {
          const { photoUrls, error: photoUrlsErr } = sanitizePhotoUrls(body.photoUrls);
          if (photoUrlsErr) return jsonResponse(res, 400, { error: photoUrlsErr });
          body.photoUrls = photoUrls;
        }
        const listing = await prisma.listingDraft.update({ where: { id, userId: uid }, data: body });
        return jsonResponse(res, 200, { listing: normalizeListingResponse(req, listing) });
      }
      if (req.method === "DELETE") {
        // Delete related media first to avoid RESTRICT foreign key violation
        await prisma.listingMedia.deleteMany({ where: { listingDraftId: id } });
        await prisma.listingDraft.delete({ where: { id, userId: uid } });
        return jsonResponse(res, 200, { deleted: true, id });
      }
    }

    // ── Listing Photos ──
    const photosMatch = path.match(/^\/listings\/([^/]+)\/photos(?:\/(\d+))?$/);
    if (photosMatch) {
      const listingId = photosMatch[1];
      const photoIndex = photosMatch[2] !== undefined ? parseInt(photosMatch[2], 10) : undefined;
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });

      const listing = await prisma.listingDraft.findUnique({ where: { id: listingId, userId: uid } });
      if (!listing) return jsonResponse(res, 404, { error: "Listing not found" });

      // POST /listings/:id/photos — append photo URLs
      if (req.method === "POST") {
        const body = await parseJsonBodyOrRespond(req, res);
        if (body === null) return;
        if (!Array.isArray(body.urls)) return jsonResponse(res, 400, { error: "urls array is required." });
        const { photoUrls, error: photoUrlsErr } = sanitizePhotoUrls(body.urls);
        if (photoUrlsErr) return jsonResponse(res, 400, { error: photoUrlsErr });
        const current = listing.photoUrls || [];
        const updated = [...current, ...photoUrls];
        await prisma.listingDraft.update({ where: { id: listingId }, data: { photoUrls: updated } });
        return jsonResponse(res, 200, { photoUrls: updated.map((url) => normalizeMediaUrl(req, url)).filter(Boolean) });
      }

      // PUT /listings/:id/photos — replace entire photoUrls array (reorder)
      if (req.method === "PUT") {
        const body = await parseJsonBodyOrRespond(req, res);
        if (body === null) return;
        if (!Array.isArray(body.urls)) return jsonResponse(res, 400, { error: "urls array is required." });
        const { photoUrls, error: photoUrlsErr } = sanitizePhotoUrls(body.urls);
        if (photoUrlsErr) return jsonResponse(res, 400, { error: photoUrlsErr });
        await prisma.listingDraft.update({ where: { id: listingId }, data: { photoUrls } });
        return jsonResponse(res, 200, { photoUrls: photoUrls.map((url) => normalizeMediaUrl(req, url)).filter(Boolean) });
      }

      // DELETE /listings/:id/photos/:index — remove a single photo by index
      if (req.method === "DELETE" && photoIndex !== undefined) {
        const current = listing.photoUrls || [];
        if (photoIndex < 0 || photoIndex >= current.length) return jsonResponse(res, 400, { error: "Invalid photo index." });
        const updated = current.filter((_, i) => i !== photoIndex);
        await prisma.listingDraft.update({ where: { id: listingId }, data: { photoUrls: updated } });
        return jsonResponse(res, 200, { photoUrls: updated.map((url) => normalizeMediaUrl(req, url)).filter(Boolean) });
      }
    }

    // ── Publication Jobs ──
    if (path === "/publication-jobs" && req.method === "POST") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      const body = await parseJsonBodyOrRespond(req, res);
      if (body === null) return;
      if (!body.listingId || typeof body.listingId !== "string") {
        return jsonResponse(res, 400, { error: "listingId is required." });
      }
      const draft = await prisma.listingDraft.findFirst({ where: { id: body.listingId, userId: uid } });
      if (!draft) return jsonResponse(res, 404, { error: "Listing not found" });
      const account = await prisma.marketplaceAccount.findFirst({ where: { userId: uid }, include: { marketplaceProvider: true } });
      if (!account) return jsonResponse(res, 400, { error: "No connected marketplace account." });
      const key = crypto.randomUUID();
      const { extListing, job } = await prisma.$transaction(async (tx) => {
        const extListing = await tx.externalListing.upsert({
          where: {
            listingDraftId_marketplaceProviderId: {
              listingDraftId: draft.id,
              marketplaceProviderId: account.marketplaceProviderId,
            },
          },
          update: {
            marketplaceAccountId: account.id,
            status: "queued",
          },
          create: {
            listingDraftId: draft.id,
            marketplaceProviderId: account.marketplaceProviderId,
            marketplaceAccountId: account.id,
            status: "queued",
          },
        });

        const job = await tx.publicationJob.create({
          data: { idempotencyKey: key, listingDraftId: draft.id, marketplaceAccountId: account.id, externalListingId: extListing.id, status: "pending" },
        });

        return { extListing, job };
      });

      // Push to BullMQ queue instead of setTimeout — worker will process async
      await publicationQueue.add("publish", {
        jobId: job.id,
        listingId: draft.id,
        accountId: account.id,
        extListingId: extListing.id,
        draft: draft ? { title: draft.title, description: draft.description, price: Number(draft.price), currency: draft.currency, category: draft.category } : null,
      }, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });

      return jsonResponse(res, 201, { job: { id: job.id, idempotencyKey: key, status: "pending", queue: "bullmq" } });
    }

    const jobMatch = path.match(/^\/publication-jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      const job = await prisma.publicationJob.findFirst({
        where: {
          id: jobMatch[1],
          listingDraft: { userId: uid },
        },
        include: { externalListing: true },
      });
      return job ? jsonResponse(res, 200, { job }) : jsonResponse(res, 404, { error: "Job not found" });
    }

    // ── Media Upload (MinIO presigned URL) ──
    if (path === "/media/upload-url" && req.method === "POST") {
      return jsonResponse(res, 410, {
        error: "Direct presigned uploads are disabled for security. Use the validated /media/upload endpoint instead.",
      });
    }

    // ── Media Upload (direct server-side, base64) ──
    if (path === "/media/upload" && req.method === "POST") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });

      const body = await parseJsonBodyOrRespond(req, res, { limitBytes: UPLOAD_JSON_BODY_LIMIT_BYTES });
      if (body === null) return;
      if (!body.fileName || !body.data) {
        return jsonResponse(res, 400, { error: "fileName and data (base64) are required." });
      }

      const uploadedImage = validateUploadedImage(body);
      if (uploadedImage.error) {
        return jsonResponse(res, 400, { error: uploadedImage.error });
      }

      const key = `uploads/${uid}/${Date.now()}-${crypto.randomUUID()}-${uploadedImage.fileName}`;
      const proxyPublicUrl = buildMediaPublicUrl(req, key);

      await ensureBucket();
      await minioClient.putObject(BUCKET, key, uploadedImage.buffer, uploadedImage.buffer.length, {
        "Content-Type": uploadedImage.mimeType,
      });

      // Record media if listingId is provided
      if (body.listingId) {
        const listing = await prisma.listingDraft.findFirst({ where: { id: body.listingId, userId: uid } });
        if (!listing) return jsonResponse(res, 404, { error: "Listing not found" });

        await prisma.listingMedia.create({
          data: {
            url: proxyPublicUrl,
            key,
            fileName: uploadedImage.fileName,
            fileSize: uploadedImage.buffer.length,
            mimeType: uploadedImage.mimeType,
            listingDraftId: body.listingId,
          },
        });
      }

      return jsonResponse(res, 201, { publicUrl: proxyPublicUrl, key });
    }

    // ── Providers ──
    if (path === "/providers")
      return jsonResponse(res, 200, { providers: await prisma.marketplaceProvider.findMany() });

    // ── Marketplace Accounts ──
    if (path === "/marketplace-accounts") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      if (req.method === "GET") {
        const accounts = await prisma.marketplaceAccount.findMany({ where: { userId: uid, isActive: true }, include: { marketplaceProvider: true } });
        return jsonResponse(res, 200, { accounts });
      }
      if (req.method === "POST") {
        const body = await parseJsonBodyOrRespond(req, res);
        if (body === null) return;
        const provider = await prisma.marketplaceProvider.findUnique({ where: { slug: sanitize(body.providerSlug, 50) } });
        if (!provider) return jsonResponse(res, 400, { error: "Provider not found" });
        const account = await prisma.marketplaceAccount.upsert({
          where: { userId_marketplaceProviderId: { userId: uid, marketplaceProviderId: provider.id } },
          create: { userId: uid, marketplaceProviderId: provider.id, providerUserId: body.providerUserId || `user-${uid.slice(0, 8)}`, accessToken: "placeholder-encrypted-token", isActive: true },
          update: { isActive: true },
        });
        return jsonResponse(res, 201, { account });
      }
    }

    return jsonResponse(res, 404, { error: "Not found", path });
  } catch (err) {
    console.error("Server error:", err.code || err.message, err.stack?.split("\n")[1]?.trim() || "");
    // Never expose raw Prisma/database errors to the client
    return jsonResponse(res, 500, { error: "Internal server error. Please try again later." });
  }
});

server.listen(config.API_PORT, () => console.log(`API ready at http://localhost:${config.API_PORT} (v${APP_VERSION})`));
