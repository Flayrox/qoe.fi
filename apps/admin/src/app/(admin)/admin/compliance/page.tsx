import { ShieldCheck } from 'lucide-react';
import {
  getAdminConsentExports,
  getAdminLegalCompliance,
  getAdminLegalReviews,
  verifyAdminConsentExports,
} from '@/lib/admin-data';
import { ComplianceDashboard } from './ComplianceDashboard';
import { ComplianceLifecycle } from './ComplianceLifecycle';

export const dynamic = 'force-dynamic';

export default async function AdminCompliancePage() {
  // Trois lectures en parallèle : le tableau, le registre des revues et les
  // pièces produites. Aucune ne dépend des autres.
  const [snapshot, reviews, exports, verification] = await Promise.all([
    getAdminLegalCompliance(),
    getAdminLegalReviews(),
    getAdminConsentExports(),
    verifyAdminConsentExports(),
  ]);

  const documents = snapshot.documents.map((doc) => ({ slug: doc.slug, title: doc.slug }));

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
          plus publiés nulle part, quelles revues réglementaires arrivent à échéance, et de quoi
          répondre à un contrôle. Les échéances sont dérivées de la date de dernière publication
          réelle de chaque document — impossible d&apos;oublier de remettre un compteur à zéro.
        </p>
      </div>

      <ComplianceDashboard snapshot={snapshot} />

      <ComplianceLifecycle
        reviews={reviews}
        exports={exports}
        verification={verification}
        documents={documents}
      />
    </div>
  );
}
