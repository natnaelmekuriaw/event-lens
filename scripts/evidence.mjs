import { readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem, platform, arch } from 'node:os';
import { run } from './process.mjs';

export async function stampEvidence() {
  const revision = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  const dirty = Boolean(
    await run('git', ['status', '--porcelain'], { capture: true }),
  );
  const environment = {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    topology:
      'Application client and disposable Docker infrastructure on one host',
  };
  for (const name of [
    'ingestion',
    'analytics',
    'conversion-paths',
    'retention',
    'qualification',
    'sustained',
  ]) {
    const path = `.tmp/benchmark-${name}.json`;
    const report = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(
      path,
      JSON.stringify({ ...report, revision, dirty, environment }, null, 2) +
        '\n',
    );
  }
}
