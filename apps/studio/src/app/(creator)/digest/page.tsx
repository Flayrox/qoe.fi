// =====================================================================
// 📬 /digest — récapitulatif email de la publication
// =====================================================================
// Stocké dans `Publisher.emailSettings->'digest'`. L'aperçu est généré
// par Go avec les derniers articles publiés ; aucun email n'est envoyé
// dans ce lot.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { StudioHeader, StudioPage } from '@/components/studio-page';

import { DigestClient } from './digest-client';
import type { DigestConfig } from './actions';

export const metadata = {
  title: 'Digest | qoefi Studio',
  description: 'Programmer un récapitulatif hebdomadaire de vos articles.',
};

const DEFAULT_CONFIG: DigestConfig = {
  enabled: false,
  weekday: 1,
  hour: 9,
  maxArticles: 5,
  intro: '',
};

export default async function DigestPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }
  const workspace = await getActiveWorkspace(user.id);

  let config = DEFAULT_CONFIG;
  try {
    const res = await goFetch<{ config: DigestConfig }>(
      `/v1/creator/newsletter/digest?publisherId=${encodeURIComponent(workspace.publisherId)}`
    );
    config = res.config ?? DEFAULT_CONFIG;
  } catch {
    // API indisponible : on affiche les valeurs par défaut, l'enregistrement
    // dira honnêtement s'il échoue.
  }

  return (
    <StudioPage>
      <StudioHeader
        title="Digest"
        description="Un récapitulatif automatique des articles de la semaine, envoyé à votre audience."
      />
      <DigestClient initialConfig={config} />
    </StudioPage>
  );
}
