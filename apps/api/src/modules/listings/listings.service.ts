import { Injectable } from "@nestjs/common";
import { ListingDraftStatus } from "@multiportal/shared";
import type { CreateListingDto } from "./dto/create-listing.dto";
import type { UpdateListingDto } from "./dto/update-listing.dto";

export interface ListingRecord {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  attributes: Record<string, unknown>;
  location: Record<string, unknown>;
  photoUrls: string[];
  deliveryOptions: string[];
  status: ListingDraftStatus;
  userId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * In-memory listing draft service for development.
 * Will be replaced with Prisma-backed persistence in the next iteration.
 */
@Injectable()
export class ListingsService {
  private listings: Map<string, ListingRecord> = new Map();
  private idCounter = 0;

  private generateId(): string {
    this.idCounter += 1;
    return `draft-${this.idCounter}-${Date.now()}`;
  }

  create(userId: string, dto: CreateListingDto): ListingRecord {
    const id = this.generateId();
    const now = new Date();

    const record: ListingRecord = {
      id,
      title: dto.title,
      description: dto.description,
      price: dto.price,
      currency: dto.currency ?? "PLN",
      category: dto.category,
      attributes: dto.attributes ?? {},
      location: (dto.location as Record<string, unknown>) ?? {},
      photoUrls: dto.photoUrls ?? [],
      deliveryOptions: dto.deliveryOptions ?? [],
      status: dto.status ?? ListingDraftStatus.DRAFT,
      userId,
      workspaceId: dto.workspaceId,
      createdAt: now,
      updatedAt: now,
    };

    this.listings.set(id, record);
    return record;
  }

  findAll(userId: string): ListingRecord[] {
    return Array.from(this.listings.values()).filter((l) => l.userId === userId);
  }

  findOne(id: string, userId: string): ListingRecord | undefined {
    const listing = this.listings.get(id);
    if (!listing || listing.userId !== userId) {
      return undefined;
    }
    return listing;
  }

  update(id: string, userId: string, dto: UpdateListingDto): ListingRecord | undefined {
    const listing = this.findOne(id, userId);
    if (!listing) {
      return undefined;
    }

    if (dto.title !== undefined) listing.title = dto.title;
    if (dto.description !== undefined) listing.description = dto.description;
    if (dto.price !== undefined) listing.price = dto.price;
    if (dto.currency !== undefined) listing.currency = dto.currency;
    if (dto.category !== undefined) listing.category = dto.category;
    if (dto.attributes !== undefined) listing.attributes = dto.attributes;
    if (dto.location !== undefined) listing.location = dto.location;
    if (dto.photoUrls !== undefined) listing.photoUrls = dto.photoUrls;
    if (dto.deliveryOptions !== undefined) listing.deliveryOptions = dto.deliveryOptions;
    if (dto.status !== undefined) listing.status = dto.status;

    listing.updatedAt = new Date();
    this.listings.set(id, listing);
    return listing;
  }

  remove(id: string, userId: string): boolean {
    const listing = this.findOne(id, userId);
    if (!listing) {
      return false;
    }
    this.listings.delete(id);
    return true;
  }
}