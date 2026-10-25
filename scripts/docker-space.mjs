import { existsSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { join } from 'node:path';

const minimumFreeBytes = 10 * 1024 ** 3;

export async function requireDockerSpace() {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return;
  const directory = join(process.env.LOCALAPPDATA, 'Docker', 'wsl', 'disk');
  if (!existsSync(join(directory, 'docker_data.vhdx'))) return;
  const { bavail, bsize } = await statfs(directory);
  const freeBytes = bavail * bsize;
  if (freeBytes < minimumFreeBytes)
    throw new Error(
      `Docker Desktop's disk has ${(freeBytes / 1024 ** 3).toFixed(1)} GiB free; verification requires at least 10 GiB before building.`,
    );
}
