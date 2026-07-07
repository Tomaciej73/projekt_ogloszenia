-- AlterTable
ALTER TABLE "ListingDraft" ADD COLUMN     "deliveryOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
