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
import { getActiveWorkspace } from '@/lib/active-workspace';

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

  // 2. Contexte de workspace actif
  const workspace = await getActiveWorkspace(user.id);
  const isMedia = workspace.type === 'MEDIA' && Boolean(workspace.mediaId);

  // 3. Récupération des données selon le workspace
  let status = 'none';
  let grants: string[] = [];
  let reason: string | null = null;
  let keys: ApiKeyDTO[] = [];

  if (isMedia && workspace.mediaId) {
    // Mode Média : les clés sont gérées au niveau du Média (RBAC api_keys:manage)
    status = 'approved';
    grants = ['api:read', 'api:write', 'api:analytics'];
    try {
      const keysRes = await goFetch<{
        keys: Array<{
          id: string;
          name: string;
          keyPrefix: string;
          scopes?: string[];
          createdAt: string;
          lastUsedAt?: string | null;
        }>;
      }>(`/v1/media/${encodeURIComponent(workspace.mediaId)}/api-keys`);
      keys = (keysRes.keys ?? []).map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes ?? [],
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt ?? null,
      }));
    } catch (err) {
      console.warn('[developer] impossible de lire les clés API du média:', err);
    }
  } else {
    // Mode Personnel : Go GET /v1/users/me + GET /v1/settings/api-keys
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
  }

  return (
    <DeveloperClient
      initialStatus={status}
      initialGrants={grants}
      initialReason={reason}
      initialKeys={keys}
      activeWorkspace={{
        type: workspace.type,
        name: workspace.name,
        mediaId: workspace.mediaId,
        publicationId: workspace.publicationId,
      }}
    />
  );
}
