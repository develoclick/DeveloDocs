import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { browserPool } from "../src/core/browserPool.js";

const validInvoicePayload = {
  templateName: "invoice",
  data: {
    invoiceNumber: "INV-TEST-001",
    issueDate: "2026-08-14",
    dueDate: "2026-08-29",
    currency: "USD",
    company: { name: "DeveloDocs Inc.", address: "500 Market St, San Francisco, CA" },
    customer: { name: "Acme Corp", email: "billing@acme.com" },
    items: [{ description: "Integration test item", quantity: 1, unitPrice: 100, subtotal: 100 }],
    subtotal: 100,
    tax: 0,
    total: 100,
  },
};

describe("POST /v1/docs/generate", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await browserPool.warmUp();
    app = buildApp();
    await app.ready();
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await browserPool.close();
  });

  it("returns a PDF document for a valid payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/docs/generate",
      payload: validInvoicePayload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.rawPayload.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  }, 15_000);

  it("rejects a payload missing required invoice fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/docs/generate",
      payload: { templateName: "invoice", data: { invoiceNumber: "INV-TEST-002" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "ValidationError" });
  });

  it("returns 404 when the template does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/docs/generate",
      payload: { ...validInvoicePayload, templateName: "does-not-exist" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "TemplateNotFoundError" });
  });
});

describe("GET /health", () => {
  it("reports service status and uptime", async () => {
    const app = buildApp();
    await app.ready();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");

    await app.close();
  });
});
