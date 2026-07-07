// Development bootstrap — registers ts-node and starts the NestJS application.
// Usage: node --require ts-node/register src/dev.ts

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ["log", "error", "warn", "debug", "verbose"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: "*",
    credentials: true,
  });

  await app.listen(3001);
  console.log("API server listening on http://localhost:3001");
}

bootstrap().catch((error) => {
  console.error("Failed to start API server:", error);
  process.exit(1);
});