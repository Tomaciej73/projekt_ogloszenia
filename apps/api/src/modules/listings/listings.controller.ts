import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from "@nestjs/common";
import { ListingsService } from "./listings.service";
import type { CreateListingDto } from "./dto/create-listing.dto";
import type { UpdateListingDto } from "./dto/update-listing.dto";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Post()
  create(@Body() dto: CreateListingDto) {
    // TODO: replace hardcoded userId with authenticated user from request
    const userId = "user-1";
    return this.listingsService.create(userId, dto);
  }

  @Get()
  findAll() {
    const userId = "user-1";
    return this.listingsService.findAll(userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    const userId = "user-1";
    const listing = this.listingsService.findOne(id, userId);
    if (!listing) {
      return { error: "Listing not found" };
    }
    return listing;
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateListingDto) {
    const userId = "user-1";
    const listing = this.listingsService.update(id, userId, dto);
    if (!listing) {
      return { error: "Listing not found" };
    }
    return listing;
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    const userId = "user-1";
    const deleted = this.listingsService.remove(id, userId);
    if (!deleted) {
      return { error: "Listing not found" };
    }
    return { deleted: true };
  }
}