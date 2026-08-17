import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { browserPool } from "./core/browserPool.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  await browserPool.warmUp();

  const app = buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "Shutting down gracefully");
    try {
      await app.close();
      await browserPool.close();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch (err) {
    logger.error({ err }, "Failed to start server");
    process.exit(1);
  }
}

void main();
