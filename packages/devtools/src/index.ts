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
    console.error('Error in getDevtoolsData:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Unknown database error',
    };
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
 * 💾 Restaure la DB top du top depuis backups/top-db-20260822.sql.gz + umami
 * (psql pur — aucun accès app, aucun Prisma).
 */
export async function restoreTopDbAction(): Promise<{
  success: boolean;
  error?: string;
  details?: string;
}> {
  try {
    const candidates = [
      path.resolve(process.cwd(), 'backups/top-db-20260822.sql.gz'),
      path.resolve(process.cwd(), '../backups/top-db-20260822.sql.gz'),
      path.resolve(process.cwd(), '../../backups/top-db-20260822.sql.gz'),
      '/Users/ephe/Desktop/Qoe.fi/dev/prod/qoe.fi/backups/top-db-20260822.sql.gz',
    ];
    const mainBackup = candidates.find((p) => fs.existsSync(p));
    if (!mainBackup) {
      return {
        success: false,
        error: 'Backup main DB introuvable (backups/top-db-20260822.sql.gz)',
      };
    }

    const umamiCandidates = [
      path.resolve(process.cwd(), 'backups/umami-20260822.sql.gz'),
      path.resolve(process.cwd(), '../backups/umami-20260822.sql.gz'),
      path.resolve(process.cwd(), '../../backups/umami-20260822.sql.gz'),
      '/Users/ephe/Desktop/Qoe.fi/dev/prod/qoe.fi/backups/umami-20260822.sql.gz',
    ];
    const umamiBackup = umamiCandidates.find((p) => fs.existsSync(p));

    const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
    if (!dbUrl) return { success: false, error: 'DATABASE_URL manquant' };

    // Restore main DB
    await execAsync(`gunzip -c "${mainBackup}" | psql "${dbUrl.replace(/"/g, '\\"')}"`, {
      maxBuffer: 100 * 1024 * 1024,
    });

    // Restore Umami si disponible
    if (umamiBackup && process.env.UMAMI_DATABASE_URL) {
      try {
        await execAsync(
          `gunzip -c "${umamiBackup}" | psql "${process.env.UMAMI_DATABASE_URL.replace(/"/g, '\\"')}"`,
          {
            maxBuffer: 50 * 1024 * 1024,
          }
        );
      } catch (e) {
        console.warn('[restoreTopDb] Umami restore warn', e);
      }
    }

    return { success: true, details: `Restauré depuis ${path.basename(mainBackup)}` };
  } catch (e) {
    console.error('restoreTopDbAction failed', e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
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
