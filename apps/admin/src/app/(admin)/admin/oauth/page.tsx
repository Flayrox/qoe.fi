// =====================================================================
// 🖥️ Server Component — apps/admin/src/app/(admin)/admin/oauth/page.tsx
// =====================================================================
// Console superadmin : audit et approbation des applications OAuth 2.1 / OIDC.
// =====================================================================

import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { getOAuthClients } from '@/lib/admin-data';
import { OAuthAppsClient, type OAuthClientAdmin } from './components/oauth-apps-client';

export default async function AdminOAuthAppsPage() {
  // Applications OAuth (Go en primaire, fallback Prisma dev).
  const clients = await getOAuthClients();

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
    ownerName: c.ownerName,
    ownerEmail: c.ownerEmail,
    ownerUsername: c.ownerUsername,
    createdAt: c.createdAt,
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
