import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const pnpmPath = process.env.npm_execpath;
let stepNumber = 0;
let runningChild;
let stopSignal;

function progress(label) {
  console.log(`\n[verify ${++stepNumber}] ${label}`);
}

function stop(signal) {
  stopSignal = signal;
  runningChild?.kill(signal);
}

async function run(command, args, env = process.env) {
  if (stopSignal) throw new Error(`Verification interrupted by ${stopSignal}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    runningChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      runningChild = undefined;
      if (code === 0 && !stopSignal) resolve();
      else {
        reject(
          new Error(
            `${command === process.execPath ? 'pnpm' : command} failed (${signal ?? code ?? stopSignal})`,
          ),
        );
      }
    });
  });
}

async function pnpm(args, env) {
  await run(process.execPath, [pnpmPath, ...args], env);
}

async function verify() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!((major === 22 && minor >= 13) || major >= 24)) {
    throw new Error(
      'Use Node.js 22.13 or newer in the 22.x release line, or Node.js 24 or newer.',
    );
  }
  if (realpathSync(process.cwd()) !== realpathSync(root)) {
    throw new Error('Run pnpm verify from the EventLens repository root.');
  }
  if (
    !pnpmPath ||
    !/\.(?:c|m)?js$/i.test(pnpmPath) ||
    !existsSync(pnpmPath)
  ) {
    throw new Error(
      'Run this script with pnpm verify using the Node.js installation of pnpm.',
    );
  }
  if (!existsSync(new URL('../pnpm-lock.yaml', import.meta.url))) {
    throw new Error('The committed pnpm-lock.yaml is required for verification.');
  }

  const onInterrupt = () => stop('SIGINT');
  const onTerminate = () => stop('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  let admin;
  let createdDatabase;
  const failures = [];
  try {
    progress('Install the exact dependency versions from the lockfile');
    await pnpm(['install', '--frozen-lockfile']);
    progress('Create local configuration when needed');
    await run(process.execPath, ['scripts/setup.mjs']);
    process.loadEnvFile(new URL('../.env', import.meta.url));
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in .env.');
    }

    progress('Start PostgreSQL and wait for its health check');
    await run('docker', ['compose', 'up', '-d', '--wait', 'postgres']);
    progress('Generate the database client');
    await pnpm(['db:generate']);
    progress('Apply application database migrations');
    await pnpm(['db:migrate']);
    progress('Build the database and contract packages');
    await pnpm([
      '--filter',
      '@eventlens/database',
      '--filter',
      '@eventlens/contracts',
      'build',
    ]);
    progress('Check formatting');
    await pnpm(['format:check']);
    progress('Check lint rules');
    await pnpm(['lint']);
    progress('Check TypeScript across all workspaces');
    await pnpm(['typecheck']);
    progress('Run unit tests');
    await pnpm(['test'], { ...process.env, NODE_ENV: 'test' });

    const localOrigins = {
      APP_URL: 'http://localhost:3000',
      API_URL: 'http://localhost:3001',
      PORT: '3001',
    };
    progress('Build the API and web application');
    await pnpm(
      ['--filter', '@eventlens/api', '--filter', '@eventlens/web', 'build'],
      { ...process.env, ...localOrigins, NODE_ENV: 'production' },
    );

    progress('Create an isolated database for integration and browser tests');
    const databaseRequire = createRequire(
      new URL('../packages/database/package.json', import.meta.url),
    );
    const { Pool } = databaseRequire('pg');
    const adminUrl = new URL(process.env.DATABASE_URL);
    adminUrl.pathname = '/postgres';
    admin = new Pool({
      connectionString: adminUrl.href,
      max: 1,
      connectionTimeoutMillis: 10000,
    });
    const name = `eventlens_verify_${Date.now()}_${randomBytes(6).toString('hex')}`;
    if (
      !/^eventlens_verify_[0-9]+_[0-9a-f]{12}$/.test(name) ||
      name.length > 63
    ) {
      throw new Error('Refusing to create an invalid verification database name.');
    }
    await admin.query(`CREATE DATABASE "${name}"`);
    createdDatabase = name;
    const testUrl = new URL(process.env.DATABASE_URL);
    testUrl.pathname = `/${name}`;
    const testEnv = {
      ...process.env,
      ...localOrigins,
      NODE_ENV: 'test',
      DATABASE_URL: testUrl.href,
      TEST_DATABASE_ISOLATED: '1',
      TEST_OWNER_EMAIL: `owner-${randomBytes(8).toString('hex')}@example.com`,
      TEST_OWNER_PASSWORD: randomBytes(24).toString('hex'),
      BOOTSTRAP_TOKEN: randomBytes(32).toString('hex'),
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
    };
    progress('Apply migrations to the isolated test database');
    await pnpm(['db:migrate'], testEnv);
    progress('Run integration tests and seed the isolated test owner');
    await pnpm(['test:integration'], testEnv);
    progress('Install Chromium and applicable browser dependencies');
    await pnpm([
      'exec',
      'playwright',
      'install',
      ...(process.platform === 'linux' ? ['--with-deps'] : []),
      'chromium',
    ]);
    progress('Run the browser workflow against the isolated database');
    await pnpm(['test:e2e'], testEnv);
  } catch (error) {
    failures.push(error);
  } finally {
    if (createdDatabase) {
      progress('Remove only the isolated database created by this run');
      try {
        await admin.query(`DROP DATABASE "${createdDatabase}" WITH (FORCE)`);
      } catch (error) {
        failures.push(
          new Error(`Failed to remove isolated database ${createdDatabase}`, {
            cause: error,
          }),
        );
      }
    }
    if (admin) {
      try {
        await admin.end();
      } catch (error) {
        failures.push(
          new Error('Failed to close the verification database connection pool', {
            cause: error,
          }),
        );
      }
    }
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
  }
  if (failures.length) throw new AggregateError(failures, 'Verification failed');
  console.log(
    '\nVerification passed. Benchmarks are deferred until the event pipeline and analytics phases.',
  );
}

try {
  await verify();
} catch (error) {
  console.error(`\n${error.message}`);
  if (error instanceof AggregateError) {
    for (const failure of error.errors) console.error(`- ${failure.message}`);
  }
  process.exitCode = 1;
}
