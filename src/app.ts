import sensible from "@fastify/sensible";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { TemplateNotFoundError } from "./core/templateEngine.js";
import { pdfRoutes } from "./modules/pdf/pdf.routes.js";
import { RenderTimeoutError } from "./modules/pdf/pdf.service.js";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    bodyLimit: 5 * 1024 * 1024,
    connectionTimeout: 60_000,
    keepAliveTimeout: 65_000,
  });

  void app.register(sensible);

  app.setErrorHandler((error: FastifyError, request, reply) => {
    try {
      if (error instanceof ZodError) {
        return reply.status(400).send({ error: "ValidationError", issues: error.issues });
      }

      if (error instanceof TemplateNotFoundError) {
        return reply.status(404).send({ error: "TemplateNotFoundError", message: error.message });
      }

      if (error instanceof RenderTimeoutError) {
        return reply.status(504).send({ error: "RenderTimeoutError", message: error.message });
      }

      request.log.error({ err: error }, "Unhandled error");
      return reply
        .status(error.statusCode ?? 500)
        .send({ error: "InternalServerError", message: error.message });
    } catch (sendErr) {
      request.log.warn(
        { err: sendErr, originalErr: error },
        "Failed to send an error response; client likely disconnected mid-stream",
      );
      return;
    }
  });

  app.get("/health", async () => ({
    status: "ok",
    uptime: process.uptime(),
  }));

  void app.register(pdfRoutes, { prefix: "/v1/docs" });

  return app;
}

// 1. Instanciar la app
const app = buildApp();

// 2. Exportar la función handler por defecto requerida por Vercel
export default async function handler(req: any, res: any) {
  await app.ready();
  app.server.emit("request", req, res);
}