// =====================================================================
// 🔧 e2e/lib/env.ts — résolution partagée de l'environnement E2E.
// Lit d'abord l'environnement de processus (CI), puis bascule sur
// apps/api/.env en local (parité avec les specs de capture existants).
// =====================================================================

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"\n]*)"?$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const localEnv = loadEnv(path.join(process.cwd(), 'apps/api/.env'));

function resolve(key: string, fallback = ''): string {
  return process.env[key] ?? localEnv[key] ?? fallback;
}

/** URL de la base de l'app (Postgres, schéma goose). */
export const DATABASE_URL = resolve('DATABASE_URL', resolve('API_DATABASE_URL', ''));

/**
 * URL de l'API Go. ⚠️ N'utilise PAS le fallback apps/api/.env : celui-ci
 * pointe vers l'API de DEV (15407), pas vers l'API Go que Playwright démarre
 * (8090). Sinon les specs (creator-slugs, tenants…) appellent la base dev et
 * échouent (401 Clé API invalide) quand l'e2e est isolé sur qoe_test.
 * On privilégie process.env.QOE_API_URL (CI / app-config), sinon :8090.
 */
export const GO_API_URL = process.env.QOE_API_URL ?? 'http://localhost:8090';

/** Secret HMAC GoTrue utilisé par l'API Go (SUPABASE_JWT_SECRET). */
export const JWT_SECRET = resolve('SUPABASE_JWT_SECRET', resolve('SUPABASE_SECRET_KEY', ''));

/** URL Supabase (résolution du nom de cookie sb-<host>-auth-token). */
export const SUPABASE_URL = resolve(
  'NEXT_PUBLIC_SUPABASE_URL',
  resolve('SUPABASE_AUTH_URL', 'http://127.0.0.1:54321')
);

/** Nom du cookie de session supabase-js (sb-<hostname-label>-auth-token). */
export const COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * 🔐 Interpolation d'un JWT HS256 signé avec JWT_SECRET (aucune dépendance).
 * Utilisé pour les parcours authentifiés E2E : l'API Go valide ce token via
 * son fallback HMAC (SUPABASE_JWT_SECRET) quand Supabase n'est pas joignable.
 */
export function mintJwt(sub: string, extra: Record<string, unknown> = {}): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { sub, exp: now + 3600, iat: now, ...extra };
  const payload = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${payload}.${sig}`;
}

/** Clé anon Supabase (signup/sign-in GoTrue pour les sessions E2E réelles). */
export const SUPABASE_ANON_KEY = resolve(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  resolve(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    loadEnv('.env')['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? ''
  )
);

/** Clé service-role Supabase, uniquement utilisée par les fixtures E2E locales/CI. */
export const SUPABASE_SERVICE_ROLE_KEY = resolve('SUPABASE_SERVICE_ROLE_KEY');

/**
 * 🍞 Crée une session GoTrue RÉELLE (signup ou sign-in) contre Supabase
 * local. Si la confirmation email est active, la fixture confirme le compte
 * via l'Admin API avant de rejouer le password grant.
 */
export async function createRealSession(
  email: string,
  password: string
): Promise<{ access_token: string; refresh_token: string; gotrueUserId: string }> {
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  let res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  let body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    user?: { id?: string };
    id?: string;
  };

  // Un signup peut créer le user sans session quand la confirmation email est requise.
  let gotrueUserId = body.user?.id ?? body.id ?? '';
  if (!body.access_token && gotrueUserId && SUPABASE_SERVICE_ROLE_KEY) {
    const confirm = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${gotrueUserId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ email_confirm: true }),
    });
    if (!confirm.ok) {
      throw new Error(`GoTrue confirmation ${confirm.status}: ${await confirm.text()}`);
    }
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    body = (await res.json().catch(() => ({}))) as typeof body;
  } else if (!res.ok) {
    // Compte déjà existant → connexion par mot de passe.
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });
    body = (await res.json().catch(() => ({}))) as typeof body;
  }

  if (!res.ok || !body.access_token || !body.refresh_token) {
    throw new Error(`GoTrue ${res.status}: ${JSON.stringify(body)}`);
  }

  // L'UUID GoTrue est LA clé d'identité : les lignes DB doivent utiliser CET id.
  gotrueUserId = body.user?.id ?? body.id ?? gotrueUserId;
  if (!gotrueUserId) {
    throw new Error('id utilisateur GoTrue absent de la réponse');
  }
  return { access_token: body.access_token, refresh_token: body.refresh_token, gotrueUserId };
}
