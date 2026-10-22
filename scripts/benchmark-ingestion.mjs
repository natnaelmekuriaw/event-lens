import { randomUUID } from 'node:crypto';
import { cpus, totalmem, platform, arch, release } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

function bounded(value, fallback, min, max, label) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(label + ' is out of range');
  return number;
}
function percentile(sorted, fraction) {
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}
export async function benchmarkIngestion({
  endpoint,
  projectKey,
  eventCount = 1000,
  batchSize = 25,
  concurrency = 4,
  output,
} = {}) {
  if (!endpoint || !projectKey)
    throw new Error(
      'Supply BENCHMARK_API_URL and a dedicated BENCHMARK_PROJECT_KEY',
    );
  const url = new URL(endpoint);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Use an HTTP(S) API origin without credentials');
  url.pathname = url.pathname.replace(/\/$/, '') + '/api/v1/ingest';
  eventCount = bounded(eventCount, 1000, 1, 2000, 'eventCount');
  batchSize = bounded(batchSize, 25, 1, 50, 'batchSize');
  concurrency = bounded(concurrency, 4, 1, 16, 'concurrency');
  if (Math.ceil(eventCount / batchSize) > 80)
    throw new Error(
      'Use at most80 batches to stay within the default socket rate window',
    );
  const runId = randomUUID();
  const occurredAt = new Date().toISOString();
  const events = Array.from({ length: eventCount }, (_, index) => ({
    eventId: randomUUID(),
    type: 'track',
    name: 'benchmark_event',
    anonymousId: 'benchmark-' + runId + '-' + (index % 100),
    occurredAt,
    properties: { synthetic: true, level: index % 10, score: index * 10 },
  }));
  const batches = [];
  for (let index = 0; index < events.length; index += batchSize)
    batches.push(events.slice(index, index + batchSize));
  let position = 0;
  let accepted = 0;
  let duplicates = 0;
  const latencies = [];
  const errors = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(concurrency, batches.length) }, async () => {
      while (position < batches.length) {
        const batch = batches[position++];
        const requestStarted = performance.now();
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectKey, events: batch }),
            signal: AbortSignal.timeout(15000),
          });
          if (response.status !== 202)
            throw new Error('HTTP_' + response.status);
          const result = await response.json();
          if (
            !Number.isInteger(result.accepted) ||
            !Number.isInteger(result.duplicates) ||
            result.accepted + result.duplicates !== batch.length
          )
            throw new Error('INVALID_ACKNOWLEDGEMENT');
          accepted += result.accepted;
          duplicates += result.duplicates;
        } catch (error) {
          errors.push(
            error instanceof Error && /^HTTP_/.test(error.message)
              ? error.message
              : 'REQUEST_FAILED',
          );
        } finally {
          latencies.push(performance.now() - requestStarted);
        }
      }
    }),
  );
  const elapsedMs = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const hardware = cpus();
  const result = {
    measuredAt: new Date().toISOString(),
    runId,
    workload:
      'durable ingestion acknowledgement; excludes worker completion and analytics queries',
    node: process.version,
    host: {
      platform: platform(),
      release: release(),
      arch: arch(),
      cpu: hardware[0]?.model ?? 'unknown',
      logicalCpus: hardware.length,
      memoryBytes: totalmem(),
    },
    dataset: {
      events: eventCount,
      properties: ['synthetic', 'level', 'score'],
      actors: Math.min(100, eventCount),
    },
    configuration: {
      batchSize,
      concurrency,
      requests: batches.length,
      warmup: false,
      retries: 0,
    },
    accepted,
    duplicates,
    failedRequests: errors.length,
    errors: [...new Set(errors)],
    elapsedMs,
    acceptedEventsPerSecond: accepted / (elapsedMs / 1000),
    requestLatencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
      max: latencies.at(-1) ?? 0,
    },
    limitations:
      'Client host hardware only; document database/Redis hosts, competing load, disk, and topology alongside any published result. One small run is not a capacity guarantee.',
  };
  if (output) {
    const destination = resolve(output);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
  }
  console.log(JSON.stringify(result, null, 2));
  if (errors.length || accepted !== eventCount || duplicates !== 0)
    throw new Error(
      'Benchmark did not durably accept every new event; inspect the recorded results',
    );
  return result;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await benchmarkIngestion({
      endpoint: process.env.BENCHMARK_API_URL,
      projectKey: process.env.BENCHMARK_PROJECT_KEY,
      eventCount: process.env.BENCHMARK_EVENTS,
      batchSize: process.env.BENCHMARK_BATCH_SIZE,
      concurrency: process.env.BENCHMARK_CONCURRENCY,
      output: process.env.BENCHMARK_OUTPUT,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
