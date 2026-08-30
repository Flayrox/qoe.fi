// =====================================================================
// 🧰 packages/devtools — panneau de dev local (ex-packages/db/devtools.ts)
// =====================================================================
// Remplaçant 100 % Go du panneau DevtoolsPanel : toutes les opérations
// base de données passent par le module superadmin /v1/devtools/* de
// l'API Go. Seules les interactions Supabase Auth restent côté TS
// (création de comptes, impersonation, déconnexion).
// =====================================================================

'use server';

import 'dotenv/config';
import { createServiceClient, createClient } from '@qoe/supabase/server';
import crypto from 'crypto';
import { goFetch } from './go-client';

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
 * 🔄 Lance la régénération de la DB de test complète en arrière-plan
 * (POST /v1/devtools/seed-top-complete) : reset complet + monde vivant
 * (500 users, 200 articles, 1480 pensées, lectures, interactions, umami),
 * embeddings enqueueés + reindex Meili. Retourne l'ID du job — la progression
 * se suit avec seedTopProgressAction.
 */
export async function seedTopCompleteAction(): Promise<{
  success: boolean;
  jobId?: string;
  error?: string;
}> {
  try {
    const res = await goFetch<{ id: string }>('/v1/devtools/seed-top-complete', {
      method: 'POST',
    });
    return { success: true, jobId: res.id };
  } catch (error) {
    console.error('Error in seedTopCompleteAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Seed complet failed',
    };
  }
}

/** Progression d'une régénération de la DB (parité SeedJob Go). */
export interface SeedJobProgress {
  id: string;
  done: boolean;
  success: boolean;
  error?: string;
  current?: string;
  steps: string[];
  progress: number;
  result?: Record<string, unknown>;
  updatedAt?: string;
}

/**
 * 📊 Progression d'une régénération de la DB
 * (GET /v1/devtools/seed-top-progress/{jobId}).
 */
export async function seedTopProgressAction(
  jobId: string
): Promise<{ success: boolean; job?: SeedJobProgress; error?: string }> {
  try {
    const job = await goFetch<SeedJobProgress>(
      `/v1/devtools/seed-top-progress/${encodeURIComponent(jobId)}`
    );
    return { success: true, job };
  } catch (error) {
    console.error('Error in seedTopProgressAction:', error);
    return {
      success: false,
      error: (error instanceof Error ? error.message : 'Unknown error') || 'Seed progress failed',
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
