import { Module } from "@nestjs/common";
import { PublicationJobsController } from "./publication-jobs.controller";
import { PublicationJobsService } from "./publication-jobs.service";

@Module({
  controllers: [PublicationJobsController],
  providers: [PublicationJobsService],
  exports: [PublicationJobsService],
})
export class PublicationJobsModule {}
