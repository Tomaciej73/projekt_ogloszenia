const crypto = require("crypto");

const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_MAX_LENGTH = 256;
const PBKDF2_DIGEST = "sha512";
const PBKDF2_KEY_LENGTH = 64;
const PBKDF2_ITERATIONS = 220000;
const LEGACY_PBKDF2_ITERATIONS = 100000;
const PASSWORD_HASH_SCHEME = "pbkdf2-sha512";

function validatePasswordFormat(password) {
  if (!password || typeof password !== "string") return "Password is required.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters. Use a long, unique passphrase.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password is too long (max ${PASSWORD_MAX_LENGTH} characters).`;
  }
  if (password.includes("\u0000")) return "Password contains an unsupported character.";
  return null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST).toString("hex");
  return `${PASSWORD_HASH_SCHEME}$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function parsePasswordHash(storedHash) {
  if (typeof storedHash !== "string" || !storedHash) return null;

  const modernParts = storedHash.split("$");
  if (modernParts.length === 4 && modernParts[0] === PASSWORD_HASH_SCHEME) {
    const iterations = Number.parseInt(modernParts[1], 10);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000000) return null;
    return {
      iterations,
      salt: modernParts[2],
      hash: modernParts[3],
      needsRehash: iterations < PBKDF2_ITERATIONS,
    };
  }

  const legacyParts = storedHash.split(":");
  if (legacyParts.length === 2) {
    return {
      iterations: LEGACY_PBKDF2_ITERATIONS,
      salt: legacyParts[0],
      hash: legacyParts[1],
      needsRehash: true,
    };
  }

  return null;
}

function verifyPassword(password, storedHash) {
  const parsed = parsePasswordHash(storedHash);
  if (!parsed || !/^[a-f0-9]{32}$/i.test(parsed.salt) || !/^[a-f0-9]{128}$/i.test(parsed.hash)) {
    return { valid: false, needsRehash: false };
  }

  const actualHash = crypto
    .pbkdf2Sync(password, parsed.salt, parsed.iterations, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
    .toString("hex");
  const expectedBuffer = Buffer.from(parsed.hash, "hex");
  const actualBuffer = Buffer.from(actualHash, "hex");
  const valid = expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);

  return { valid, needsRehash: valid && parsed.needsRehash };
}

function getPwnedPasswordHash(password) {
  return crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
}

async function checkPasswordBreach(password, options) {
  if (!options.enabled) return { status: "disabled", count: 0 };

  const passwordHash = getPwnedPasswordHash(password);
  const prefix = passwordHash.slice(0, 5);
  const suffix = passwordHash.slice(5);
  const rangeUrl = options.rangeUrl.endsWith("/") ? options.rangeUrl : `${options.rangeUrl}/`;
  const endpoint = new URL(prefix, rangeUrl).toString();

  try {
    const response = await options.fetchImpl(endpoint, {
      headers: {
        "Add-Padding": "true",
        "User-Agent": options.userAgent,
      },
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!response.ok) return { status: "unavailable", count: 0 };

    const match = (await response.text())
      .split(/\r?\n/)
      .map((line) => line.trim().split(":"))
      .find(([candidateSuffix]) => candidateSuffix?.toUpperCase() === suffix);
    const count = match ? Number.parseInt(match[1], 10) || 0 : 0;

    return count > 0 ? { status: "breached", count } : { status: "clean", count: 0 };
  } catch {
    return { status: "unavailable", count: 0 };
  }
}

module.exports = {
  LEGACY_PBKDF2_ITERATIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PBKDF2_ITERATIONS,
  checkPasswordBreach,
  getPwnedPasswordHash,
  hashPassword,
  validatePasswordFormat,
  verifyPassword,
};
