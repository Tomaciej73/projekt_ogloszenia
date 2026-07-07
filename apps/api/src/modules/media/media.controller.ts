import { Controller, Post, Body } from "@nestjs/common";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("upload-url")
  async getUploadUrl(@Body() body: { key: string; contentType: string }) {
    const url = await this.mediaService.getUploadUrl(body.key, body.contentType);
    return { uploadUrl: url };
  }
}