const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  buildMarketplaceAccountResponse,
  isDevelopmentMockMarketplaceAccountLinkingAllowed,
} = require("./marketplace-account-response");

test("marketplace account response never includes provider credentials or provider user IDs", () => {
  const privateAccountFields = {
    providerUserId: `provider-user-${crypto.randomUUID()}`,
    accessToken: crypto.randomBytes(32).toString("hex"),
    refreshToken: crypto.randomBytes(32).toString("hex"),
  };
  const response = buildMarketplaceAccountResponse({
    id: "account-id",
    isActive: true,
    createdAt: new Date("2026-07-13T10:00:00.000Z"),
    updatedAt: new Date("2026-07-13T10:05:00.000Z"),
    ...privateAccountFields,
    tokenExpiresAt: new Date("2026-07-14T10:00:00.000Z"),
    marketplaceProvider: {
      id: "provider-id",
      slug: "olx",
      displayName: "OLX",
      logoUrl: null,
      capabilities: { supportsCreate: false },
    },
  });

  assert.deepEqual(response, {
    id: "account-id",
    isActive: true,
    createdAt: new Date("2026-07-13T10:00:00.000Z"),
    updatedAt: new Date("2026-07-13T10:05:00.000Z"),
    marketplaceProvider: {
      id: "provider-id",
      slug: "olx",
      displayName: "OLX",
      logoUrl: null,
      capabilities: { supportsCreate: false },
    },
  });
  assert.equal(JSON.stringify(response).includes(privateAccountFields.accessToken), false);
  assert.equal(JSON.stringify(response).includes(privateAccountFields.refreshToken), false);
  assert.equal(JSON.stringify(response).includes(privateAccountFields.providerUserId), false);
});

test("mock marketplace-account linking is development-only", () => {
  assert.equal(isDevelopmentMockMarketplaceAccountLinkingAllowed("development"), true);
  assert.equal(isDevelopmentMockMarketplaceAccountLinkingAllowed("production"), false);
  assert.equal(isDevelopmentMockMarketplaceAccountLinkingAllowed("test"), false);
});
