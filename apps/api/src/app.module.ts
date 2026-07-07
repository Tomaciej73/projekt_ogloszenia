import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { ListingsModule } from "./modules/listings/listings.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { WorkspacesModule } from "./modules/workspaces/workspaces.module";
import { MediaModule } from "./modules/media/media.module";
import { MarketplaceAccountsModule } from "./modules/marketplace-accounts/marketplace-accounts.module";
import { MarketplaceConnectorsModule } from "./modules/marketplace-connectors/marketplace-connectors.module";
import { PublicationJobsModule } from "./modules/publication-jobs/publication-jobs.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { AuditLogModule } from "./modules/audit-log/audit-log.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    ListingsModule,
    MediaModule,
    MarketplaceAccountsModule,
    MarketplaceConnectorsModule,
    PublicationJobsModule,
    WebhooksModule,
    AuditLogModule,
  ],
})
export class AppModule {}
