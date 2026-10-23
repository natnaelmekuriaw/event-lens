import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const password = randomBytes(24).toString('hex');
const template = await readFile(new URL('.env.example', root), 'utf8');
const content = template
  .replaceAll('replace-with-random-password', password)
  .replace(
    'replace-with-at-least-32-random-characters',
    randomBytes(32).toString('hex'),
  )
  .replace(
    'replace-with-at-least-32-random-characters',
    randomBytes(32).toString('hex'),
  );
try {
  await writeFile(new URL('.env', root), content, { flag: 'wx', mode: 0o600 });
  console.log(
    `Created ${fileURLToPath(new URL('.env', root))}. Read BOOTSTRAP_TOKEN locally for owner setup.`,
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const environmentFile = new URL('.env', root);
  const existing = await readFile(environmentFile, 'utf8');
  const defaults = {
    REDIS_URL: 'redis://localhost:6379',
    WORKER_PORT: '3002',
    EVENT_RETENTION_DAYS: '90',
  };
  const missing = Object.entries(defaults).filter(
    ([key]) => !new RegExp('^\\s*' + key + '\\s*=', 'm').test(existing),
  );
  if (missing.length)
    await writeFile(
      environmentFile,
      (existing.endsWith('\n') ? '' : '\n') +
        missing.map(([key, value]) => key + '=' + value).join('\n') +
        '\n',
      { flag: 'a' },
    );
  console.log(
    '.env already exists; preserved its values and added any missing Phase 2 defaults.',
  );
}
