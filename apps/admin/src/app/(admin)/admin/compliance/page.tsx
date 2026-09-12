import { ShieldCheck } from 'lucide-react';
import { getAdminLegalCompliance } from '@/lib/admin-data';
import { ComplianceDashboard } from './ComplianceDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminCompliancePage() {
  const snapshot = await getAdminLegalCompliance();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" /> Conformité
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          Tableau de bord de conformité
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Ce que la plateforme doit pouvoir prouver : qui a accepté quoi, quels documents ne sont
          plus publiés nulle part, et quelles revues réglementaires arrivent à échéance. Les
          échéances sont dérivées de la date de dernière publication réelle de chaque document —
          impossible d&apos;oublier de remettre un compteur à zéro.
        </p>
      </div>

      <ComplianceDashboard snapshot={snapshot} />
    </div>
  );
}
