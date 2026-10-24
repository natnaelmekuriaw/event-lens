import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { run, interrupt } from './process.mjs';
import { rehearseRelease } from './release-rehearsal.mjs';
import { stampEvidence } from './evidence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = process.env.npm_execpath;
let step = 0;
const progress = (message) => console.log(`\n[verify ${++step}] ${message}`);
const id = `eventlens_verify_${Date.now()}_${randomBytes(6).toString('hex')}`;
const envFile = `.tmp/${id}.env`;
const password = randomBytes(24).toString('hex');
const composeArgs = [
  'compose',
  '--project-name',
  id,
  '--env-file',
  envFile,
  '-f',
  'compose.verify.yaml',
  '-f',
  'compose.production.yaml',
];
const dockerEnv = {
  ...process.env,
  VERIFY_PASSWORD: password,
  APP_URL: 'https://localhost:8443',
  EVENTLENS_HOST: 'localhost',
  EVENTLENS_BIND: '127.0.0.1',
  EVENTLENS_HTTP_PORT: '8080',
  EVENTLENS_HTTPS_PORT: '8443',
  EVENTLENS_DATABASE_URL: `postgresql://verifier:${password}@postgres:5432/${id}_deploy`,
  BOOTSTRAP_TOKEN: randomBytes(32).toString('hex'),
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  EVENTLENS_QUEUE_PREFIX: `${id}_deploy`,
  EVENT_RETENTION_DAYS: '90',
};
const compose = (args, options = {}) =>
  run('docker', [...composeArgs, ...args], { ...options, env: dockerEnv });
const pnpm = (args, env) => run(process.execPath, [cli, ...args], { env });
const failures = [];
let admin;
let started = false;
let cleanupComplete = false;
const onSignal = () => interrupt();
try {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!((major === 22 && minor >= 13) || major >= 24))
    throw new Error('Use supported Node.js from package.json');
  if (realpathSync(process.cwd()) !== realpathSync(root))
    throw new Error('Run pnpm verify from the repository root');
  if (!cli || !/\.(?:c|m)?js$/i.test(cli) || !existsSync(cli))
    throw new Error('Use the Node.js installation of pnpm');
  if (!/^eventlens_verify_[0-9]+_[a-f0-9]{12}$/.test(id))
    throw new Error('Invalid disposable project name');
  const channel = process.env.PLAYWRIGHT_CHANNEL;
  if (channel && !['chrome', 'msedge'].includes(channel))
    throw new Error('Unsupported PLAYWRIGHT_CHANNEL');
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  if (process.platform !== 'win32')
    await run('ps', ['-eo', 'pid=,ppid='], { capture: true });
  await mkdir('.tmp', { recursive: true });
  const generatedSettings = Object.fromEntries(
    Object.entries(dockerEnv).filter(([key]) =>
      [
        'VERIFY_PASSWORD',
        'APP_URL',
        'EVENTLENS_HOST',
        'EVENTLENS_BIND',
        'EVENTLENS_HTTP_PORT',
        'EVENTLENS_HTTPS_PORT',
        'EVENTLENS_DATABASE_URL',
        'BOOTSTRAP_TOKEN',
        'BETTER_AUTH_SECRET',
        'EVENTLENS_QUEUE_PREFIX',
        'EVENT_RETENTION_DAYS',
      ].includes(key),
    ),
  );
  await writeFile(
    envFile,
    Object.entries(generatedSettings)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  console.log(`Disposable project: ${id}; recovery configuration: ${envFile}`);
  for (const name of [
    'ingestion',
    'analytics',
    'conversion-paths',
    'retention',
    'qualification',
    'sustained',
  ])
    await unlink(`.tmp/benchmark-${name}.json`).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  await unlink('.tmp/release-rehearsal.json').catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  progress('Install locked dependencies');
  await pnpm(['install', '--frozen-lockfile']);
  progress(
    'Start disposable PostgreSQL and Redis; application configuration is not loaded',
  );
  started = true;
  await compose(['up', '-d', '--wait', 'postgres', 'redis']);
  const pgAddress = await compose(['port', 'postgres', '5432'], {
    capture: true,
  });
  const redisAddress = await compose(['port', 'redis', '6379'], {
    capture: true,
  });
  if (
    !/^127\.0\.0\.1:[0-9]+$/.test(pgAddress) ||
    !/^127\.0\.0\.1:[0-9]+$/.test(redisAddress)
  )
    throw new Error('Disposable listeners must bind to loopback');
  const databaseRequire = createRequire(
    new URL('../packages/database/package.json', import.meta.url),
  );
  const { Pool } = databaseRequire('pg');
  const controlUrl = `postgresql://verifier:${password}@${pgAddress}/eventlens_control`;
  admin = new Pool({
    connectionString: controlUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  await admin.query('CREATE TABLE sentinel (value text NOT NULL)');
  await admin.query('INSERT INTO sentinel VALUES ($1)', [id]);
  await admin.query(`CREATE DATABASE "${id}"`);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: `postgresql://verifier:${password}@${pgAddress}/${id}`,
    REDIS_URL: `redis://${redisAddress}`,
    EVENTLENS_QUEUE_PREFIX: id,
    APP_URL: 'http://localhost:3000',
    API_URL: 'http://localhost:3001',
    PORT: '3001',
    WORKER_PORT: '3002',
    TEST_DATABASE_ISOLATED: '1',
    TEST_OWNER_EMAIL: `owner-${id}@example.com`,
    TEST_OWNER_PASSWORD: randomBytes(24).toString('hex'),
    BOOTSTRAP_TOKEN: randomBytes(32).toString('hex'),
    BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    EVENT_RETENTION_DAYS: '90',
  };
  progress('Generate client and migrate only the disposable database');
  await pnpm(['db:generate'], env);
  await pnpm(['db:migrate'], env);
  progress('Build shared packages');
  await pnpm(['-r', '--filter', './packages/*', 'build'], env);
  progress('Check formatting, lint, route declarations, and types');
  for (const args of [
    ['format:check'],
    ['lint'],
    ['--filter', '@eventlens/web', 'exec', 'next', 'typegen'],
    ['typecheck'],
  ])
    await pnpm(args, env);
  progress('Run unit tests');
  await pnpm(['test'], env);
  progress('Build application processes');
  await pnpm(
    ['-r', '--filter', './apps/*', '--filter', './examples/*', 'build'],
    { ...env, NODE_ENV: 'production' },
  );
  progress('Run isolated integration tests');
  await pnpm(['test:integration'], env);
  if (!channel) {
    progress('Install Chromium');
    await pnpm(
      [
        'exec',
        'playwright',
        'install',
        ...(process.platform === 'linux' ? ['--with-deps'] : []),
        'chromium',
      ],
      env,
    );
  }
  progress('Run browser journeys and query benchmarks');
  await pnpm(['test:e2e'], env);
  progress('Qualify concurrent historical reports and cleanup catch-up');
  await run(process.execPath, ['scripts/qualify-workload.mjs'], { env });
  progress(
    'Rehearse backup, restore, account recovery, process loss, and production containers',
  );
  await rehearseRelease({ env, id, admin, compose, pnpm, progress, dockerEnv });
  await stampEvidence();
  progress(
    'Review all shipped JavaScript dependencies for high-severity advisories',
  );
  await pnpm(['audit', '--audit-level', 'high'], env);
} catch (error) {
  failures.push(error);
} finally {
  if (admin) {
    try {
      const sentinel = await admin.query('SELECT value FROM sentinel');
      if (sentinel.rows.length !== 1 || sentinel.rows[0].value !== id)
        failures.push(new Error('Control database changed'));
      else console.log('Control database sentinel preserved.');
    } catch (error) {
      failures.push(error);
    }
    await admin.end().catch((error) => failures.push(error));
  }
  if (started) {
    progress('Remove only this disposable Docker project and its volumes');
    try {
      await compose(['down', '--volumes', '--remove-orphans'], {
        cleanup: true,
      });
      cleanupComplete = true;
    } catch (error) {
      failures.push(error);
    }
  }
  if (!started || cleanupComplete) await unlink(envFile).catch(() => {});
  else
    console.error(
      `Disposable cleanup incomplete. Keep ${envFile} private and follow the recovery runbook.`,
    );
  process.removeListener('SIGINT', onSignal);
  process.removeListener('SIGTERM', onSignal);
}
if (failures.length) {
  console.error(
    'Verification failed. Application database/configuration were not used.',
  );
  for (const error of failures) console.error(error.message);
  process.exitCode = 1;
} else
  console.log(
    'Verification passed. Revision-linked results are in .tmp/benchmark-*.json and .tmp/release-rehearsal.json.',
  );
