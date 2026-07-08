require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Queue } = require("bullmq");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { getPresignedUploadUrl } = require("./minio");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6739";
const publicationQueue = new Queue("publication", { connection: { url: REDIS_URL } });

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRY = "24h";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JSON_SPACES = 2;

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data, null, JSON_SPACES));
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
  return null;
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

const resetTokens = new Map(); // email → { token, expires }

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

  const path = new URL(req.url, `http://${req.headers.host}`).pathname;

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

      if (await prisma.user.findUnique({ where: { email } }))
        return jsonResponse(res, 409, { error: "User with this email already exists" });

      const user = await prisma.user.create({
        data: { email, passwordHash: hashPassword(body.password), name },
      });
      await prisma.workspace.create({
        data: { name: `${name}'s Workspace`, slug: `ws-${user.id.slice(0, 8)}`, members: { create: { userId: user.id, role: "owner" } } },
      });
      await seedProviders();
      const token = signToken(user.id);
      return jsonResponse(res, 201, { user: { id: user.id, email: user.email, name: user.name }, token });
    }

    // ── Auth: Login ──
    if (path === "/auth/login" && req.method === "POST") {
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const email = sanitize(body.email, 254).toLowerCase();
      const emailErr = validateEmail(email);
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });
      if (!body.password) return jsonResponse(res, 400, { error: "Password is required." });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return jsonResponse(res, 401, { error: "Invalid email or password" });

      const pwdOk = verifyPassword(body.password, user.passwordHash);
      if (!pwdOk) return jsonResponse(res, 401, { error: "Invalid email or password" });

      await seedProviders();
      const token = signToken(user.id);
      return jsonResponse(res, 200, { user: { id: user.id, email: user.email, name: user.name }, token });
    }

    // ── Auth: Forgot Password ──
    if (path === "/auth/forgot-password" && req.method === "POST") {
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const email = sanitize(body.email, 254).toLowerCase();
      const emailErr = validateEmail(email);
      if (emailErr) return jsonResponse(res, 400, { error: emailErr });

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return jsonResponse(res, 200, { message: "If this email is registered, a reset link has been sent." });

      const rToken = crypto.randomBytes(32).toString("hex");
      resetTokens.set(email, { token: rToken, expires: Date.now() + 3600000 }); // 1 hour

      console.log(`[DEV] Password reset token for ${email}: ${rToken}`);
      return jsonResponse(res, 200, { message: "If this email is registered, a reset link has been sent.", devToken: rToken });
    }

    // ── Auth: Reset Password ──
    if (path === "/auth/reset-password" && req.method === "POST") {
      const body = await parseBody(req).catch(() => null);
      if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });

      const email = sanitize(body.email, 254).toLowerCase();
      const pwdErr = validatePassword(body.password);
      if (pwdErr) return jsonResponse(res, 400, { error: pwdErr });

      const entry = resetTokens.get(email);
      if (!entry || entry.token !== body.token || Date.now() > entry.expires) {
        return jsonResponse(res, 400, { error: "Invalid or expired reset token." });
      }

      await prisma.user.update({
        where: { email },
        data: { passwordHash: hashPassword(body.password) },
      });
      resetTokens.delete(email);
      return jsonResponse(res, 200, { message: "Password has been reset. You can now log in with the new password." });
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
        await prisma.listingDraft.delete({ where: { id, userId: uid } });
        return jsonResponse(res, 200, { deleted: true, id });
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