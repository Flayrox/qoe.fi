import { requireUser } from '@qoe/auth/current-user';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { fetchLegalDocumentsToAccept } from '@qoe/sdk/actions/legal';
import { getLanguage } from '@qoe/i18n/server';
import type { ConsentDocument } from '@qoe/utils/legal-consent';
import { redirect } from 'next/navigation';
import { OnboardingWizard } from '@/features/onboarding/components/wizard';

export default async function OnboardingPage() {
  // Go : GET /v1/users/me — hasCompletedOnboarding + publicationId personnelle
  // (le tenant créateur).
  const user = await requireUser();
  let me: { data: { hasCompletedOnboarding: boolean; publicationId: string | null } };
  try {
    me = await goFetch<{ data: { hasCompletedOnboarding: boolean; publicationId: string | null } }>(
      '/v1/users/me'
    );
  } catch {
    me = {
      data: {
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        publicationId: null,
      },
    };
  }

  const hasTenant = Boolean(me.data.publicationId);
  // On ne reboucle vers / que si un espace créateur existe déjà. Un compte
  // 'user' (onboarding lecteur fait dans core) sans tenant doit voir le
  // wizard — sinon boucle infinie / → /onboarding → / (le layout (creator)
  // renvoie les non-créateurs ici).
  if (hasTenant) {
    redirect('/?already_onboarded=true');
  }

  // ⚖️ Ouvrir un espace créateur engage : on affiche les documents à accepter
  // (accord créateur, CGU, confidentialité…) avec la version publiée courante,
  // et l'acceptation est enregistrée comme preuve à la création de l'espace.
  const locale = await getLanguage();
  let consentDocuments: ConsentDocument[] = [];
  try {
    const docs = await fetchLegalDocumentsToAccept(locale);
    consentDocuments = docs
      .filter((doc) => doc.audience === 'all' || doc.audience === 'creators')
      .map((doc) => ({
        slug: doc.slug,
        title: doc.title,
        version: doc.version,
        versionId: doc.versionId,
      }));
  } catch {
    // Le contenu légal peut être indisponible : on ne bloque jamais la création
    // d'un espace pour ça (le portail de consentement prendra le relais).
    consentDocuments = [];
  }

  return (
    <main className="min-h-screen bg-foreground">
      <OnboardingWizard
        initialName={user.name ?? ''}
        consentDocuments={consentDocuments}
        locale={locale}
      />
    </main>
  );
}
