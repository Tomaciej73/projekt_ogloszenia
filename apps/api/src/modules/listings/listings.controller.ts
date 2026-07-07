import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ListingsService } from "./listings.service";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";

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
      throw new NotFoundException(`Listing with id "${id}" not found`);
    }
    return listing;
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateListingDto) {
    const userId = "user-1";
    const listing = this.listingsService.update(id, userId, dto);
    if (!listing) {
      throw new NotFoundException(`Listing with id "${id}" not found`);
    }
    return listing;
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    const userId = "user-1";
    const deleted = this.listingsService.remove(id, userId);
    if (!deleted) {
      throw new NotFoundException(`Listing with id "${id}" not found`);
    }
    return { deleted: true };
  }
}