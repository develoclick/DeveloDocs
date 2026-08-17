import { type Browser, type BrowserContext, type Page } from "playwright";
import chromium from "@sparticuz/chromium";
import { chromium as playwrightChromium } from "playwright-core";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const PERFORMANCE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-gpu",
  "--disable-dev-shm-usage",
  "--no-first-run",
  "--no-zygote",
];

/** Recycle the whole Chromium process after this many pages to shed memory the V8/GPU-process GC never fully reclaims across many context churns. */
const RECYCLE_AFTER_PAGES = 100;

class BrowserPool {
  private static instance: BrowserPool | null = null;

  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private readonly pageContexts = new Map<Page, BrowserContext>();
  private activeCount = 0;
  private readonly waitQueue: Array<() => void> = [];
  private readonly maxConcurrency = env.BROWSER_POOL_SIZE;
  private pagesServedSinceLaunch = 0;
  private recycleRequested = false;

  private constructor() {}

  public static getInstance(): BrowserPool {
    if (!BrowserPool.instance) {
      BrowserPool.instance = new BrowserPool();
    }
    return BrowserPool.instance;
  }

  /** Pre-warms Chromium so the first request doesn't pay the launch cost. */
  public async warmUp(): Promise<void> {
    await this.getBrowser();
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (!this.launching) {
      this.launching = (async () => {
        // Solución al error 1: Uso de sintaxis de corchetes para noPropertyAccessFromIndexSignature
        const isVercel = !!process.env["VERCEL"];

        if (isVercel) {
          // Entorno Serverless (Vercel)
          const executablePath = await chromium.executablePath();

          return await playwrightChromium.launch({
            args: [...chromium.args, ...PERFORMANCE_ARGS],
            executablePath,
            // Solución a los errores 2 y 3: Se pasa un booleano directo
            headless: true,
          });
        }

        // Entorno Local (Desarrollo)
        const { chromium: localChromium } = await import("playwright");
        return await localChromium.launch({
          headless: true,
          args: PERFORMANCE_ARGS,
        });
      })()
        .then((browser) => {
          this.browser = browser as unknown as Browser;
          this.pagesServedSinceLaunch = 0;
          this.recycleRequested = false;
          browser.on("disconnected", () => {
            logger.warn("Chromium browser disconnected");
            this.browser = null;
          });
          logger.info("Chromium browser launched");
          return this.browser;
        })
        .finally(() => {
          this.launching = null;
        });
    }

    return this.launching;
  }

  private async acquireSlot(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return;
    }

    await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    this.activeCount += 1;
  }

  private releaseSlot(): void {
    this.activeCount -= 1;
    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Restarts the shared Chromium process once it's idle. Never runs while
   * pages are in flight — killing the browser mid-render would abort them —
   * so recycling happens opportunistically the next time activeCount hits 0.
   */
  private recycleIfDue(): void {
    if (this.activeCount > 0) {
      return;
    }

    if (!this.recycleRequested && this.pagesServedSinceLaunch < RECYCLE_AFTER_PAGES) {
      return;
    }

    const staleBrowser = this.browser;
    if (!staleBrowser) {
      return;
    }

    this.recycleRequested = false;
    this.pagesServedSinceLaunch = 0;
    this.browser = null;

    logger.info("Recycling Chromium process after reaching page-serve threshold");
    void staleBrowser
      .close()
      .catch((err: unknown) => logger.warn({ err }, "Error closing browser during recycle"));
  }

  /** Reuses the shared Chromium instance and opens a fresh, isolated page. */
  public async getPage(): Promise<Page> {
    await this.acquireSlot();

    try {
      const browser = await this.getBrowser();
      const context = await browser.newContext();
      const page = await context.newPage();
      this.pageContexts.set(page, context);

      this.pagesServedSinceLaunch += 1;
      if (this.pagesServedSinceLaunch >= RECYCLE_AFTER_PAGES) {
        this.recycleRequested = true;
      }

      return page;
    } catch (err) {
      this.releaseSlot();
      throw err;
    }
  }

  /** Closes the page's context efficiently and frees its concurrency slot. */
  public async releasePage(page: Page): Promise<void> {
    const context = this.pageContexts.get(page);
    this.pageContexts.delete(page);

    try {
      if (context) {
        await context.close();
      } else if (!page.isClosed()) {
        await page.close();
      }
    } catch (err) {
      logger.warn({ err }, "Failed to close browser page cleanly");
    } finally {
      this.releaseSlot();
      this.recycleIfDue();
    }
  }

  /**
   * Discards a page that timed out or is otherwise suspected hung. Frees the
   * concurrency slot immediately instead of awaiting `context.close()` —
   * which itself talks to the (possibly stuck) browser over CDP — so one
   * bad render never blocks the rest of the pool. The close is attempted in
   * the background and any failure is only logged.
   */
  public discardPage(page: Page): void {
    const context = this.pageContexts.get(page);
    this.pageContexts.delete(page);
    this.releaseSlot();
    this.recycleIfDue();

    const closePromise = context ? context.close() : page.close();
    closePromise.catch((err: unknown) => {
      logger.warn({ err }, "Failed to force-close a discarded browser page");
    });
  }

  /** Shuts down Chromium and all of its pages/contexts in one go. */
  public async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.pageContexts.clear();
  }
}

export const browserPool = BrowserPool.getInstance();