import type { FastifyInstance } from "fastify";
import { generateDocumentHandler } from "./pdf.controller.js";

export async function pdfRoutes(app: FastifyInstance): Promise<void> {
  app.post("/generate", generateDocumentHandler);
}
