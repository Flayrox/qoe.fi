// =====================================================================
// 🔐 ENV — Validation des variables d'environnement avec Zod
// =====================================================================
// 📖 Pourquoi Zod ?
//    - Détecte les env vars manquantes au démarrage (pas à l'exécution)
//    - Type les env vars de manière stricte
//    - Source unique de vérité (importable partout)
//
// 🎯 Usage :
//    import { env } from '@qoe/config/env';
//    const url = env.DATABASE_URL; // string typé et garanti non-vide
// =====================================================================

import { z } from "zod";

/**
 * 📋 Schéma des variables d'environnement.
 * Adapter selon les besoins (DB, Stripe, Supabase, etc.)
 */
const envSchema = z.object({
  // ─── Runtime ───────────────────────────────────────────
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // ─── Base de données ───────────────────────────────────
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgresql://")),
  DIRECT_URL: z.string().url().or(z.string().startsWith("postgresql://")),

  // ─── Redis (cache + queue) ─────────────────────────────
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // ─── Supabase ──────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // ─── Stripe ────────────────────────────────────────────
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),

  // ─── AI ────────────────────────────────────────────────
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // ─── Tolgee (i18n) ─────────────────────────────────────
  NEXT_PUBLIC_TOLGEE_API_KEY: z.string().optional(),
  NEXT_PUBLIC_TOLGEE_API_URL: z.string().url().default("https://app.tolgee.io"),

  // ─── App URLs ──────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_CONSOLE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_LANDING_URL: z.string().url().default("http://localhost:3000/start"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),

  // ─── Analytics ─────────────────────────────────────────
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),

  // ─── Feature flags ─────────────────────────────────────
  FEATURE_BILLING: z.enum(["true", "false"]).optional(),
  FEATURE_AI_RECOS: z.enum(["true", "false"]).optional(),
  FEATURE_SEMANTIC_SEARCH: z.enum(["true", "false"]).optional(),
});

/**
 * 🔍 Parse et valide les env vars.
 * Appelle cette fonction UNE FOIS au démarrage.
 */
export function parseEnv() {
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    // Client-side environment variables validation (browser)
    // accessed via literal paths so Next.js static analyser can inline them.
    const clientSchema = z.object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
      NEXT_PUBLIC_TOLGEE_API_KEY: z.string().optional(),
      NEXT_PUBLIC_TOLGEE_API_URL: z.string().url().default("https://app.tolgee.io"),
      NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
      NEXT_PUBLIC_CONSOLE_URL: z.string().url().default("http://localhost:3000"),
      NEXT_PUBLIC_LANDING_URL: z.string().url().default("http://localhost:3000/start"),
      NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),
    });

    const clientValues = {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_TOLGEE_API_KEY: process.env.NEXT_PUBLIC_TOLGEE_API_KEY,
      NEXT_PUBLIC_TOLGEE_API_URL: process.env.NEXT_PUBLIC_TOLGEE_API_URL,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_CONSOLE_URL: process.env.NEXT_PUBLIC_CONSOLE_URL,
      NEXT_PUBLIC_LANDING_URL: process.env.NEXT_PUBLIC_LANDING_URL,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL,
    };

    const parsed = clientSchema.safeParse(clientValues);
    if (!parsed.success) {
      console.error("❌ Invalid client-side environment variables:");
      console.error(parsed.error.flatten().fieldErrors);
      throw new Error("Invalid client-side environment variables");
    }
    return parsed.data as any;
  }

  // Server-side validation
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:");
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
}

/**
 * 📦 Env vars validées et typées.
 * Utilise parseEnv() en premier, puis importe `env`.
 */
export const env = parseEnv();

export type Env = z.infer<typeof envSchema>;
