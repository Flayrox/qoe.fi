import { FlaskConical } from 'lucide-react';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getSandboxScenariosAction } from '@/lib/admin-sandbox-actions';
import { SandboxConsole } from './SandboxConsole';

export const dynamic = 'force-dynamic';

export default async function AdminSandboxPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  const scenarios = await getSandboxScenariosAction();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <QueuePageHeader
        icon={<FlaskConical className="w-4 h-4" />}
        title="Bac à sable & Données d'essai"
        badge="Environnement de simulation"
        description="Génération de scénarios de test isolés (lecteur cold start, média actif, dossiers de modération, pannes d'outbox, demandes RGPD) et prise d'identité contrôlée."
      />

      <SandboxConsole scenarios={scenarios} />
    </div>
  );
}
