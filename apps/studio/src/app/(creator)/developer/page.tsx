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

  // 2. Go : statut d'accès API + clés (chemin nominal).
  const [me, keysRes] = await Promise.all([
    goFetch<{ data: { apiAccessStatus: string; apiApplicationReason: string | null } }>(
      '/v1/users/me'
    ),
    goFetch<{ keys: ApiKeyDTO[] }>('/v1/settings/api-keys'),
  ]);
  return (
    <DeveloperClient
      initialStatus={me.data.apiAccessStatus}
      initialReason={me.data.apiApplicationReason}
      initialKeys={keysRes.keys ?? []}
    />
  );
}
