// =====================================================================
// 🖥️ Server Component — apps/admin/src/app/(admin)/admin/api/page.tsx
// =====================================================================
// Page d'administration pour auditer et valider les demandes d'accès API.
// =====================================================================

import React from 'react';
import { ApiRequestsClient, ApiApplicant } from './components/api-requests-client';
import { Terminal } from 'lucide-react';
import { getApiApplicants } from '@/lib/admin-data';

export default async function AdminApiRequestsPage() {
  // Créateurs ayant demandé l'accès API (Go en primaire, fallback Prisma dev).
  const applicants = await getApiApplicants();

  // Sérialisation propre des dates
  const serializedApplicants: ApiApplicant[] = applicants.map((app) => ({
    id: app.id,
    name: app.name,
    email: app.email,
    subdomain: app.subdomain,
    apiAccessStatus: app.apiAccessStatus,
    apiApplicationReason: app.apiApplicationReason,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
  }));

  return (
    <div className="w-full max-w-5xl mx-auto space-y-10">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
          <Terminal className="w-4 h-4" />
          Administration Console
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Demandes d'accès API</h1>
        <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">
          Auditez les cas d'usage des créateurs du réseau et activez ou révoquez leur accès à l'API
          publique de lecture.
        </p>
      </div>

      <ApiRequestsClient initialApplicants={serializedApplicants} />
    </div>
  );
}
