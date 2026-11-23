import { FlaskConical } from 'lucide-react';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getSandboxScenariosAction } from '@/lib/admin-sandbox-actions';
import { UnavailableNotice } from '@/components/shell/UnavailableNotice';
import { SandboxConsole } from './SandboxConsole';

export const dynamic = 'force-dynamic';

export default async function AdminSandboxPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  // Scénarios illisibles : le sélecteur vide se lirait « aucun scénario disponible ».
  const scenarios = await getSandboxScenariosAction();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <QueuePageHeader
        icon={<FlaskConical className="w-4 h-4" />}
        title="Bac à sable & Données d'essai"
        badge="Environnement de simulation"
        description="Génération de scénarios de test isolés (lecteur cold start, média actif, dossiers de modération, pannes d'outbox, demandes RGPD) et prise d'identité contrôlée."
      />

      {scenarios.ok ? null : <UnavailableNotice what="Les scénarios de bac à sable" />}

      <SandboxConsole scenarios={scenarios.ok ? scenarios.data : []} />
    </div>
  );
}
