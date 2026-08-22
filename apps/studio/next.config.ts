import type { NextConfig } from 'next';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';
import { withSentryConfig } from '@sentry/nextjs';

/**
 * ⚙️ apps/studio — Config Next.js pour le dashboard créateur (studio.qoe.fi)
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
    '@qoe/billing',
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
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-javascript/blob/master/packages/nextjs/src/config/types.ts

  org: 'qoe',
  project: 'javascript-nextjs',

  // Only print logs for uploading source maps in CI or production build
  silent: !process.env.CI,

  // Forwards the recovery integration to the client side
  widenClientFileUpload: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,
});
