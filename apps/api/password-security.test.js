const assert = require("node:assert/strict");
const crypto = require("crypto");
const test = require("node:test");
const {
  LEGACY_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  checkPasswordBreach,
  getPwnedPasswordHash,
  hashPassword,
  validatePasswordFormat,
  verifyPassword,
} = require("./password-security");

const passphrase = "river ember lantern meadow";

test("password hashing uses PBKDF2-SHA512 with the current work factor", () => {
  const storedHash = hashPassword(passphrase);

  assert.match(storedHash, new RegExp(`^pbkdf2-sha512\\$${PBKDF2_ITERATIONS}\\$[a-f0-9]{32}\\$[a-f0-9]{128}$`));
  assert.deepEqual(verifyPassword(passphrase, storedHash), { valid: true, needsRehash: false });
  assert.deepEqual(verifyPassword("different passphrase", storedHash), { valid: false, needsRehash: false });
});

test("legacy PBKDF2 hashes verify and request rehash on login", () => {
  const salt = "0123456789abcdef0123456789abcdef";
  const hash = crypto.pbkdf2Sync(passphrase, salt, LEGACY_PBKDF2_ITERATIONS, 64, "sha512").toString("hex");

  assert.deepEqual(verifyPassword(passphrase, `${salt}:${hash}`), { valid: true, needsRehash: true });
});

test("long passphrases are accepted without composition requirements", () => {
  assert.equal(validatePasswordFormat(passphrase), null);
  assert.match(validatePasswordFormat("short phrase"), /at least 15 characters/i);
});

test("password breach check sends only the SHA-1 hash prefix", async () => {
  const hash = getPwnedPasswordHash(passphrase);
  let requestedUrl = "";
  const result = await checkPasswordBreach(passphrase, {
    enabled: true,
    rangeUrl: "https://api.example.test/range/",
    timeoutMs: 1000,
    userAgent: "test-agent",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers["Add-Padding"], "true");
      return {
        ok: true,
        text: async () => `${hash.slice(5)}:42\r\n00000000000000000000000000000000000:1`,
      };
    },
  });

  assert.equal(requestedUrl, `https://api.example.test/range/${hash.slice(0, 5)}`);
  assert.ok(!requestedUrl.includes(passphrase));
  assert.deepEqual(result, { status: "breached", count: 42 });
});
