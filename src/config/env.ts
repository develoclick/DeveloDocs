import "dotenv/config";
import { z } from "zod";

// Función helper para convertir cadenas vacías a undefined
const emptyToUndefined = z.preprocess((val) => {
  if (typeof val === "string" && val.trim() === "") {
    return undefined;
  }
  return val;
}, z.unknown());

const envSchema = z.object({
  NODE_ENV: emptyToUndefined.pipe(
    z.enum(["development", "production", "test"]).default("development")
  ),
  HOST: emptyToUndefined.pipe(
    z.string().default("0.0.0.0")
  ),
  PORT: emptyToUndefined.pipe(
    z.coerce.number().int().positive().default(3000)
  ),
  LOG_LEVEL: emptyToUndefined.pipe(
    z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
  ),
  BROWSER_POOL_SIZE: emptyToUndefined.pipe(
    z.coerce.number().int().positive().default(3)
  ),
  BROWSER_IDLE_TIMEOUT_MS: emptyToUndefined.pipe(
    z.coerce.number().int().positive().default(60_000)
  ),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;