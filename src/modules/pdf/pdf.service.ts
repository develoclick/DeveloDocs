import pLimit from "p-limit";
import { browserPool } from "../../core/browserPool.js";
import { renderTemplate } from "../../core/templateEngine.js";
import { logger } from "../../utils/logger.js";

/** Optimal number of Chromium renders to run in parallel across the service. */
const RENDER_CONCURRENCY = 6;
/** Hard ceiling per render — a stuck page is discarded rather than left blocking the pool. */
const RENDER_TIMEOUT_MS = 10_000;

const renderLimit = pLimit(RENDER_CONCURRENCY);

export class RenderTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`PDF render timed out after ${timeoutMs}ms`);
    this.name = "RenderTimeoutError";
  }
}

export async function renderPdfFromTemplate(
  templateName: string,
  data: Record<string, unknown>,
): Promise<Buffer> {
  return renderLimit(() => renderPdfInternal(templateName, data));
}

async function renderPdfInternal(
  templateName: string,
  data: Record<string, unknown>,
): Promise<Buffer> {
  const html = await renderTemplate(templateName, data);
  const page = await browserPool.getPage();

  let timedOut = false;
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new RenderTimeoutError(RENDER_TIMEOUT_MS));
    }, RENDER_TIMEOUT_MS);
  });

  try {
    const renderPromise = (async (): Promise<Buffer> => {
      await page.setContent(html, { waitUntil: "networkidle" });
      return page.pdf({ format: "A4", printBackground: true });
    })();

    return await Promise.race([renderPromise, timeoutPromise]);
  } catch (err) {
    logger.error({ err, templateName }, "Failed to render PDF");
    throw err;
  } finally {
    clearTimeout(timer);
    if (timedOut) {
      browserPool.discardPage(page);
    } else {
      await browserPool.releasePage(page);
    }
  }
}
