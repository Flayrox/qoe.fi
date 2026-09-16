// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/developer/page.tsx
// =====================================================================
// Page développeur pour demander l'accès API et gérer les clés d'API.
// Go en primaire : GET /v1/users/me + GET /v1/settings/api-keys.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { DeveloperClient } from '@/features/developer/components/developer-client';

interface ApiKeyDTO {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export default async function DeveloperPage() {
  // 1. Authentification de l'utilisateur
  const user = await requireUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Go : statut d'accès API + clés (chemin nominal avec fallbacks résilients).
  let status = 'none';
  let grants: string[] = [];
  let reason: string | null = null;
  let keys: ApiKeyDTO[] = [];

  try {
    const me = await goFetch<{
      data: {
        apiAccessStatus: string;
        apiGrants: string[];
        apiApplicationReason: string | null;
      };
    }>('/v1/users/me');
    status = (me.data?.apiAccessStatus ?? 'none').toLowerCase();
    grants = me.data?.apiGrants ?? [];
    reason = me.data?.apiApplicationReason ?? null;
  } catch (err) {
    console.warn('[developer] impossible de lire le profil utilisateur:', err);
  }

  // Ne requêter les clés API que si l'accès est approuvé
  if (status === 'approved') {
    try {
      const keysRes = await goFetch<{ keys: ApiKeyDTO[] }>('/v1/settings/api-keys');
      keys = keysRes.keys ?? [];
    } catch (err) {
      console.warn('[developer] impossible de lire les clés API:', err);
    }
  }

  return (
    <DeveloperClient
      initialStatus={status}
      initialGrants={grants}
      initialReason={reason}
      initialKeys={keys}
    />
  );
}
