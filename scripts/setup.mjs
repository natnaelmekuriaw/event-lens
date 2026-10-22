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
  console.log('.env already exists; keeping its values.');
}
