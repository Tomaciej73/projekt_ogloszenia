require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Queue } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { getPresignedUploadUrl, ensureBucket, minioClient, BUCKET } = require("./minio");
const { sendPasswordResetEmail, sendAccountActivationEmail, formatMailDeliveryResult } = require("./mail");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6739";
const publicationQueue = new Queue("publication", { connection: { url: REDIS_URL } });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRY = "24h";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JSON_SPACES = 2;
const RESET_EXPIRY_MS = 3600000;
const ACTIVATION_EXPIRY_MS = 3600000;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_RESET_ATTEMPTS = 5;
const INACTIVE_LOGIN_MESSAGE = "Your account is not active yet. Check your email for the activation link or use Forgot password to activate your account.";
const INACTIVE_REGISTER_MESSAGE = "An account with this email already exists but is not active. Use Forgot password to activate your account and set a new password.";
const LOCKED_LOGIN_MESSAGE = "Your account is locked after 5 failed login attempts. Use Forgot password to unlock your account and set a new password.";

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data, null, JSON_SPACES));
}

function htmlResponse(res, status, html) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
  });
  res.end(html);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

// ── Validation ──
const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const SAFE_STRING_RE = /^[\p{L}\p{N}\p{Z}\p{P}]+$/u; // letters, numbers, spaces, punctuation
const PASSWORD_MIN = 8;
const RESET_CODE_RE = /^[0-9]{6}$/;
const NAME_MAX = 100;
const TITLE_MAX = 500;
const DESC_MAX = 10000;

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
  if (process.env.API_PUBLIC_URL) return process.env.API_PUBLIC_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || "http";
  return `${protocol}://${req.headers.host}`;
}

function getWebBaseUrl(req) {
  if (process.env.WEB_PUBLIC_URL) return process.env.WEB_PUBLIC_URL.replace(/\/$/, "");
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const hostname = (req.headers.host || `localhost:${process.env.API_PORT || 3001}`).split(":")[0];
  return `${protocol}://${hostname}:${process.env.WEB_PORT || 3000}`;
}

function buildActivationUrl(req, email, token) {
  const baseUrl = getApiBaseUrl(req);
  return `${baseUrl}/auth/activate?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
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
  if (!auth?.startsWith("Bearer ")) return null;
  return verifyToken(auth.slice(7));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const path = requestUrl.pathname;

  try {
    // ── Auth: Register ──
    if (path === "/auth/register" && req.method === "POST") {
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const name = sanitize(body.name, NAME_MAX);
      const email = sanitize(body.email, 254).toLowerCase();
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
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const email = sanitize(body.email, 254).toLowerCase();
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
      return jsonResponse(res, 200, { user: { id: user.id, email: user.email, name: user.name }, token });
    }

    // ── Auth: Forgot Password ──
    if (path === "/auth/activate" && req.method === "GET") {
      const email = sanitize(requestUrl.searchParams.get("email"), 254).toLowerCase();
      const token = normalizeActivationToken(requestUrl.searchParams.get("token"));
      const appUrl = `${getWebBaseUrl(req)}/`;

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
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const email = sanitize(body.email, 254).toLowerCase();
      const emailErr = validateEmail(email);
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, isActive: true, lockedAt: true },
      });
      if (!user) return jsonResponse(res, 404, { error: "No account found for this email address." });

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
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const email = sanitize(body.email, 254).toLowerCase();
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

    // ── Health ──
    if (path === "/" || path === "/health")
      return jsonResponse(res, 200, { status: "ok", db: "connected", version: "0.3.0" });

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
        return jsonResponse(res, 200, { listings });
      }
      if (req.method === "POST") {
        const body = await parseBody(req).catch(() => null);
        if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

        const title = sanitize(body.title, TITLE_MAX);
        const description = sanitize(body.description, DESC_MAX);
        const category = sanitize(body.category, 200);

        if (!title) return jsonResponse(res, 400, { error: "Title is required." });

        const ws = await prisma.workspace.findFirst({ where: { members: { some: { userId: uid } } } });
        if (!ws) return jsonResponse(res, 400, { error: "No workspace found. Please register first." });

        const listing = await prisma.listingDraft.create({
          data: {
            title, description, price: Number(body.price) || 0,
            currency: body.currency || "PLN", category: category || "Other",
            attributes: body.attributes || {}, location: body.location || {},
            photoUrls: body.photoUrls || [], deliveryOptions: body.deliveryOptions || [],
            userId: uid, workspaceId: ws.id,
          },
        });
        return jsonResponse(res, 201, { listing });
      }
    }

    // ── Listing by ID ──
    const listingMatch = path.match(/^\/listings\/([^/]+)$/);
    if (listingMatch) {
      const id = listingMatch[1];
      const uid = getUserId(req);
      if (req.method === "GET") {
        const listing = await prisma.listingDraft.findUnique({ where: { id } });
        return listing ? jsonResponse(res, 200, { listing }) : jsonResponse(res, 404, { error: "Listing not found" });
      }
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      if (req.method === "PUT") {
        const body = await parseBody(req).catch(() => null);
        if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });
        if (body.title) body.title = sanitize(body.title, TITLE_MAX);
        if (body.description) body.description = sanitize(body.description, DESC_MAX);
        const listing = await prisma.listingDraft.update({ where: { id, userId: uid }, data: body });
        return jsonResponse(res, 200, { listing });
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
        const body = await parseBody(req).catch(() => null);
        if (!body || !Array.isArray(body.urls)) return jsonResponse(res, 400, { error: "urls array is required." });
        const current = listing.photoUrls || [];
        const updated = [...current, ...body.urls];
        await prisma.listingDraft.update({ where: { id: listingId }, data: { photoUrls: updated } });
        return jsonResponse(res, 200, { photoUrls: updated });
      }

      // PUT /listings/:id/photos — replace entire photoUrls array (reorder)
      if (req.method === "PUT") {
        const body = await parseBody(req).catch(() => null);
        if (!body || !Array.isArray(body.urls)) return jsonResponse(res, 400, { error: "urls array is required." });
        await prisma.listingDraft.update({ where: { id: listingId }, data: { photoUrls: body.urls } });
        return jsonResponse(res, 200, { photoUrls: body.urls });
      }

      // DELETE /listings/:id/photos/:index — remove a single photo by index
      if (req.method === "DELETE" && photoIndex !== undefined) {
        const current = listing.photoUrls || [];
        if (photoIndex < 0 || photoIndex >= current.length) return jsonResponse(res, 400, { error: "Invalid photo index." });
        const updated = current.filter((_, i) => i !== photoIndex);
        await prisma.listingDraft.update({ where: { id: listingId }, data: { photoUrls: updated } });
        return jsonResponse(res, 200, { photoUrls: updated });
      }
    }

    // ── Publication Jobs ──
    if (path === "/publication-jobs" && req.method === "POST") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });
      const account = await prisma.marketplaceAccount.findFirst({ where: { userId: uid }, include: { marketplaceProvider: true } });
      if (!account) return jsonResponse(res, 400, { error: "No connected marketplace account." });
      const extListing = await prisma.externalListing.create({
        data: { listingDraftId: body.listingId, marketplaceProviderId: account.marketplaceProviderId, marketplaceAccountId: account.id, status: "queued" },
      });
      const key = crypto.randomUUID();
      const job = await prisma.publicationJob.create({
        data: { idempotencyKey: key, listingDraftId: body.listingId, marketplaceAccountId: account.id, externalListingId: extListing.id, status: "pending" },
      });

      // Push to BullMQ queue instead of setTimeout — worker will process async
      const draft = await prisma.listingDraft.findUnique({ where: { id: body.listingId } });
      await publicationQueue.add("publish", {
        jobId: job.id,
        listingId: body.listingId,
        accountId: account.id,
        extListingId: extListing.id,
        draft: draft ? { title: draft.title, description: draft.description, price: Number(draft.price), currency: draft.currency, category: draft.category } : null,
      }, { attempts: 3, backoff: { type: "exponential", delay: 2000 } });

      return jsonResponse(res, 201, { job: { id: job.id, idempotencyKey: key, status: "pending", queue: "bullmq" } });
    }

    const jobMatch = path.match(/^\/publication-jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = await prisma.publicationJob.findUnique({ where: { id: jobMatch[1] }, include: { externalListing: true } });
      return job ? jsonResponse(res, 200, { job }) : jsonResponse(res, 404, { error: "Job not found" });
    }

    // ── Media Upload (MinIO presigned URL) ──
    if (path === "/media/upload-url" && req.method === "POST") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });

      const body = await parseBody(req).catch(() => null);
      if (!body || !body.fileName || !body.contentType) {
        return jsonResponse(res, 400, { error: "fileName and contentType are required." });
      }

      const key = `uploads/${uid}/${Date.now()}-${sanitize(body.fileName, 200)}`;
      const { uploadUrl, publicUrl } = await getPresignedUploadUrl(key, body.contentType);

      // Only record media if listingId is provided and belongs to the user
      if (body.listingId) {
        const listing = await prisma.listingDraft.findUnique({ where: { id: body.listingId } });
        if (listing) {
          await prisma.listingMedia.create({
            data: {
              url: publicUrl,
              key,
              fileName: sanitize(body.fileName, 200),
              fileSize: body.fileSize || 0,
              mimeType: body.contentType,
              listingDraftId: body.listingId,
            },
          });
        }
      }

      return jsonResponse(res, 201, { uploadUrl, publicUrl, key });
    }

    // ── Media Upload (direct server-side, base64) ──
    if (path === "/media/upload" && req.method === "POST") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });

      const body = await parseBody(req).catch(() => null);
      if (!body || !body.fileName || !body.data) {
        return jsonResponse(res, 400, { error: "fileName and data (base64) are required." });
      }

      const buf = Buffer.from(body.data, "base64");
      const contentType = body.contentType || "application/octet-stream";
      const key = `uploads/${uid}/${Date.now()}-${sanitize(body.fileName, 200)}`;

      await ensureBucket();
      await minioClient.putObject(BUCKET, key, buf, buf.length, { "Content-Type": contentType });

      const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || "http://localhost:9000";
      const publicUrl = `${publicEndpoint}/${BUCKET}/${key}`;

      // Record media if listingId is provided
      if (body.listingId) {
        const listing = await prisma.listingDraft.findUnique({ where: { id: body.listingId } });
        if (listing) {
          await prisma.listingMedia.create({
            data: {
              url: publicUrl,
              key,
              fileName: sanitize(body.fileName, 200),
              fileSize: body.fileSize || buf.length,
              mimeType: contentType,
              listingDraftId: body.listingId,
            },
          });
        }
      }

      return jsonResponse(res, 201, { publicUrl, key });
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
        const body = await parseBody(req).catch(() => null);
        if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });
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

server.listen(3001, () => console.log("API ready at http://localhost:3001 (v0.3.0)"));
