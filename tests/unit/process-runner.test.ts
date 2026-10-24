import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { run, interrupt, withPnpmOnPath } from '../../scripts/process.mjs';

it('captures output without involving a shell', async () => {
  expect(
    await run(process.execPath, ['-e', 'process.stdout.write("ready")'], {
      capture: true,
    }),
  ).toBe('ready');
});
it('terminates a command that exceeds its execution budget', async () => {
  await expect(
    run(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {
      capture: true,
      timeoutMs: 100,
    }),
  ).rejects.toThrow('timeout');
});
it('resolves nested pnpm scripts when Windows PATH lacks the shim directory', () => {
  if (process.platform !== 'win32' || !process.env.APPDATA) return;
  if (!existsSync(join(process.env.APPDATA, 'npm', 'pnpm.cmd'))) return;
  const isolated = { ...process.env };
  for (const key of Object.keys(isolated))
    if (key.toLowerCase() === 'path') delete isolated[key];
  isolated.Path = [
    dirname(process.execPath),
    join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
  ].join(';');
  const missing = spawnSync('where.exe', ['pnpm'], {
    env: isolated,
    windowsHide: true,
  });
  expect(missing.status).not.toBe(0);
  const found = spawnSync('cmd.exe', ['/d', '/c', 'pnpm --version'], {
    cwd: new URL('../../', import.meta.url),
    env: withPnpmOnPath(isolated),
    encoding: 'utf8',
    windowsHide: true,
  });
  expect(found.status, found.stderr).toBe(0);
  expect(found.stdout).toMatch(/\b11\.25\.0\b/);
});
it('rejects further normal work after interruption but permits cleanup', async () => {
  interrupt();
  await expect(run(process.execPath, ['-e', ''])).rejects.toThrow(
    'interrupted',
  );
  expect(
    await run(process.execPath, ['-e', 'process.stdout.write("cleaned")'], {
      capture: true,
      cleanup: true,
    }),
  ).toBe('cleaned');
});
