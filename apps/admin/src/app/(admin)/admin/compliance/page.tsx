import { ShieldCheck } from 'lucide-react';
import {
  getAdminConsentExports,
  getAdminDeletionRequests,
  getAdminLegalCompliance,
  getAdminLegalReviews,
  verifyAdminConsentExports,
} from '@/lib/admin-data';
import { ComplianceDashboard } from './ComplianceDashboard';
import { ComplianceLifecycle } from './ComplianceLifecycle';
import { DSARRequestsManager } from './DSARRequestsManager';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';

export const dynamic = 'force-dynamic';

export default async function AdminCompliancePage() {
  requireCapability(await getAdminIdentity(), 'admin.compliance.read');

  // Lectures en parallèle : le tableau, le registre des revues, les
  // pièces produites et les demandes d'effacement RGPD.
  const [snapshot, reviews, exports, verification, deletionRequests] = await Promise.all([
    getAdminLegalCompliance(),
    getAdminLegalReviews(),
    getAdminConsentExports(),
    verifyAdminConsentExports(),
    getAdminDeletionRequests(),
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

      <DSARRequestsManager requests={deletionRequests} />

      <ComplianceLifecycle
        reviews={reviews}
        exports={exports}
        verification={verification}
        documents={documents}
      />
    </div>
  );
}
