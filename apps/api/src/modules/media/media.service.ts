import { Injectable, NotImplementedException } from "@nestjs/common";
import { loadApiConfig } from "@multiportal/config";

const config = loadApiConfig();

function encodePathSegments(value: string): string {
  return value
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

@Injectable()
export class MediaService {
  async getUploadUrl(_key: string, _contentType: string): Promise<string> {
    throw new NotImplementedException(
      "Direct upload URLs are disabled in the active runtime. Upload media through the API instead.",
    );
  }

  /**
   * Builds the same-origin API route for an already authorized media object.
   */
  getMediaPath(key: string): string {
    return `/media-files/${encodeURIComponent(config.S3_BUCKET)}/${encodePathSegments(key)}`;
  }
}
