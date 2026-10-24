import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { createDatabase } from '@eventlens/database';
import { recoverAccount } from './auth/recovery.js';

if (!process.stdin.isTTY || !process.stdout.isTTY || process.argv.length !== 2)
  throw new Error('Run recovery interactively without command-line arguments.');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
let hidden = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const terminal = createInterface({
  input: process.stdin,
  output,
  terminal: true,
});
const ask = (prompt: string, secret = false) =>
  new Promise<string>((resolve) => {
    hidden = false;
    terminal.question(prompt, (value) => {
      hidden = false;
      if (secret) process.stdout.write('\n');
      resolve(value);
    });
    hidden = secret;
  });
const db = createDatabase(process.env.DATABASE_URL);
try {
  const target = new URL(process.env.DATABASE_URL);
  console.log(
    `Target database: ${target.hostname}:${target.port || '5432'}${target.pathname}`,
  );
  const email = await ask('Existing account email: ');
  const password = await ask('New password (hidden): ', true);
  const confirmation = await ask('Repeat password (hidden): ', true);
  if (password !== confirmation) throw new Error('Passwords do not match');
  await recoverAccount(db, email, password);
  console.log('Password replaced and sessions revoked.');
} catch {
  console.error(
    'Recovery failed. Check account, database access, and password requirements (12–128 characters).',
  );
  process.exitCode = 1;
} finally {
  terminal.close();
  await db.$disconnect();
}
