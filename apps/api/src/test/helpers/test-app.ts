// =====================================================================
// 🧪 Test App Factory — apps/api tests
// =====================================================================
// 📖 Assemble une app Hono de test avec :
//    - une base Prisma in-memory (voir memory-db.ts)
//    - un client Supabase mocké (getUser)
//    - une queue BullMQ mockée (add)
//    - verifyWebhook mockable
//
// 🎯 Chaque test repart d'un état propre : `createTestApp()` puis
//    `reset()` en beforeEach.
// =====================================================================

import { createApp } from '../../app';
import { createMemoryDb } from './memory-db';
import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { vi, type Mock } from 'vitest';

export interface TestContext {
  app: ReturnType<typeof createApp>;
  db: ReturnType<typeof createMemoryDb>['db'];
  seed: ReturnType<typeof createMemoryDb>['seed'];
  reset: ReturnType<typeof createMemoryDb>['reset'];
  supabaseGetUser: Mock;
  stripeQueueAdd: Mock;
  verifyWebhook: Mock;
}

export function createTestApp(): TestContext {
  const memory = createMemoryDb();

  const supabaseGetUser = vi.fn();

  const supabaseAdmin = {
    auth: {
      getUser: supabaseGetUser,
    },
  } as unknown as SupabaseClient;

  const stripeQueueAdd = vi.fn();

  const stripeQueue = {
    add: stripeQueueAdd,
  } as unknown as Parameters<typeof createApp>[0] extends {
    stripeQueue?: infer Q;
  }
    ? Q
    : never;

  const verifyWebhook = vi.fn((): Promise<Stripe.Event> =>
    Promise.reject(new Error('verifyWebhook not configured'))
  );

  const app = createApp({
    stripeQueue,
    supabaseAdmin,
    prisma: memory.db as never,
    verifyWebhook: verifyWebhook as never,
  });

  return {
    app,
    db: memory.db,
    seed: memory.seed,
    reset: memory.reset,
    supabaseGetUser,
    stripeQueueAdd,
    verifyWebhook,
  };
}
