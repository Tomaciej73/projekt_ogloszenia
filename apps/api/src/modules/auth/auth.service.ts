import { ForbiddenException, Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import { loadApiConfig } from "@multiportal/config";
import { PrismaService } from "../../prisma/prisma.service";

const config = loadApiConfig();

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateDevUser() {
    if (config.NODE_ENV !== "development") {
      throw new ForbiddenException("Development user provisioning is disabled outside development.");
    }

    let user = await this.prisma.user.findUnique({
      where: { email: "dev@multiportal.local" },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: "dev@multiportal.local",
          passwordHash: randomBytes(64).toString("hex"),
          name: "Developer",
        },
      });

      // Create default workspace
      await this.prisma.workspace.create({
        data: {
          name: "Default Workspace",
          slug: "default",
          members: {
            create: {
              userId: user.id,
              role: "owner",
            },
          },
        },
      });

      // Seed marketplace providers
      const providers = [
        { name: "OLX", slug: "olx", displayName: "OLX" },
        { name: "Vinted Pro", slug: "vinted_pro", displayName: "Vinted Pro" },
        { name: "Facebook Marketplace", slug: "facebook_marketplace", displayName: "Facebook Marketplace" },
      ];

      for (const p of providers) {
        await this.prisma.marketplaceProvider.upsert({
          where: { slug: p.slug },
          create: p,
          update: {},
        });
      }

      // Connect mock account
      const olxProvider = await this.prisma.marketplaceProvider.findUnique({
        where: { slug: "olx" },
      });

      if (olxProvider) {
        await this.prisma.marketplaceAccount.create({
          data: {
            userId: user.id,
            marketplaceProviderId: olxProvider.id,
            providerUserId: "dev-olx-user",
            accessToken: randomBytes(32).toString("hex"),
          },
        });
      }
    }

    return user;
  }
}
