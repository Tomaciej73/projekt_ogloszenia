import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadConfig } from "@multiportal/config";

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, {
    logger:
      config.LOG_LEVEL === "debug"
        ? ["log", "error", "warn", "debug", "verbose"]
        : ["log", "error", "warn"],
  });

  app.enableCors({
    origin: config.NODE_ENV === "production" ? [] : "*",
    credentials: true,
  });

  await app.listen(config.API_PORT);
  console.log(`API server listening on port ${config.API_PORT}`);
}

bootstrap().catch((error) => {
  console.error("Failed to start API server:", error);
  process.exit(1);
});