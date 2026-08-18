/**
 * Extreme load benchmark for DeveloDocs — three escalating stages meant to
 * validate that the service degrades gracefully (queues, times out, recovers)
 * instead of crashing or leaking memory under a multi-thousand-connection spike.
 *
 * Requires the server to already be running (npm run dev / npm start / docker compose up).
 *
 * Usage:
 *   npm run benchmark:extreme
 *
 * Every stage's connection count and duration can be overridden individually,
 * which is useful for a quick smoke test before committing to the full run:
 *   BENCH_STAGE3_CONNECTIONS=50 BENCH_STAGE3_DURATION=5 npm run benchmark:extreme
 */
import autocannon from "autocannon";

const BASE_URL = process.env.BENCHMARK_URL ?? "https://develo-docs.vercel.app";

const payload = JSON.stringify({
  templateName: "invoice",
  data: {
    invoiceNumber: "STRESS-0001",
    issueDate: "2026-08-14",
    dueDate: "2026-08-29",
    currency: "USD",
    company: { name: "DeveloClick S.A.C.", address: "Av. Principal 456" },
    customer: { name: "Load Test Client", email: "stress@develoclick.com" },
    items: [{ description: "Stress test item", quantity: 1, unitPrice: 100, subtotal: 100 }],
    subtotal: 100,
    tax: 0,
    total: 100,
  },
});

interface StageConfig {
  name: string;
  connections: number;
  duration: number;
}

const stages: StageConfig[] = [
  {
    name: "Etapa 1 — Warm-up",
    connections: Number(process.env.BENCH_STAGE1_CONNECTIONS ?? 20),
    duration: Number(process.env.BENCH_STAGE1_DURATION ?? 10),
  },
  {
    name: "Etapa 2 — Estrés Alto",
    connections: Number(process.env.BENCH_STAGE2_CONNECTIONS ?? 200),
    duration: Number(process.env.BENCH_STAGE2_DURATION ?? 20),
  },
  {
    name: "Etapa 3 — Carga Masiva Extrema",
    connections: Number(process.env.BENCH_STAGE3_CONNECTIONS ?? 2000),
    duration: Number(process.env.BENCH_STAGE3_DURATION ?? 20),
  },
];

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function runStage(stage: StageConfig): Promise<autocannon.Result> {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`${stage.name}`);
  console.log(`${stage.connections} conexiones concurrentes x ${stage.duration}s`);
  console.log("=".repeat(70));

  return autocannon({
    url: `${BASE_URL}/v1/docs/generate`,
    connections: stage.connections,
    duration: stage.duration,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    // A render can legitimately sit queued behind pLimit/BrowserPool under
    // this load, so give autocannon a generous per-request timeout instead
    // of flagging queued-but-healthy requests as connection errors.
    timeout: 65,
  });
}

function printStageResult(result: autocannon.Result): void {
  const successful = result["2xx"];
  const failed = result.non2xx + result.errors + result.timeouts;

  console.log(`\nExitosas (2xx):      ${successful}`);
  console.log(`Fallidas:            ${failed}  (non-2xx: ${result.non2xx}, errors: ${result.errors}, timeouts: ${result.timeouts})`);
  console.log(`Latencia promedio:   ${result.latency.average.toFixed(1)}ms`);
  console.log(`Latencia máxima:     ${result.latency.max.toFixed(1)}ms`);
  console.log(`Latencia p99:        ${result.latency.p99.toFixed(1)}ms`);
  console.log(`Reqs/sec (promedio): ${result.requests.average.toFixed(1)}`);
}

async function main(): Promise<void> {
  console.log("DeveloDocs — Benchmark de carga extrema");
  console.log(`Target: POST ${BASE_URL}/v1/docs/generate`);

  if (!(await checkHealth())) {
    console.error(
      `\nNo se pudo alcanzar ${BASE_URL}/health — inicia el servidor primero (npm run dev, npm start, o docker compose up).`,
    );
    process.exitCode = 1;
    return;
  }

  const results: Array<{ stage: StageConfig; result: autocannon.Result }> = [];

  for (const stage of stages) {
    const result = await runStage(stage);
    printStageResult(result);
    results.push({ stage, result });
  }

  const totals = results.reduce(
    (acc, { result }) => ({
      successful: acc.successful + result["2xx"],
      failed: acc.failed + result.non2xx + result.errors + result.timeouts,
      total: acc.total + result.requests.total,
    }),
    { successful: 0, failed: 0, total: 0 },
  );

  console.log(`\n${"=".repeat(70)}`);
  console.log("Resumen final");
  console.log("=".repeat(70));
  console.log(`Total peticiones:    ${totals.total}`);
  console.log(`Exitosas (2xx):      ${totals.successful}`);
  console.log(`Fallidas:            ${totals.failed}`);
}

void main();
