import { loadConfig } from "@multiportal/config";

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  console.log(`Worker starting in ${config.NODE_ENV} mode`);
  console.log(`Redis: ${config.REDIS_URL}`);

  // BullMQ worker will be initialized here
  // Queue processors will be registered from ./queues and ./processors

  console.log("Worker is running. Press Ctrl+C to stop.");
}

bootstrap().catch((error) => {
  console.error("Failed to start worker:", error);
  process.exit(1);
});