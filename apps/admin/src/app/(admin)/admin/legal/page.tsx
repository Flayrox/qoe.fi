import { Scale } from 'lucide-react';
import {
  getAdminLegalAcceptances,
  getAdminLegalDocuments,
  getAdminLegalStats,
} from '@/lib/admin-data';
import { LegalCMS } from './LegalCMS';

export const dynamic = 'force-dynamic';

export default async function AdminLegalPage() {
  const [documents, acceptances, stats] = await Promise.all([
    getAdminLegalDocuments(),
    getAdminLegalAcceptances(undefined, 100),
    getAdminLegalStats(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Scale className="h-4 w-4" /> Contenu juridique
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          CGU, confidentialité & consentements
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Source de vérité de toutes les pages légales publiées sur les sites des créateurs. Le
          contenu publié est immuable : on publie une nouvelle version, l&apos;ancienne reste
          archivée et les preuves de consentement continuent de pointer vers la version exacte
          acceptée. Une version qui exige un consentement redéclenche automatiquement
          l&apos;acceptation des lecteurs et des créateurs concernés.
        </p>
      </div>

      <LegalCMS documents={documents} acceptances={acceptances} stats={stats} />
    </div>
  );
}
