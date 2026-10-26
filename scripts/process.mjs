import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { clearTimeout } from 'node:timers';

let current;
let stopped = false;
export function withPnpmOnPath(env = process.env) {
  if (process.platform !== 'win32' || !env.APPDATA) return env;
  const directory = join(env.APPDATA, 'npm');
  if (!existsSync(join(directory, 'pnpm.cmd'))) return env;
  const pathKey =
    Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path';
  return { ...env, [pathKey]: `${directory}${delimiter}${env[pathKey] ?? ''}` };
}
function killTree(child, signal) {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.on('error', () => child.kill());
  } else {
    // Browser runners can place servers in separate process groups. Capture the
    // ancestry before killing their parent so those owned descendants stay known.
    const snapshot = spawnSync('ps', ['-eo', 'pid=,ppid='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const family = new Set([child.pid]);
    const rows = (snapshot.stdout ?? '')
      .trim()
      .split('\n')
      .map((row) => row.trim().split(/\s+/).map(Number));
    for (let changed = true; changed;) {
      changed = false;
      for (const [pid, parent] of rows) {
        if (family.has(parent) && !family.has(pid)) {
          family.add(pid);
          changed = true;
        }
      }
    }
    for (const pid of [...family].reverse()) {
      try {
        process.kill(pid, signal);
      } catch {
        /* A child may already have exited. */
      }
    }
    try {
      process.kill(-child.pid, signal);
    } catch {
      child.kill(signal);
    }
  }
}
export function interrupt() {
  stopped = true;
  if (current) killTree(current, 'SIGKILL');
}
export async function run(
  command,
  args,
  {
    env = process.env,
    capture = false,
    cleanup = false,
    timeoutMs = 600000,
  } = {},
) {
  if (stopped && !cleanup) throw new Error('Verification interrupted');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      cwd: new URL('../', import.meta.url),
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    current = child;
    let output = '';
    let timedOut = false;
    child.stdout?.on('data', (chunk) => {
      output += String(chunk);
    });
    // Captured command stderr can contain connection URLs; keep it private.
    child.stderr?.on('data', () => {});
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child, 'SIGKILL');
    }, timeoutMs);
    child.once('error', (error) => {
      clearTimeout(timer);
      current = undefined;
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      current = undefined;
      if (code === 0 && (!stopped || cleanup) && !timedOut)
        resolve(output.trim());
      else
        reject(
          new Error(
            `${command === process.execPath ? 'node/pnpm' : command} failed${timedOut ? ' (timeout)' : ''}`,
          ),
        );
    });
  });
}
