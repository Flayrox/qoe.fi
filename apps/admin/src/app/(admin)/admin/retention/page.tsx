import { Database } from 'lucide-react';
import { getAdminRetentionJournal, getAdminRetentionPolicies } from '@/lib/admin-data';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { RetentionConsole } from './RetentionConsole';

export const dynamic = 'force-dynamic';

export default async function AdminRetentionPage() {
  requireCapability(await getAdminIdentity(), 'admin.compliance.read');

  // Lectures en parallèle : les politiques de conservation et le journal des purges
  const [policies, journal] = await Promise.all([
    getAdminRetentionPolicies(),
    getAdminRetentionJournal(50),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Database className="h-4 w-4" /> Conformité &amp; Données
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
          Rétention &amp; Purge planifiée
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Cadre de conservation des données par table conformément au principe de limitation de la
          conservation (Art. 5(1)(e) RGPD). Chaque purge de table est simulable (Dry Run) ou
          exécutable sous contrôle d’autorisation renforcée (Step-up N2) et consignée de manière
          inaltérable dans le journal d’audit.
        </p>
      </div>

      <RetentionConsole policies={policies} journal={journal} />
    </div>
  );
}
