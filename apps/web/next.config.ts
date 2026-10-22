import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import type { NextConfig } from 'next';

const environmentFile = new URL('../../.env', import.meta.url);
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${new URL(process.env.API_URL ?? 'http://localhost:3001').origin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};
export default config;
