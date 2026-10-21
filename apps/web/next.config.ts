import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_URL ?? 'http://localhost:3001'}/api/:path*` }]; },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] }]; },
};
export default config;
