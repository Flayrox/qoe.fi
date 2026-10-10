import type { NextConfig } from 'next';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * ⚙️ apps/tenants — Config Next.js pour le site public
 *
 * Sert : start.qoe.fi (landing) + qoe.fi/*.qoe.fi (tenants) + custom domains
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
    dangerouslyAllowSVG: true,
    dangerouslyAllowLocalIP: true, // 🧪 Allow 127.0.0.1:54321 (Supabase local) — SSRF guard Next 16
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      // 🧪 Local Supabase Storage (DB de test)
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'host.docker.internal' },
      // 🚀 Prod + externes
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'auth.qoe.fi' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'cdn.qoe.fi' },
      { protocol: 'https', hostname: '**.r2.dev' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'self' http://*.lvh.me:* http://*.qoe.test:* http://localhost:* https://*.qoe.fi https://qoe.fi;",
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
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
