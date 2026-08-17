import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomId } from "../utils/helpers.js";

export interface StorageProvider {
  save: (buffer: Buffer, extension: string) => Promise<{ id: string; location: string }>;
}

const OUTPUT_DIR = path.resolve(process.cwd(), ".tmp/pdfs");

class LocalStorageProvider implements StorageProvider {
  public async save(buffer: Buffer, extension: string): Promise<{ id: string; location: string }> {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const id = randomId("pdf");
    const location = path.join(OUTPUT_DIR, `${id}.${extension}`);
    await writeFile(location, buffer);
    return { id, location };
  }
}

export const storage: StorageProvider = new LocalStorageProvider();
