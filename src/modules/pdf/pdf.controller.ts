import { Readable } from "node:stream";
import type { FastifyReply, FastifyRequest } from "fastify";
import { generateDocumentSchema } from "./pdf.schema.js";
import { renderPdfFromTemplate } from "./pdf.service.js";

export async function generateDocumentHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { templateName, data } = generateDocumentSchema.parse(request.body);

  const pdfBuffer = await renderPdfFromTemplate(templateName, data);

  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `inline; filename="${templateName}.pdf"`)
    .send(Readable.from(pdfBuffer));
}
