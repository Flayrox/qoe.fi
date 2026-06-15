import type { NextConfig } from "next";

/**
 * ⚙️ apps/console — Config Next.js pour l'app console
 *
 * Sert : qoe.fi (home/feed), dashboard.qoe.fi (créateur), admin.qoe.fi (admin)
 * Code migré depuis src/ actuel en Phase 3.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
