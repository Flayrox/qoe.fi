import type { NextConfig } from "next";

/**
 * ⚙️ apps/web — Config Next.js pour le site public
 *
 * Sert : start.qoe.fi (landing) + qoe.fi/*.qoe.fi (tenants) + custom domains
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: ["localhost", "192.168.1.86", "*.qoe.fi", "127.0.0.1", "qoe.test", "*.qoe.test", "lvh.me", "*.lvh.me"],
  transpilePackages: [
    "@qoe/auth",
    "@qoe/billing",
    "@qoe/config",
    "@qoe/db",
    "@qoe/i18n",
    "@qoe/supabase",
    "@qoe/ui",
    "@qoe/utils",
    "@qoe/analytics",
    "@qoe/theme",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
