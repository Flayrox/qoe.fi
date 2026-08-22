import type { NextConfig } from 'next';

/**
 * Configuration Next.js pour qoe.fi
 *
 * 🐳 `output: "standalone"` est OBLIGATOIRE pour Docker :
 * - Génère un build minimal qui inclut uniquement les dépendances utilisées
 * - Réduit la taille de l'image Docker de ~1 GB à ~150 MB
 * - Crée un dossier `.next/standalone/` autonome qui peut être copié tel quel
 *
 * 📖 Documentation : https://nextjs.org/docs/app/api-reference/config/next-config-js/output
 */
const nextConfig: NextConfig = {
  output: 'standalone',

  images: {
    dangerouslyAllowLocalIP: true, // 🧪 Allow 127.0.0.1:54321 — SSRF guard Next 16
    remotePatterns: [
      // 🧪 Local Supabase Storage (DB de test)
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: 'host.docker.internal' },
      // 🚀 Prod
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: 'auth.qoe.fi' },
      { protocol: 'https', hostname: 'cdn.qoe.fi' },
    ],
  },
};

export default nextConfig;
