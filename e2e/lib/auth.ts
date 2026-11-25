// =====================================================================
// 🔐 e2e/lib/auth.ts — session navigateur pour les specs authentifiés
// =====================================================================
// Pourquoi ce fichier : l'ancien `auth.setup.ts` posait un cookie
// `sb-qoe-auth-token` avec un FAUX token (`sb-mock-access-token-e2e`). Le
// middleware se contentait de voir un cookie `sb-*-auth-token`, mais le layout
// résout ensuite l'utilisateur auprès de GoTrue : le faux token donnait un
// utilisateur nul, donc un 307 vers /login. Toutes les specs « authentifiées »
// assertaient donc sur la page de login en croyant tester le produit.
//
// Ici : une session RÉELLE quand le stack Supabase de test/dev (VPS Hetzner,
// relayé sur 127.0.0.1:54321 par `pnpm dev:vps`) est là (signup GoTrue + ligne
// `User` en base), et un drapeau explicite quand il ne l'est pas — jamais un
// cookie inventé.
// =====================================================================

import { DATABASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL, createRealSession } from './env';
import { TestDb } from './db';

/** État d'authentification partagé entre `setup` et les specs. */
export const AUTH_STATE = 'playwright/.auth/user.json';

/**
 * GoTrue répond-il ? Sans lui, aucun écran connecté ne peut se rendre : la
 * session est résolue côté serveur (pas seulement en lisant un cookie).
 */
export async function supabaseReachable(): Promise<boolean> {
  if (!SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export interface BrowserSession {
  email: string;
  /** Valeur brute du cookie `sb-<label>-auth-token` (JSON supabase-js). */
  cookieValue: string;
}

/**
 * Crée une session GoTrue réelle + la ligne `User` correspondante, et renvoie
 * la valeur du cookie que le navigateur doit envoyer.
 */
export async function createBrowserSession(): Promise<BrowserSession> {
  const stamp = Date.now();
  const email = `e2e.session.${stamp}@qoe.fi`;
  const password = 'e2e-pass-123!';

  const session = await createRealSession(email, password);

  const db = new TestDb(DATABASE_URL);
  await db.connect();
  await db.query(
    `INSERT INTO "User" (id, email, username, name, role, "hasCompletedOnboarding", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'Lecteur E2E', 'user', true, now(), now())
     ON CONFLICT (id) DO NOTHING`,
    [session.gotrueUserId, email, `e2e-session-${stamp}`]
  );
  await db.close();

  return {
    email,
    cookieValue: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: session.gotrueUserId, email },
    }),
  };
}
