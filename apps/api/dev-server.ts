// Development server for NestJS API using ts-node
// Usage: npx ts-node --project tsconfig.json dev-server.ts

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./src/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: "*", credentials: true });

  await app.listen(3001);
  console.log("API running at http://localhost:3001");
}

bootstrap().catch((error) => {
  console.error("API failed to start:", error);
  process.exit(1);
});