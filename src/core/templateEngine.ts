import { readFile } from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import { logger } from "../utils/logger.js";

const TEMPLATES_DIR = path.resolve(process.cwd(), "src/templates");

/** Compiled template cache, keyed by template name — avoids re-reading disk per request. */
const compiledCache = new Map<string, Handlebars.TemplateDelegate>();

Handlebars.registerHelper("formatDate", (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(date);
});

Handlebars.registerHelper("currency", (value: number, currency = "USD") => {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
});

/**
 * Strips markup capable of executing script or loading remote content.
 * Handlebars already HTML-escapes `{{expr}}` output, but this runs first as
 * defense in depth — e.g. against a template that uses `{{{triple-stash}}}`.
 */
const DANGEROUS_MARKUP_PATTERNS: RegExp[] = [
  /<script[\s\S]*?<\/script\s*>/gi,
  /<style[\s\S]*?<\/style\s*>/gi,
  /<iframe[\s\S]*?<\/iframe\s*>/gi,
  /<(iframe|object|embed|link|meta)\b[^>]*>/gi,
  /on\w+\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi,
  /javascript\s*:/gi,
];

function sanitizeString(value: string): string {
  return DANGEROUS_MARKUP_PATTERNS.reduce(
    (sanitized, pattern) => sanitized.replace(pattern, ""),
    value,
  );
}

function sanitizeData<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeString(value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item: unknown) => sanitizeData(item)) as unknown as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value !== null && typeof value === "object") {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>).map(
      ([key, entryValue]) => [key, sanitizeData(entryValue)] as const,
    );
    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

export class TemplateNotFoundError extends Error {
  public constructor(templateName: string) {
    super(`Template "${templateName}" was not found in ${TEMPLATES_DIR}`);
    this.name = "TemplateNotFoundError";
  }
}

async function loadTemplate(templateName: string): Promise<Handlebars.TemplateDelegate> {
  const cached = compiledCache.get(templateName);
  if (cached) {
    return cached;
  }

  const safeName = path.basename(templateName, ".hbs");
  const filePath = path.join(TEMPLATES_DIR, `${safeName}.hbs`);

  let source: string;
  try {
    source = await readFile(filePath, "utf-8");
  } catch {
    throw new TemplateNotFoundError(templateName);
  }

  const compiled = Handlebars.compile(source, { strict: false });
  compiledCache.set(templateName, compiled);
  logger.debug({ templateName }, "Template compiled and cached");
  return compiled;
}

export async function renderTemplate(
  templateName: string,
  data: Record<string, unknown>,
): Promise<string> {
  const template = await loadTemplate(templateName);
  return template(sanitizeData(data));
}
