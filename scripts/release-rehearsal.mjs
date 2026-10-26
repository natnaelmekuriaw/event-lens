import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { run } from './process.mjs';
import { requireDockerSpace } from './docker-space.mjs';

export async function rehearseRelease({
  env,
  id,
  admin,
  compose,
  pnpm,
  progress,
  dockerEnv,
}) {
  if (
    !/^eventlens_verify_[0-9]+_[a-f0-9]{12}$/.test(id) ||
    env.TEST_DATABASE_ISOLATED !== '1'
  )
    throw new Error(
      'Release rehearsal requires generated disposable infrastructure',
    );
  const requireDb = createRequire(
    new URL('../packages/database/package.json', import.meta.url),
  );
  const { Pool } = requireDb('pg');
  const source = new Pool({ connectionString: env.DATABASE_URL, max: 1 });
  const projectId = randomUUID();
  const key = `el_pk_${randomBytes(32).toString('base64url')}`;
  const event = {
    eventId: randomUUID(),
    type: 'track',
    name: 'release_pending',
    anonymousId: 'release-actor',
    occurredAt: new Date().toISOString(),
    properties: { synthetic: true },
  };
  const receiptId = randomUUID();
  const tables = [
    'User',
    'Account',
    'Workspace',
    'Membership',
    'Project',
    'ConversionPath',
    'AnalyticsEvent',
    'EventReceipt',
    'EventOutbox',
    'IdentityLink',
  ];
  let restore;
  const begin = performance.now();
  async function stopBusyWorker(signal) {
    const deployedUrl = new URL(env.DATABASE_URL);
    deployedUrl.pathname = `/${id}_deploy`;
    const deployed = new Pool({ connectionString: deployedUrl.href, max: 1 });
    try {
      const state = JSON.parse(
        await readFile('.tmp/release-container-state.json', 'utf8'),
      );
      const lock = await deployed.connect();
      try {
        await lock.query('BEGIN');
        await lock.query(
          'SELECT id FROM "EventReceipt" WHERE "projectId"=$1 AND status=\'pending\' FOR UPDATE',
          [state.projectId],
        );
        await compose(['up', '-d', 'worker']);
        for (let attempt = 0; ; attempt++) {
          const waiting = await admin.query(
            "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND wait_event_type='Lock'",
            [`${id}_deploy`],
          );
          if (waiting.rows[0].n > 0) break;
          if (attempt >= 100)
            throw new Error('Worker did not reach the shutdown checkpoint');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        // Deliver the signal while a receipt is in flight, then allow its lock to drain.
        const stoppingAt = performance.now();
        const services = signal === 'SIGTERM' ? ['api', 'worker'] : ['worker'];
        await compose(['kill', '-s', signal, ...services]);
        await lock.query('COMMIT');
        await compose(['stop', '-t', '30', ...services]);
        const containers = (
          await compose(['ps', '--all', '--quiet', ...services], {
            capture: true,
          })
        ).split(/\s+/);
        assert.equal(containers.length, services.length);
        const states = (
          await run(
            'docker',
            ['inspect', '--format', '{{json .State}}', ...containers],
            { capture: true },
          )
        )
          .split('\n')
          .map((line) => JSON.parse(line));
        for (const state of states) {
          assert.equal(state.Running, false);
          assert.equal(state.OOMKilled, false);
          assert.ok(
            (signal === 'SIGTERM' ? [0, 143] : [137]).includes(state.ExitCode),
            'Unexpected shutdown exit; inspect the disposable container logs',
          );
        }
        return {
          signal,
          durationMs: performance.now() - stoppingAt,
          exitCodes: states.map((state) => state.ExitCode),
        };
      } catch (error) {
        await lock.query('ROLLBACK');
        throw error;
      } finally {
        lock.release();
      }
    } finally {
      await deployed.end();
    }
  }
  try {
    const { rows: workspaces } = await source.query(
      'SELECT id FROM "Workspace" ORDER BY id LIMIT 1',
    );
    assert.ok(workspaces[0]);
    await source.query(
      'INSERT INTO "Project" (id,"workspaceId",name,"keyHash","keyPrefix") VALUES ($1,$2,$3,$4,$5)',
      [
        projectId,
        workspaces[0].id,
        'Release pending fixture',
        createHash('sha256').update(key).digest('hex'),
        key.slice(0, 14),
      ],
    );
    await source.query(
      'INSERT INTO "EventReceipt" (id,"projectId","eventId",payload) VALUES ($1,$2,$3,$4::jsonb)',
      [receiptId, projectId, event.eventId, JSON.stringify(event)],
    );
    await source.query(
      'INSERT INTO "EventOutbox" ("receiptId","nextDispatchAt") VALUES ($1,NOW())',
      [receiptId],
    );
    const manifest = {};
    for (const table of tables)
      manifest[table] = (
        await source.query(`SELECT COUNT(*)::int AS n FROM "${table}"`)
      ).rows[0].n;
    const restoredName = `${id}_restore`;
    await admin.query(`CREATE DATABASE "${restoredName}"`);
    progress(
      'Dump and restore only generated databases inside the disposable PostgreSQL container',
    );
    await compose([
      'exec',
      '-T',
      'postgres',
      'pg_dump',
      '-U',
      'verifier',
      '-d',
      id,
      '-Fc',
      '-f',
      `/tmp/${id}.dump`,
    ]);
    await compose([
      'exec',
      '-T',
      'postgres',
      'pg_restore',
      '-U',
      'verifier',
      '-d',
      restoredName,
      '--no-owner',
      '--exit-on-error',
      `/tmp/${id}.dump`,
    ]);
    const restoredUrl = new URL(env.DATABASE_URL);
    restoredUrl.pathname = `/${restoredName}`;
    restore = new Pool({ connectionString: restoredUrl.href, max: 1 });
    for (const table of tables)
      assert.equal(
        (await restore.query(`SELECT COUNT(*)::int AS n FROM "${table}"`))
          .rows[0].n,
        manifest[table],
        `${table} restore count`,
      );
    await pnpm(['db:migrate'], { ...env, DATABASE_URL: restoredUrl.href });
    await run(process.execPath, ['scripts/restored-acceptance.mjs'], {
      env: {
        ...env,
        DATABASE_URL: restoredUrl.href,
        EVENTLENS_QUEUE_PREFIX: `${id}_restore`,
        RELEASE_PROJECT_ID: projectId,
        RELEASE_WORKSPACE_ID: workspaces[0].id,
        RELEASE_PROJECT_KEY: key,
        RELEASE_EVENT: JSON.stringify(event),
        RELEASE_RECEIPT_ID: receiptId,
      },
    });

    progress(
      'Upgrade a disposable Phase 2 schema using the real migration history',
    );
    const upgradeName = `${id}_upgrade`;
    await admin.query(`CREATE DATABASE "${upgradeName}"`);
    const directory = new URL(`../.tmp/${id}-upgrade/`, import.meta.url);
    await mkdir(new URL('migrations/', directory), { recursive: true });
    for (const name of [
      '202610220001_foundation',
      '202610220002_events',
      'migration_lock.toml',
    ])
      await cp(
        new URL(
          `../packages/database/prisma/migrations/${name}`,
          import.meta.url,
        ),
        new URL(`migrations/${name}`, directory),
        { recursive: true },
      );
    const config = `import { defineConfig } from ${JSON.stringify(pathToFileURL(requireDb.resolve('prisma/config')).href)};
export default defineConfig({schema:${JSON.stringify(fileURLToPath(new URL('../packages/database/prisma/schema.prisma', import.meta.url)))},migrations:{path:${JSON.stringify(fileURLToPath(new URL('migrations/', directory)))}},datasource:{url:process.env.DATABASE_URL}});`;
    await writeFile(new URL('prisma.config.ts', directory), config);
    const upgradeUrl = new URL(env.DATABASE_URL);
    upgradeUrl.pathname = `/${upgradeName}`;
    const upgradeEnv = { ...env, DATABASE_URL: upgradeUrl.href };
    await pnpm(
      [
        '--filter',
        '@eventlens/database',
        'exec',
        'prisma',
        'migrate',
        'deploy',
        '--config',
        fileURLToPath(new URL('prisma.config.ts', directory)),
      ],
      upgradeEnv,
    );
    const upgrade = new Pool({ connectionString: upgradeUrl.href, max: 1 });
    try {
      await upgrade.query('INSERT INTO "Installation" (id) VALUES ($1)', [
        'release-upgrade-sentinel',
      ]);
      await pnpm(['db:migrate'], upgradeEnv);
      assert.equal(
        (await upgrade.query('SELECT id FROM "Installation"')).rows[0].id,
        'release-upgrade-sentinel',
      );
      assert.ok(
        (
          await upgrade.query(
            `SELECT to_regclass('public."ConversionPath"') AS name`,
          )
        ).rows[0].name,
      );
      const client = await upgrade.connect();
      try {
        await client.query('BEGIN');
        await client.query('CREATE TABLE failed_upgrade_probe (id integer)');
        await assert.rejects(client.query('SELECT 1/0'));
        await client.query('ROLLBACK');
        assert.equal(
          (
            await client.query(
              "SELECT to_regclass('public.failed_upgrade_probe') AS name",
            )
          ).rows[0].name,
          null,
        );
      } finally {
        client.release();
      }
    } finally {
      await upgrade.end();
    }

    await requireDockerSpace();
    progress('Build one shared production runtime image');
    await admin.query(`CREATE DATABASE "${id}_deploy"`);
    await compose(['build', 'migrate'], { timeoutMs: 1200000 });
    progress('Start production containers with an isolated HTTPS origin');
    await compose(['up', '-d', '--no-build', '--wait'], { timeoutMs: 600000 });
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: {
        ...env,
        RELEASE_APP_URL: dockerEnv.APP_URL,
        BOOTSTRAP_TOKEN: dockerEnv.BOOTSTRAP_TOKEN,
      },
    });
    // Hold pending receipt locks until a deployed worker is demonstrably waiting on one.
    await compose(['stop', '-t', '30', 'worker']);
    const acceptanceEnv = {
      ...env,
      RELEASE_APP_URL: dockerEnv.APP_URL,
      BOOTSTRAP_TOKEN: dockerEnv.BOOTSTRAP_TOKEN,
    };
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: { ...acceptanceEnv, RELEASE_MODE: 'enqueue' },
    });
    const forcedStop = await stopBusyWorker('SIGKILL');
    await compose(['stop', '-t', '10', 'redis']);
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: { ...acceptanceEnv, RELEASE_MODE: 'enqueue' },
    });
    await compose(['up', '-d', '--wait', 'redis']);
    await compose(['exec', '-T', 'redis', 'redis-cli', 'FLUSHDB']);
    await compose(['up', '-d', '--wait', 'worker']);
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: { ...acceptanceEnv, RELEASE_MODE: 'resume' },
    });
    await compose(['stop', '-t', '30', 'worker']);
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: { ...acceptanceEnv, RELEASE_MODE: 'enqueue' },
    });
    const gracefulStop = await stopBusyWorker('SIGTERM');
    await compose(['up', '-d', '--wait', 'api', 'worker']);
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: {
        ...env,
        RELEASE_APP_URL: dockerEnv.APP_URL,
        BOOTSTRAP_TOKEN: dockerEnv.BOOTSTRAP_TOKEN,
        RELEASE_MODE: 'resume',
      },
    });
    await run(process.execPath, ['scripts/container-acceptance.mjs'], {
      env: { ...acceptanceEnv, RELEASE_MODE: 'sustained' },
    });
    const revision = await run('git', ['rev-parse', 'HEAD'], { capture: true });
    await writeFile(
      '.tmp/release-rehearsal.json',
      JSON.stringify(
        {
          revision,
          measuredAt: new Date().toISOString(),
          durationMs: performance.now() - begin,
          restoredTableCounts: manifest,
          backupRestore: 'passed',
          accountRecovery: 'passed',
          upgradeFrom: '202610220002_events',
          transactionalFailureRollback: 'passed',
          productionHttpsAndRestart: 'passed',
          redisOutageAndStateLoss: 'passed',
          forcedStop,
          gracefulStop,
          imageIds: (await compose(['images', '-q'], { capture: true })).split(
            /\s+/,
          ),
          limitations:
            'Qualification uses disposable local infrastructure. Nontransactional migration failure requires restoring a fresh database; no automatic rollback is claimed.',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await source.end();
    await restore?.end();
  }
  // Read back only the nonsecret report to ensure the artifact exists before success.
  JSON.parse(await readFile('.tmp/release-rehearsal.json', 'utf8'));
}
