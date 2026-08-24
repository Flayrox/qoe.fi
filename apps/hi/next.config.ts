import type { NextConfig } from 'next';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * ⚙️ apps/hi — Config Next.js pour le site vitrine (start.qoe.fi)
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  reactCompiler: true,
  experimental: {
    swcPlugins: [linguiMacroSwcPlugin()],
  },
  allowedDevOrigins: [
    'localhost',
    '192.168.1.86',
    '*.qoe.fi',
    '127.0.0.1',
    'qoe.test',
    '*.qoe.test',
    'lvh.me',
    '*.lvh.me',
  ],
  transpilePackages: [
    '@qoe/auth',
    '@qoe/config',
    '@qoe/db',
    '@qoe/flags',
    '@qoe/i18n',
    '@qoe/supabase',
    '@qoe/ui',
    '@qoe/utils',
    '@qoe/analytics',
    '@qoe/theme',
    '@qoe/observability',
  ],
  images: {
    dangerouslyAllowLocalIP: true, // 🧪 Allow 127.0.0.1:54321 (Supabase local) — SSRF guard Next 16
    remotePatterns: [
      // 🧪 Local Supabase Storage (DB de test)
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'host.docker.internal' },
      // 🚀 Prod
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'auth.qoe.fi' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'cdn.qoe.fi' },
    ],
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`,
        permanent: false,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: 'qoe',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
