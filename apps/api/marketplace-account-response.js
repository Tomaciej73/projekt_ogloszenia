const marketplaceAccountResponseSelect = {
  id: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  marketplaceProvider: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      logoUrl: true,
      capabilities: true,
    },
  },
};

/**
 * Creates the only marketplace-account shape allowed in browser API responses.
 * Provider credentials and provider user identifiers must never leave the API.
 */
function buildMarketplaceAccountResponse(account) {
  return {
    id: account.id,
    isActive: account.isActive,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    marketplaceProvider: account.marketplaceProvider
      ? {
          id: account.marketplaceProvider.id,
          slug: account.marketplaceProvider.slug,
          displayName: account.marketplaceProvider.displayName,
          logoUrl: account.marketplaceProvider.logoUrl,
          capabilities: account.marketplaceProvider.capabilities,
        }
      : null,
  };
}

function isDevelopmentMockMarketplaceAccountLinkingAllowed(nodeEnv) {
  return nodeEnv === "development";
}

module.exports = {
  buildMarketplaceAccountResponse,
  isDevelopmentMockMarketplaceAccountLinkingAllowed,
  marketplaceAccountResponseSelect,
};
