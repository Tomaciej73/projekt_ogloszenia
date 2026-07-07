import { IsString, IsNumber, IsOptional, IsArray, IsObject, Min } from "class-validator";
import { ListingDraftStatus } from "@multiportal/shared";

export class CreateListingDto {
  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  location?: {
    city: string;
    region?: string;
    country: string;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deliveryOptions?: string[];

  @IsOptional()
  status?: ListingDraftStatus;

  @IsString()
  workspaceId!: string;
}