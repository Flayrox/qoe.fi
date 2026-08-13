// =====================================================================
// ⚙️ Vitest Setup — apps/api
// =====================================================================
// 📖 Environnement de test global : isole le module prisma pour éviter
//    que le singleton réel se connecte à Postgres pendant les tests.
// =====================================================================

import { vi } from 'vitest';

// Supprime les logs bruyants de Hono/Prisma pendant les tests.
vi.spyOn(console, 'error').mockImplementation(() => {});
vi.spyOn(console, 'log').mockImplementation(() => {});

process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.DIRECT_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder_anon_key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_for_tests';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_for_tests';

export {};
