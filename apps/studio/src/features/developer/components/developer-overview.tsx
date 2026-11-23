import Link from 'next/link';
import { Key, Shield, Webhook } from 'lucide-react';
import { StudioRow, StudioRowList, StudioSection } from '@/components/studio-page';
import { DeveloperAccessState, DEVELOPER_ACTION_CLASS } from './developer-access-state';
import { DeveloperRequestForm } from './developer-request-form';
import { DeveloperShell } from './developer-shell';
import { hasDeveloperGrant, type DeveloperAccess, type DeveloperWorkspace } from '../types';
import { t } from '@lingui/core/macro';

export function DeveloperOverview({
  access,
  keyCount,
  workspace,
}: {
  access: DeveloperAccess;
  keyCount: number;
  workspace: DeveloperWorkspace;
}) {
  const canRequest =
    access.status === 'none' || access.status === 'rejected' || access.status === 'revoked';
  const keyLabel = `${keyCount} clé${keyCount > 1 ? 's' : ''}`;

  return (
    <DeveloperShell
      access={access}
      description={`Clés, webhooks et applications OAuth de ${workspace.name}.`}
    >
      <DeveloperAccessState
        access={access}
        action={
          canRequest ? (
            <a href="#demande" className={DEVELOPER_ACTION_CLASS}>
              {access.status === 'none' ? t`Demander l'accès` : t`Soumettre une nouvelle demande`}
            </a>
          ) : access.status === 'approved' ? (
            <Link href="/developer/keys" className={DEVELOPER_ACTION_CLASS}>
              {t`Gérer les clés`}
            </Link>
          ) : null
        }
      />

      {canRequest ? <DeveloperRequestForm rejected={access.status === 'rejected'} /> : null}

      {access.status === 'approved' ? (
        <StudioSection title={t`Intégrations`} icon={Key}>
          <StudioRowList>
            <StudioRow
              title={t`Clés d’API`}
              description={t`Créez, rotatez et révoquez les secrets de vos environnements.`}
            >
              <Link
                href="/developer/keys"
                className="text-xs font-semibold text-primary hover:underline"
              >
                {keyLabel} {t`· Gérer`}
              </Link>
            </StudioRow>
            <StudioRow
              title={t`Webhooks`}
              description={t`Recevez les événements de publication sur votre serveur.`}
            >
              <Link
                href="/developer/webhooks"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Webhook className="size-3.5" />
                {hasDeveloperGrant(access, 'webhooks') ? t`Gérer` : t`Permission non accordée`}
              </Link>
            </StudioRow>
            <StudioRow
              title={t`Applications OAuth`}
              description={t`Proposez « Se connecter avec qoefi » à vos utilisateurs.`}
            >
              <Link
                href="/developer/oauth"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
              >
                <Shield className="size-3.5" />
                {hasDeveloperGrant(access, 'oauth') ? t`Gérer` : t`Permission non accordée`}
              </Link>
            </StudioRow>
          </StudioRowList>
        </StudioSection>
      ) : null}
    </DeveloperShell>
  );
}
