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

import { z } from 'zod';

/**
 * 📋 Schéma des variables d'environnement.
 * Adapter selon les besoins (DB, Stripe, Supabase, etc.)
 */
const envSchema = z.object({
  // ─── Runtime ───────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // ─── Base de données ───────────────────────────────────
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  DIRECT_URL: z.string().url().or(z.string().startsWith('postgresql://')),

  // ─── Redis (cache + queue) ─────────────────────────────
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

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

  // ─── App URLs ──────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_CONSOLE_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_LANDING_URL: z.string().url().default('http://localhost:3000/start'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_ADMIN_URL: z.string().url().default('http://admin.localhost'),
  NEXT_PUBLIC_DASHBOARD_URL: z.string().url().default('http://dashboard.localhost'),

  // ─── Analytics ─────────────────────────────────────────
  NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
  NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),

  // ─── Feature flags ─────────────────────────────────────
  FEATURE_BILLING: z.enum(['true', 'false']).optional(),
  FEATURE_AI_RECOS: z.enum(['true', 'false']).optional(),
  FEATURE_SEMANTIC_SEARCH: z.enum(['true', 'false']).optional(),
});

/**
 * 🔍 Parse et valide les env vars.
 * Appelle cette fonction UNE FOIS au démarrage.
 */
export function parseEnv() {
  const cleanEnvValue = (val: string | undefined): string | undefined => {
    if (typeof val === 'string') {
      let trimmed = val.trim();
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        trimmed = trimmed.slice(1, -1).trim();
      }
      if (trimmed === '') {
        return undefined;
      }
      return trimmed;
    }
    return val;
  };

  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    // Client-side environment variables validation (browser)
    // accessed via literal paths so Next.js static analyser can inline them.
    const clientSchema = z.object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
      NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
      NEXT_PUBLIC_CONSOLE_URL: z.string().url().default('http://localhost:3000'),
      NEXT_PUBLIC_LANDING_URL: z.string().url().default('http://localhost:3000/start'),
      NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3001'),
      NEXT_PUBLIC_ADMIN_URL: z.string().url().default('http://admin.localhost'),
      NEXT_PUBLIC_DASHBOARD_URL: z.string().url().default('http://dashboard.localhost'),
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: z.string().optional(),
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: z.string().url().optional(),
    });

    const clientValues = {
      NODE_ENV: cleanEnvValue(process.env.NODE_ENV),
      NEXT_PUBLIC_SUPABASE_URL: cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: cleanEnvValue(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
      ),
      NEXT_PUBLIC_APP_URL: cleanEnvValue(process.env.NEXT_PUBLIC_APP_URL),
      NEXT_PUBLIC_CONSOLE_URL: cleanEnvValue(process.env.NEXT_PUBLIC_CONSOLE_URL),
      NEXT_PUBLIC_LANDING_URL: cleanEnvValue(process.env.NEXT_PUBLIC_LANDING_URL),
      NEXT_PUBLIC_API_URL: cleanEnvValue(process.env.NEXT_PUBLIC_API_URL),
      NEXT_PUBLIC_ADMIN_URL: cleanEnvValue(process.env.NEXT_PUBLIC_ADMIN_URL),
      NEXT_PUBLIC_DASHBOARD_URL: cleanEnvValue(process.env.NEXT_PUBLIC_DASHBOARD_URL),
      NEXT_PUBLIC_UMAMI_WEBSITE_ID: cleanEnvValue(process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID),
      NEXT_PUBLIC_UMAMI_SCRIPT_URL: cleanEnvValue(process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL),
    };

    const parsed = clientSchema.safeParse(clientValues);
    if (!parsed.success) {
      console.error('❌ Invalid client-side environment variables:');
      console.error(parsed.error.flatten().fieldErrors);
      throw new Error('Invalid client-side environment variables');
    }
    return parsed.data as z.infer<typeof envSchema>;
  }

  // Pre-process all server-side environment variables
  const rawEnv = { ...process.env };
  const cleanServerEnv: Record<string, string | undefined> = {};
  for (const key of Object.keys(rawEnv)) {
    cleanServerEnv[key] = cleanEnvValue(rawEnv[key]);
  }

  // Server-side validation
  if (
    cleanServerEnv.SKIP_ENV_VALIDATION === 'true' ||
    cleanServerEnv.SKIP_ENV_VALIDATION === '1' ||
    cleanServerEnv.NODE_ENV === 'test' ||
    cleanServerEnv.VITEST === 'true' ||
    cleanServerEnv.NEXT_PHASE === 'phase-production-build'
  ) {
    const parsedMock = envSchema.safeParse({
      ...cleanServerEnv,
      DATABASE_URL:
        cleanServerEnv.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
      DIRECT_URL:
        cleanServerEnv.DIRECT_URL || 'postgresql://postgres:postgres@localhost:5432/postgres',
      NEXT_PUBLIC_SUPABASE_URL:
        cleanServerEnv.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        cleanServerEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key',
    });
    if (parsedMock.success) {
      return parsedMock.data;
    }
    return cleanServerEnv as unknown as z.infer<typeof envSchema>;
  }

  const parsed = envSchema.safeParse(cleanServerEnv);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  return parsed.data;
}

/**
 * 📦 Env vars validées et typées.
 * Utilise parseEnv() en premier, puis importe `env`.
 */
export const env = parseEnv();

export type Env = z.infer<typeof envSchema>;
