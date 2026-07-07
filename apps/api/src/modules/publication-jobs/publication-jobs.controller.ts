import { Controller, Post, Get, Param, Body } from "@nestjs/common";
import { PublicationJobsService } from "./publication-jobs.service";

@Controller("publication-jobs")
export class PublicationJobsController {
  constructor(private readonly jobsService: PublicationJobsService) {}

  @Post()
  async create(@Body() body: { listingId: string; accountId: string }) {
    return this.jobsService.createJob(body.listingId, body.accountId);
  }

  @Get(":id")
  async getStatus(@Param("id") id: string) {
    return this.jobsService.getJobStatus(id);
  }
}