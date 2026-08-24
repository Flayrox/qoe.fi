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

/** URL de l'API Go (QOE_API_URL tel que le voient les apps web). */
export const GO_API_URL = resolve('QOE_API_URL', 'http://localhost:8090');

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
