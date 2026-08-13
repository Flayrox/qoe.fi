// =====================================================================
// 🖥️ Server Component — apps/dashboard/src/app/(creator)/developer/page.tsx
// =====================================================================
// Page développeur pour demander l'accès API et gérer les clés d'API.
// Connecté directement à la base de données.
// =====================================================================

import { redirect } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { requireUser } from '@qoe/auth/current-user';
import { DeveloperClient } from '@/features/developer/components/developer-client';

export default async function DeveloperPage() {
  // 1. Authentification de l'utilisateur
  const user = await requireUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Récupération fraîche du statut d'accès à l'API de l'utilisateur
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
