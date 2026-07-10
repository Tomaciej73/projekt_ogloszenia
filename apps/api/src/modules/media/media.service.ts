import { Injectable } from "@nestjs/common";
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
  /**
   * Placeholder for S3/MinIO upload logic.
   * Will integrate with MinIO client when full media module is implemented.
   */
  async getUploadUrl(key: string, contentType: string): Promise<string> {
    void contentType;
    const storageBaseUrl = (config.S3_PUBLIC_ENDPOINT || config.S3_ENDPOINT).replace(/\/$/, "");
    return new URL(`${config.S3_BUCKET}/${encodePathSegments(key)}`, `${storageBaseUrl}/`).toString();
  }
}
