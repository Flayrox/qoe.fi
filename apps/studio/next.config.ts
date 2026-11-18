import type { NextConfig } from 'next';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';
import { withSentryConfig } from '@sentry/nextjs';
import { mediaRemotePatterns } from '@qoe/supabase/storage';
import { studioSecurityHeaders } from './src/lib/security-headers';

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
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production', // 🧪 Allow 127.0.0.1:54321 (Supabase local) — SSRF guard Next 16
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
    // 🖼️ Hôtes dérivés de l'environnement (`NEXT_PUBLIC_MEDIA_CDN_URL`,
    // `NEXT_PUBLIC_SUPABASE_URL`) + tiers connus : changer de CDN ne demande
    // plus de toucher à ce fichier (voir `@qoe/supabase/storage`).
    remotePatterns: mediaRemotePatterns(),
  },
  // Slugs EN (l'app démarre en FR mais les routes sont anglaises) :
  // /offre → /pricing (301 — bookmarks et liens en vol préservés).
  async redirects() {
    return [{ source: '/offre', destination: '/pricing', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: studioSecurityHeaders(),
      },
    ];
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
