require("dotenv").config();

const http = require("http");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const JSON_SPACES = 2; // pretty-print JSON indentation

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

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(":");
  return hash === crypto.pbkdf2Sync(pw, salt, 100000, 64, "sha512").toString("hex");
}

const sessions = new Map();

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
  return sessions.get(auth.slice(7)) || null;
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
    // ── Auth ──
    if (path === "/auth/register" && req.method === "POST") {
      const body = await parseBody(req).catch(() => null);
      if (!body?.email || !body?.password || !body?.name)
        return jsonResponse(res, 400, { error: "email, password, and name are required" });
      if (await prisma.user.findUnique({ where: { email: body.email } }))
        return jsonResponse(res, 409, { error: "User with this email already exists" });

      const user = await prisma.user.create({
        data: { email: body.email, passwordHash: hashPassword(body.password), name: body.name },
      });
      await prisma.workspace.create({
        data: { name: `${body.name}'s Workspace`, slug: `ws-${user.id.slice(0,8)}`, members: { create: { userId: user.id, role: "owner" } } },
      });
      await seedProviders();
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      return jsonResponse(res, 201, { user: { id: user.id, email: user.email, name: user.name }, token });
    }

    if (path === "/auth/login" && req.method === "POST") {
      const body = await parseBody(req).catch(() => null);
      if (!body?.email || !body?.password)
        return jsonResponse(res, 400, { error: "email and password are required" });
      const user = await prisma.user.findUnique({ where: { email: body.email } });
      if (!user || !verifyPassword(body.password, user.passwordHash))
        return jsonResponse(res, 401, { error: "Invalid email or password" });
      await seedProviders();
      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      return jsonResponse(res, 200, { user: { id: user.id, email: user.email, name: user.name }, token });
    }

    if (path === "/auth/me" && req.method === "GET") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });
      const user = await prisma.user.findUnique({ where: { id: uid } });
      return jsonResponse(res, 200, { user: { id: user.id, email: user.email, name: user.name } });
    }

    // ── Health ──
    if (path === "/" || path === "/health")
      return jsonResponse(res, 200, { status: "ok", db: "connected", version: "0.2.0", uptime: process.uptime() });

    // ── Listings ──
    if (path === "/listings") {
      const uid = getUserId(req);
      if (!uid) return jsonResponse(res, 401, { error: "Authentication required" });

      if (req.method === "GET") {
        const listings = await prisma.listingDraft.findMany({ where: { userId: uid }, orderBy: { createdAt: "desc" } });
        return jsonResponse(res, 200, { listings });
      }
      if (req.method === "POST") {
        const body = await parseBody(req).catch(() => null);
        if (!body) return jsonResponse(res, 400, { error: "Invalid JSON" });
        const ws = await prisma.workspace.findFirst({ where: { members: { some: { userId: uid } } } });
        const listing = await prisma.listingDraft.create({
          data: {
            title: body.title || "Untitled", description: body.description || "", price: Number(body.price) || 0,
            currency: body.currency || "PLN", category: body.category || "Other",
            attributes: body.attributes || {}, location: body.location || {},
            photoUrls: body.photoUrls || [], deliveryOptions: body.deliveryOptions || [],
            userId: uid, workspaceId: body.workspaceId || ws?.id || "",
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
      if (!account) return jsonResponse(res, 400, { error: "No connected marketplace account. Connect a provider first." });
      const extListing = await prisma.externalListing.create({
        data: { listingDraftId: body.listingId, marketplaceProviderId: account.marketplaceProviderId, marketplaceAccountId: account.id, status: "queued" },
      });
      const key = crypto.randomUUID();
      const job = await prisma.publicationJob.create({
        data: { idempotencyKey: key, listingDraftId: body.listingId, marketplaceAccountId: account.id, externalListingId: extListing.id, status: "pending" },
      });
      setTimeout(async () => {
        try {
          await prisma.publicationJob.update({ where: { id: job.id }, data: { status: "processing" } });
          await new Promise(r => setTimeout(r, 300));
          await prisma.externalListing.update({ where: { id: extListing.id }, data: { externalId: `mock-${Date.now()}`, externalUrl: `https://mock.example.com/${Date.now()}`, status: "published" } });
          await prisma.publicationJob.update({ where: { id: job.id }, data: { status: "success", completedAt: new Date() } });
        } catch (e) {
          await prisma.publicationJob.update({ where: { id: job.id }, data: { status: "failed", errorMessage: e.message } });
        }
      }, 1000);
      return jsonResponse(res, 201, { job: { id: job.id, idempotencyKey: key, status: "pending" } });
    }

    const jobMatch = path.match(/^\/publication-jobs\/([^/]+)$/);
    if (jobMatch && req.method === "GET") {
      const job = await prisma.publicationJob.findUnique({ where: { id: jobMatch[1] }, include: { externalListing: true } });
      return job ? jsonResponse(res, 200, { job }) : jsonResponse(res, 404, { error: "Job not found" });
    }

    // ── Providers ──
    if (path === "/providers" && req.method === "GET") {
      const providers = await prisma.marketplaceProvider.findMany();
      return jsonResponse(res, 200, { providers });
    }

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
        const provider = await prisma.marketplaceProvider.findUnique({ where: { slug: body.providerSlug } });
        if (!provider) return jsonResponse(res, 400, { error: "Provider not found" });
        const account = await prisma.marketplaceAccount.upsert({
          where: { userId_marketplaceProviderId: { userId: uid, marketplaceProviderId: provider.id } },
          create: { userId: uid, marketplaceProviderId: provider.id, providerUserId: body.providerUserId || `user-${uid.slice(0,8)}`, accessToken: "placeholder-encrypted-token", isActive: true },
          update: { isActive: true },
        });
        return jsonResponse(res, 201, { account });
      }
    }

    return jsonResponse(res, 404, { error: "Not found", path });
  } catch (err) {
    console.error(err);
    return jsonResponse(res, 500, { error: err.message });
  }
});

server.listen(3001, () => console.log("API ready at http://localhost:3001"));