// =====================================================================
// 🖥️ Server Component — apps/admin/src/app/(admin)/admin/api/page.tsx
// =====================================================================
// Page d'administration pour auditer et valider les demandes d'accès API.
// L'approbation est modulable : l'admin choisit les permissions accordées
// (API entrante, API sortante, OAuth) via le picker côté client.
// =====================================================================

import React from 'react';
import { ApiRequestsClient, ApiApplicant, ApiModule } from './components/api-requests-client';
import { Terminal } from 'lucide-react';
import { getApiApplicants, getApiAccessModules } from '@/lib/admin-data';

export default async function AdminApiRequestsPage() {
  // Créateurs ayant demandé l'accès API + registre des permissions modulables
  // (Go en primaire, fallback Prisma dev).
  const [applicants, modules] = await Promise.all([getApiApplicants(), getApiAccessModules()]);

  // Sérialisation propre des dates
  const serializedApplicants: ApiApplicant[] = applicants.map((app) => ({
    id: app.id,
    name: app.name,
    email: app.email,
    subdomain: app.subdomain,
    apiAccessStatus: app.apiAccessStatus,
    apiGrants: app.apiGrants ?? [],
    apiApplicationReason: app.apiApplicationReason,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  }));

  const serializedModules: ApiModule[] = (modules ?? []).map((m) => ({
    key: m.key,
    label: m.label,
    description: m.description,
    category: m.category,
    enabled: m.enabled,
  }));

  return (
    <div className="w-full max-w-6xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <Terminal className="w-4 h-4" />
          Administration Console
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Demandes d'accès API</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Auditez les cas d'usage des créateurs du réseau et accordez-leur un accès API modulable :
          vous choisissez, permission par permission, ce qui leur est ouvert (API entrante en
          lecture ou écriture, API sortante webhooks, OAuth) — et pouvez le retirer à tout moment.
        </p>
      </div>

      <ApiRequestsClient initialApplicants={serializedApplicants} modules={serializedModules} />
    </div>
  );
}
