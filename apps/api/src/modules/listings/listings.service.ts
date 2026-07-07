import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { CreateListingDto } from "./dto/create-listing.dto";
import type { UpdateListingDto } from "./dto/update-listing.dto";

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
        attributes: dto.attributes ?? {},
        location: dto.location ?? {},
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

    return this.prisma.listingDraft.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.attributes !== undefined && { attributes: dto.attributes }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.photoUrls !== undefined && { photoUrls: dto.photoUrls }),
        ...(dto.deliveryOptions !== undefined && { deliveryOptions: dto.deliveryOptions }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
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