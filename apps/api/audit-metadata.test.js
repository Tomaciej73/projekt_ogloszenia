const assert = require("node:assert/strict");
const test = require("node:test");
const { sanitizeAuditMetadata } = require("../../packages/shared/audit-metadata");

test("audit metadata removes secrets while keeping bounded operational context", () => {
  const metadata = sanitizeAuditMetadata({
    status: "published",
    bytes: 1024,
    accessToken: "must-not-be-recorded",
    password: "must-not-be-recorded",
    nested: { refreshToken: "must-not-be-recorded", result: "success" },
  });

  assert.deepEqual(metadata, {
    status: "published",
    bytes: 1024,
    nested: { result: "success" },
  });
});
