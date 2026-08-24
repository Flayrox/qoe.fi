'use server';

// =====================================================================
// 🛠️ DevTools — inspecteur de données (panneau dev-only monté par le
// root layout quand NODE_ENV === 'development').
// =====================================================================
// Go en primaire : GET /v1/devtools/data (utilisateurs + compteurs,
// réservé superadmin côté API). Les autres actions du panneau
// (createMockUser, seedFullDatabase, simulate*, impersonateLogin…)
// vivent dans @qoe/devtools — outillage dev en écriture, Go-first.
// =====================================================================

import { goFetch } from '@qoe/api-client/actions/utils/go-client';

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

/**
 * 📊 Récupère les données et compteurs de la base de données en direct
 * (GET /v1/devtools/data, réservé superadmin).
 */
export async function getDevtoolsData() {
  try {
    const data = await goFetch<{ users: DevtoolsUser[]; stats: DevtoolsStats }>(
      '/v1/devtools/data'
    );
    return { success: true as const, users: data.users, stats: data.stats };
  } catch (err: unknown) {
    console.error('Error in getDevtoolsData (Go):', err);
    return {
      success: false as const,
      error:
        err instanceof Error
          ? err.message
          : 'Accès DevTools refusé (réservé au superadmin) ou erreur Go',
    };
  }
}
