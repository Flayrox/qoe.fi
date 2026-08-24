// =====================================================================
// 🖥️ Server Component — apps/studio/src/app/(creator)/developer/page.tsx
// =====================================================================
// Page développeur pour demander l'accès API et gérer les clés d'API.
// Go en primaire (GET /v1/users/me + GET /v1/settings/api-keys) —
// fallback Prisma dev si QOE_API_URL absent.
// =====================================================================

import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';
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

  // 2. Go en primaire : statut d'accès API + clés (chemin nominal).
  if (isGoEnabled()) {
    try {
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
    } catch {
      // Fallback Prisma dev ci-dessous (QOE_API_URL indisponible).
    }
  }

  // ⚠️ Fallback dev — le chemin nominal est le Go ci-dessus.
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      apiAccessStatus: true,
      apiApplicationReason: true,
    },
  });

  if (!dbUser) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border rounded-2xl bg-destructive/5 border-destructive/10">
        <h2 className="text-lg font-bold text-destructive">Profil créateur introuvable</h2>
        <p className="text-sm text-muted-foreground mt-1">Veuillez contacter l'équipe technique.</p>
      </div>
    );
  }

  // 3. Récupération des clés d'API générées par l'utilisateur
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // Sérialisation sécurisée en string pour Next.js Client Components
  const serializedKeys = apiKeys.map((key) => ({
    id: key.id,
    name: key.name,
    keyPrefix: key.keyPrefix,
    scopes: key.scopes,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
  }));

  return (
    <DeveloperClient
      initialStatus={dbUser.apiAccessStatus}
      initialReason={dbUser.apiApplicationReason}
      initialKeys={serializedKeys}
    />
  );
}
