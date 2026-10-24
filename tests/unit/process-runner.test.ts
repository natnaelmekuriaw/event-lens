import { expect, it } from 'vitest';
import { run, interrupt } from '../../scripts/process.mjs';

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
