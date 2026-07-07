import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateListingDto } from "./dto/create-listing.dto";
import type { UpdateListingDto } from "./dto/update-listing.dto";
import type { Prisma } from "@prisma/client";

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateListingDto) {
    return this.prisma.listingDraft.create({
      data: {
        title: dto.title,
        description: dto.description,
        price: dto.price,
        currency: dto.currency ?? "PLN",
        category: dto.category,
        attributes: (dto.attributes ?? {}) as Prisma.InputJsonValue,
        location: (dto.location ?? {}) as Prisma.InputJsonValue,
        photoUrls: dto.photoUrls ?? [],
        deliveryOptions: dto.deliveryOptions ?? [],
        status: dto.status ?? "draft",
        userId,
        workspaceId: dto.workspaceId,
      },
    });
  }

  findAll(userId: string) {
    return this.prisma.listingDraft.findMany({
      where: { userId },
      include: { media: true },
      orderBy: { createdAt: "desc" },
    });
  }

  findOne(id: string, userId: string) {
    return this.prisma.listingDraft.findFirst({
      where: { id, userId },
      include: { media: true, externalListings: true },
    });
  }

  async update(id: string, userId: string, dto: UpdateListingDto) {
    const existing = await this.findOne(id, userId);
    if (!existing) {
      return null;
    }

    const data: Prisma.ListingDraftUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.attributes !== undefined) data.attributes = dto.attributes as Prisma.InputJsonValue;
    if (dto.location !== undefined) data.location = dto.location as Prisma.InputJsonValue;
    if (dto.photoUrls !== undefined) data.photoUrls = dto.photoUrls;
    if (dto.deliveryOptions !== undefined) data.deliveryOptions = dto.deliveryOptions;
    if (dto.status !== undefined) data.status = dto.status;

    return this.prisma.listingDraft.update({
      where: { id },
      data,
      include: { media: true },
    });
  }

  async remove(id: string, userId: string) {
    const existing = await this.findOne(id, userId);
    if (!existing) {
      return null;
    }

    await this.prisma.listingDraft.delete({ where: { id } });
    return existing;
  }
}