import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class MarketplaceAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.marketplaceAccount.findMany({
      where: { userId, isActive: true },
      include: { marketplaceProvider: true },
    });
  }

  async connectProvider(
    userId: string,
    providerSlug: string,
    providerUserId: string,
  ) {
    const provider = await this.prisma.marketplaceProvider.findUnique({
      where: { slug: providerSlug },
    });

    if (!provider) {
      throw new Error(`Provider "${providerSlug}" not found`);
    }

    return this.prisma.marketplaceAccount.upsert({
      where: {
        userId_marketplaceProviderId: {
          userId,
          marketplaceProviderId: provider.id,
        },
      },
      create: {
        userId,
        marketplaceProviderId: provider.id,
        providerUserId,
        accessToken: "placeholder-encrypted-token",
        isActive: true,
      },
      update: {
        providerUserId,
        isActive: true,
      },
    });
  }
}