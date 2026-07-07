import { Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("dev-login")
  async devLogin() {
    const user = await this.authService.getOrCreateDevUser();
    return { userId: user.id, email: user.email, name: user.name };
  }
}