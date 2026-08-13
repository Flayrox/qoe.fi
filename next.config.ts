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

  // 🔧 Optimisations additionnelles pour les images Docker
  // (reactStrictMode, eslint, etc. restent à true par défaut)

  // 🖼️ Pour les images du domaine Supabase Storage en production
  // On pourra ajouter `images.remotePatterns` ici si besoin
};

export default nextConfig;
