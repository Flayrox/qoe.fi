// =====================================================================
// 🖥️ Server Component — apps/admin/src/app/(admin)/admin/oauth/page.tsx
// =====================================================================
// Console superadmin : audit et approbation des applications OAuth 2.1 / OIDC.
// =====================================================================

import React from 'react';
import { prisma } from '@qoe/db/client';
import { ShieldCheck } from 'lucide-react';
import { OAuthAppsClient, type OAuthClientAdmin } from './components/oauth-apps-client';

export default async function AdminOAuthAppsPage() {
  const clients = await prisma.oAuthClient.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      owner: { select: { name: true, email: true, username: true } },
    },
  });

  const serialized: OAuthClientAdmin[] = clients.map((c) => ({
    id: c.id,
    clientId: c.clientId,
    name: c.name,
    description: c.description,
    logoUrl: c.logoUrl,
    homepageUrl: c.homepageUrl,
    redirectUris: c.redirectUris,
    scopes: c.scopes,
    clientType: c.clientType,
    status: c.status,
    ownerName: c.owner.name,
    ownerEmail: c.owner.email,
    ownerUsername: c.owner.username,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div className="w-full max-w-6xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <ShieldCheck className="w-4 h-4" />
          Administration Console
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Applications OAuth</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Auditez et activez les applications « Se connecter avec qoe.fi » créées par les
          développeurs du réseau.
        </p>
      </div>

      <OAuthAppsClient initialClients={serialized} />
    </div>
  );
}
