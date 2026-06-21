import type { NextConfig } from "next";

/**
 * ⚙️ apps/admin — Config Next.js pour le panel superadmin (admin.qoe.fi)
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: ["localhost", "192.168.1.86", "*.qoe.fi", "127.0.0.1", "qoe.test", "*.qoe.test"],
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
