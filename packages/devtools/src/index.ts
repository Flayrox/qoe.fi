// =====================================================================
// 🧰 packages/devtools — panneau de dev local (ex-packages/db/devtools.ts)
// =====================================================================
// Remplaçant 100 % Go du panneau DevtoolsPanel : toutes les opérations
// base de données passent par le module superadmin /v1/devtools/* de
// l'API Go. Seules les interactions Supabase Auth restent côté TS
// (création de comptes, impersonation, déconnexion) et la restauration
// de backup (psql pur, aucun accès app).
// =====================================================================

'use server';

import 'dotenv/config';
import { createServiceClient, createClient } from '@qoe/supabase/server';
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { goFetch } from './go-client';

const execAsync = promisify(exec);

export interface DevtoolsUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
  role: string;
  subdomain: string | null;
  customDomain: string | null;
  accentColor: string | null;
  layoutStyle: string | null;
  createdAt: string;
}

export interface DevtoolsStats {
  users: number;
  articles: number;
  posts: number;
  likes: number;
  subscribers: number;
}

interface GoDevtoolsData {
  stats: DevtoolsStats;
  users: DevtoolsUser[];
}

/**
 * 📊 Récupère les données et compteurs de la base en direct (GET /v1/devtools/data).
 */
export async function getDevtoolsData() {
  try {
    const data = await goFetch<GoDevtoolsData>('/v1/devtools/data');
    return { success: true, users: data.users ?? [], stats: data.stats };
  } catch (error) {
    // Erreurs auth (401/403) = API joignable mais refusée ; on les rend
    // explicites plutôt que de laisser transparaître le message serveur brut.
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status =
      error && typeof error === 'object' && 'status' in error
        ? (error as { status?: number }).status
        : undefined;
    let clarity = 'Erreur de lecture des données (devtools) : ' + (msg || 'Unknown');
    if (status === 401) {
      clarity =
        'Non autorisé : aucune session Supabase détectée pour le panneau devtools. Vérifie QOE_API_URL et la connexion du compte admin (' +
        msg +
        ').';
    } else if (status === 403) {
      clarity = 'Refusé : compte non superadmin côté API (' + msg + ').';
    }
    console.error('Error in getDevtoolsData:', error);
    return { success: false, error: clarity };
  }
}

/**
 * 👤 Enregistre un utilisateur dans Supabase Auth (Admin) puis le crée/met à
 * jour côté DB via POST /v1/devtools/create-user (user + publication + pack).
 */
export async function createMockUserAction({
  name,
  email,
  username,
  subdomain,
  role,
  layoutStyle = 'minimal',
  accentColor = '#c5a880',
}: {
  name: string;
  email: string;
  username: string;
  subdomain: string;
  role: string;
  layoutStyle?: string;
  accentColor?: string;
}) {
  let userId: string | null = null;
  let authWarning: string | null = null;

  try {
    const supabase = createServiceClient();

    // 1. Créer/Inscrire le compte dans l'authentification Supabase (Service Role)
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: 'password123', // mot de passe universel de test local
      email_confirm: true,
      user_metadata: {
        name,
        username,
      },
    });

    if (error && error.message !== 'A user with this email already exists') {
      throw new Error(`Supabase Auth error: ${error.message}`);
    }

    userId = data?.user?.id || null;

    // Si l'utilisateur existait déjà, on essaie de le retrouver dans Supabase Auth pour avoir son ID
    if (!userId) {
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw new Error(`Supabase Auth list error: ${listError.message}`);
      const existingAuthUser = listData.users.find(
        (u: { email?: string | null }) => u.email === email
      );
      if (existingAuthUser) {
        userId = existingAuthUser.id;
      } else {
        throw new Error('Could not create or find Supabase Auth user');
      }
    }
  } catch (error) {
    console.warn(
      '⚠️ Supabase Auth integration failed, using deterministic UUID fallback. Error:',
      error instanceof Error ? error.message : String(error)
    );
    authWarning =
      (error instanceof Error ? error.message : 'Unknown error') ||
      'Invalid API Key / Service Role not configured';

    // Fallback: Generate a random UUID so that the database row is still created successfully
    userId = crypto.randomUUID();
  }

  try {
    // 2. Créer/mettre à jour user + publication + pack via l'API Go (superadmin).
    await goFetch('/v1/devtools/create-user', {
      method: 'POST',
      body: {
        id: userId!,
        name,
        email,
        username,
        role,
        subdomain,
        layoutStyle,
        accentColor,
      },
    });

    return { success: true, userId, authWarning };
  } catch (error) {
    console.error('Error in createMockUserAction (Go create-user):', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Go create-user failed',
    };
  }
}

/**
 * ✍️ Génère 15 pensées (micro-posts) premium aléatoires sur la timeline
 * globale (POST /v1/devtools/generate-posts).
 */
export async function generateMockFeedPostsAction() {
  try {
    await goFetch('/v1/devtools/generate-posts', { method: 'POST' });
    return { success: true };
  } catch (error) {
    console.error('Error in generateMockFeedPostsAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Unknown error',
    };
  }
}

/**
 * 🧹 Réinitialise entièrement la base de données de test locale de manière
 * ordonnée (POST /v1/devtools/reset) et recrée les SystemConfig par défaut.
 */
export async function resetDatabaseAction() {
  try {
    await goFetch('/v1/devtools/reset', { method: 'POST' });
    return { success: true };
  } catch (error) {
    console.error('Error in resetDatabaseAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Database reset failed',
    };
  }
}

/**
 * ⚡ Seeder complet du pack de test — exécute le seed canonique Go
 * (internal/seed) via POST /v1/devtools/seed.
 */
export async function seedFullDatabaseAction() {
  try {
    await goFetch('/v1/devtools/seed', { method: 'POST' });
    return { success: true };
  } catch (error) {
    console.error('Error in seedFullDatabaseAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Failed to seed',
    };
  }
}

/**
 * 💾 Restaure la DB top du top depuis le backup le plus récent plus l'umami.
 *
 * Pourquoi pas un simple `psql` : en dev local, `psql` n'existe que DANS les
 * containers (pas sur le host), et le dump app est un dump Supabase complet
 * (schémas auth/storage/realtime…) dont la restauration exige le superuser
 * `supabase_admin` (et non `postgres`). La restauration passe donc par
 * `docker exec` vers les containers dev, avec les rôles adaptés.
 */

type PsqlTarget =
  | { kind: 'docker'; container: string; role: string; database: string }
  | { kind: 'host'; url: string };

type RestoredBackup = { main: string; umami?: string };

// Retrouve le dossier `backups/` du monorepo (remonte les niveaux depuis cwd).
function findBackupsDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'backups');
    try {
      if (fs.existsSync(candidate)) {
        const entries = fs.readdirSync(candidate);
        if (entries.some((f) => f.endsWith('.sql.gz'))) return candidate;
      }
    } catch {
      /* ignore */
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Backup le plus récent `prefix*.sql.gz` (les noms sont préfixés par la date).
function findLatestBackup(dir: string | null, prefix: string): string | null {
  if (!dir) return null;
  try {
    const files = (fs.readdirSync(dir) as string[])
      .filter((f) => f.startsWith(prefix) && f.endsWith('.sql.gz'))
      .sort()
      .reverse();
    return files.length ? path.join(dir, files[0]) : null;
  } catch {
    return null;
  }
}

// Résout les fichiers de backup (env override d'abord, sinon le plus récent).
function resolveBackups(): RestoredBackup {
  const dir = findBackupsDir();
  return {
    main: process.env.QOE_TOP_DB_BACKUP || findLatestBackup(dir, 'top-db-') || '',
    umami: process.env.QOE_UMAMI_BACKUP || findLatestBackup(dir, 'umami-') || undefined,
  };
}

function dockerContainer(name: string | undefined, fallback: string): string {
  return name || fallback;
}

// Strie les balises `\restrict` / `\unrestrict` (pg_dump 17) : sans cela, `psql`
// ne charge que les données (COPY) et ignore le schéma → restore en double.
function sedStripRestrict(): string {
  return `sed -E '/^\\\\restrict[ \\t].*$/d; /^\\\\unrestrict[ \\t].*$/d'`;
}

// Restaure un dump SQL gzip vers une cible (container via docker exec, ou psql host).
async function streamRestore(
  gzPath: string,
  target: PsqlTarget,
  opts?: { stripRestrict?: boolean; maxBufferMB?: number }
): Promise<string> {
  const maxBuffer = (opts?.maxBufferMB ?? 100) * 1024 * 1024;
  const filter = opts?.stripRestrict ? `${sedStripRestrict()} |` : '';
  let command: string;
  if (target.kind === 'docker') {
    command = `gunzip -c "${gzPath}" | ${filter} docker exec -i ${target.container} psql -U ${target.role} -d ${target.database} -v ON_ERROR_STOP=0`;
  } else {
    command = `gunzip -c "${gzPath}" | ${filter} psql "${target.url.replace(/"/g, '\\"')}"`;
  }
  const { stdout } = await execAsync(command, { maxBuffer });
  return stdout;
}

// Restaure la DB app (Supabase) puis la DB umami (best-effort).
export async function restoreTopDbAction(): Promise<{
  success: boolean;
  error?: string;
  details?: string;
}> {
  try {
    const { main, umami } = resolveBackups();
    if (!main) {
      return {
        success: false,
        error:
          "Backup main DB introuvable. Vide backups/ d'un top-db-*.sql.gz (ou pointe QOE_TOP_DB_BACKUP).",
      };
    }

    // Cible app : le DB PostgreSQL derrière DATABASE_URL. En dev local c'est le
    // Postgres Supabase (port 54322) dont le superuser est `supabase_admin`
    // (pas `postgres`). Containers surchargeables via env.
    const appTarget: PsqlTarget = {
      kind: 'docker',
      container: dockerContainer(process.env.QOE_APP_DB_CONTAINER, 'supabase_db_qoe.fi'),
      role: process.env.QOE_APP_DB_ROLE || 'supabase_admin',
      database: process.env.QOE_APP_DB_NAME || 'postgres',
    };

    // Pré-reset déterministe du schéma `public` : le dump ne droppe que dans
    // l'ordre de sa propre liste, et échoue (“other objects depend on it”) sur
    // une base déjà polluée. Vider `public` d'abord garantit un état vierge.
    await execAsync(
      `docker exec -i ${appTarget.container} psql -U ${appTarget.role} -d ${appTarget.database} -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    // Le dump app est un dump Supabase complet : on supprime les marqueurs
    // `\restrict`/`\unrestrict` pour restaurer schéma + données en une passe.
    await streamRestore(main, appTarget, { stripRestrict: true, maxBufferMB: 150 });

    // DB umami — best-effort (la base d\'analytics est secondaire). On passe
    // par docker exec (psql fiable dans le container) sauf si on demande
    // explicitement le psql host via QOE_RESTORE_USE_HOST_PG=1. On supprime
    // aussi les marqueurs `\restrict` pour un comportement déterministe quel
    // que soit la version de psql.
    let umamiDetail = '';
    if (umami) {
      const umamiTarget: PsqlTarget =
        process.env.QOE_RESTORE_USE_HOST_PG === '1' && process.env.UMAMI_DATABASE_URL
          ? { kind: 'host', url: process.env.UMAMI_DATABASE_URL }
          : {
              kind: 'docker',
              container: dockerContainer(process.env.QOE_UMAMI_DB_CONTAINER, 'qoefi-dev-db'),
              role: process.env.QOE_UMAMI_DB_ROLE || 'postgres',
              database: process.env.QOE_UMAMI_DB_NAME || 'umami',
            };
      try {
        await streamRestore(umami, umamiTarget, { stripRestrict: true, maxBufferMB: 50 });
        umamiDetail = ` · umami ✓ (${path.basename(umami)})`;
      } catch (e) {
        console.warn('[restoreTopDb] Umami restore warn', e);
        umamiDetail = ' · umami ⚠ échec (voir logs)';
      }
    }

    return {
      success: true,
      details: `Restauré depuis ${path.basename(main)}${umamiDetail}`,
    };
  } catch (e) {
    console.error('restoreTopDbAction failed', e);
    const msg = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error:
        msg.includes('docker') || msg.includes('Cannot connect')
          ? `Docker indisponible ou container non trouvé — ${msg}`
          : msg,
    };
  }
}

/**
 * ✨ Régénère la DB « top du top » depuis zéro (POST /v1/devtools/seed-top) :
 * reset complet + génération déterministe (500 users, 200 articles, 1480
 * pensées, lectures, umami) + embeddings enqueueés + reindex Meili.
 */
export async function seedTopCompleteAction() {
  try {
    const res = await goFetch<{
      users?: number;
      articles?: number;
      posts?: number;
      readingSessions?: number;
      embeddingsEnqueued?: number;
      umami?: string;
      meilisearch?: { total?: number; upserted?: number };
    }>('/v1/devtools/seed-top-complete', { method: 'POST' });
    return {
      success: true,
      details: `${res.users ?? '?'} comptes · ${res.articles ?? '?'} articles · ${res.posts ?? '?'} posts · ${res.readingSessions ?? '?'} lectures · ${res.embeddingsEnqueued ?? 0} embeddings${res.umami ? ' · Umami ✓' : ''}${res.meilisearch ? ' · Meili ✓' : ''}`,
    };
  } catch (error) {
    console.error('Error in seedTopCompleteAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Seed complet failed',
    };
  }
}

export async function seedTopDbAction() {
  try {
    const res = await goFetch<{
      users?: number;
      articles?: number;
      posts?: number;
      readingSessions?: number;
      umami?: string;
    }>('/v1/devtools/seed-top', { method: 'POST' });
    return {
      success: true,
      details: `${res.users ?? '?'} users · ${res.articles ?? '?'} articles · ${res.posts ?? '?'} pensées · ${res.readingSessions ?? '?'} lectures${res.umami ? ' · umami ✓' : ''}`,
    };
  } catch (error) {
    console.error('Error in seedTopDbAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Seed top failed',
    };
  }
}

/**
 * 🔎 Re-synchronise l'index Meilisearch (backfill idempotent : seuls les
 * documents manquants sont upsertés) via POST /v1/devtools/reindex.
 */
export async function reindexAction() {
  try {
    const res = await goFetch<{ total?: number; upserted?: number }>('/v1/devtools/reindex', {
      method: 'POST',
    });
    return { success: true, total: res.total, upserted: res.upserted };
  } catch (error) {
    console.error('Error in reindexAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Reindex failed',
    };
  }
}

/**
 * 🔄 Réinitialise l'état d'onboarding d'un utilisateur (ou de tous) pour
 * faciliter les tests (POST /v1/devtools/reset-onboarding).
 */
export async function resetOnboardingAction(targetEmailOrId?: string) {
  try {
    await goFetch('/v1/devtools/reset-onboarding', {
      method: 'POST',
      body: { target: targetEmailOrId ?? '' },
    });
    return { success: true };
  } catch (error) {
    console.error('Error in resetOnboardingAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') || 'Failed to reset onboarding',
    };
  }
}

/**
 * 🤝 Simule un abonnement d'un lecteur (par email) vers une publication
 * (POST /v1/devtools/simulate-subscriber).
 */
export async function simulateSubscriberAction({
  publicationId,
  email,
  isPremium = false,
  ltvCents = 0,
}: {
  publicationId: string;
  email: string;
  isPremium?: boolean;
  ltvCents?: number;
}) {
  try {
    await goFetch('/v1/devtools/simulate-subscriber', {
      method: 'POST',
      body: { publicationId, email, isPremium, ltvCents },
    });
    return { success: true };
  } catch (error) {
    console.error('Error in simulateSubscriberAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') ||
        'Subscription simulation failed',
    };
  }
}

/**
 * 🤝 Simule une liaison d'abonnement (Follow) entre un lecteur et une
 * publication (POST /v1/devtools/simulate-follow).
 */
export async function simulateFollowAction({
  readerId,
  publicationId,
}: {
  readerId: string;
  publicationId: string;
}) {
  try {
    await goFetch('/v1/devtools/simulate-follow', {
      method: 'POST',
      body: { readerId, publicationId },
    });
    return { success: true };
  } catch (error) {
    console.error('Error in simulateFollowAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') || 'Follow simulation failed',
    };
  }
}

/**
 * ❤️ Bascule (toggle) un Like sur un micro-post de feed pour un utilisateur
 * (POST /v1/devtools/simulate-like).
 */
export async function simulateLikeAction({ postId, userId }: { postId: string; userId: string }) {
  try {
    await goFetch('/v1/devtools/simulate-like', {
      method: 'POST',
      body: { postId, userId },
    });
    return { success: true };
  } catch (error) {
    console.error('Error in simulateLikeAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Like toggle failed',
    };
  }
}

/**
 * 🪙 Ajoute ou retire des fonds (crédits virtuels) dans le portefeuille d'un
 * utilisateur (POST /v1/devtools/add-funds).
 */
export async function addMockFundsAction({
  userId,
  amountCents,
}: {
  userId: string;
  amountCents: number;
}) {
  try {
    const res = await goFetch<{ balanceCents: number }>('/v1/devtools/add-funds', {
      method: 'POST',
      body: { userId, amountCents },
    });
    return { success: true, balanceCents: res.balanceCents ?? 0 };
  } catch (error) {
    console.error('Error in addMockFundsAction:', error);
    return {
      success: false,
      error:
        (error instanceof Error ? error.message : 'Unknown error') ||
        'Failed to adjust wallet balance',
    };
  }
}

/**
 * 🔑 Connexion en tant que (impersonation) : lookup DB via l'API Go
 * (GET /v1/devtools/user-by-email) + sign-in Supabase avec le mot de passe
 * universel de dev.
 */
export async function impersonateLoginAction(email: string) {
  try {
    let targetEmail = email.trim().toLowerCase();
    if (targetEmail === 'victor@qoe.fi') targetEmail = 'victorhugo@qoe.fi';

    // 0. Lookup DB via l'API Go (le user doit exister en base).
    const user = await goFetch<{
      id: string;
      name: string | null;
      email: string;
      username: string | null;
    }>(`/v1/devtools/user-by-email?email=${encodeURIComponent(targetEmail)}`);
    if (!user) {
      return { success: false, error: `Utilisateur (${targetEmail}) introuvable dans PostgreSQL` };
    }

    const supabase = await createClient();

    // 1. Tenter la connexion Supabase avec le mot de passe universel dev
    let signInResult = await supabase.auth.signInWithPassword({
      email: targetEmail,
      password: 'password123',
    });

    if (signInResult.error) {
      // Si l'utilisateur n'a pas le mot de passe "password123" dans Supabase Auth,
      // le réinitialiser/créer via le service client admin
      try {
        const adminSupabase = createServiceClient();
        const { data: listData } = await adminSupabase.auth.admin.listUsers();
        const authUser = listData?.users?.find((u) => u.email === targetEmail);

        if (authUser) {
          await adminSupabase.auth.admin.updateUserById(authUser.id, {
            password: 'password123',
            email_confirm: true,
          });
        } else {
          await adminSupabase.auth.admin.createUser({
            email: targetEmail,
            password: 'password123',
            email_confirm: true,
            user_metadata: { name: user.name, username: user.username },
          });
        }

        // Réessayer la connexion
        signInResult = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: 'password123',
        });
      } catch (adminErr) {
        console.error('Admin user sync error in impersonateLoginAction:', adminErr);
      }
    }

    if (signInResult.error) {
      return { success: false, error: signInResult.error.message };
    }

    return { success: true, user };
  } catch (error) {
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Impersonation error',
    };
  }
}

export async function logoutAction() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Logout error',
    };
  }
}
