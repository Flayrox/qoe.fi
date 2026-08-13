import { defineWorkspace } from 'vitest/config';

// Ensure tests bypass strict env validation with mock fallbacks
process.env.SKIP_ENV_VALIDATION = 'true';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.DIRECT_URL =
  process.env.DIRECT_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';

export default defineWorkspace(['packages/*', 'apps/*']);
