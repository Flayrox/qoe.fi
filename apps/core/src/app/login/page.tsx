export const dynamic = 'force-dynamic';
import { Suspense } from 'react';
import { getLanguage } from '@qoe/i18n/server';
import { fetchLegalDocumentsToAccept } from '@qoe/sdk/actions/legal';
import type { ConsentDocument } from '@qoe/utils/legal-consent';
import { LoginForm } from './login-form';

function LoginFormFallback() {
  return (
    <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto h-[640px] bg-card border border-border p-8 rounded-[36px] shadow-2xl animate-pulse flex">
      <div className="w-[55%] h-full bg-muted rounded-[24px]"></div>
      <div className="w-[45%] h-full bg-[#EE4B2B]/10 rounded-[24px] ml-3"></div>
    </div>
  );
}

export default async function LoginPage() {
  // ⚖️ Documents que l'inscription doit faire accepter (CGU, confidentialité,
  // utilisation acceptable). Chargés côté serveur : le formulaire affiche la
  // version publiée au moment du rendu, et cette version part dans les
  // métadonnées du compte comme preuve.
  const locale = await getLanguage();
  let consentDocuments: ConsentDocument[] = [];
  try {
    const docs = await fetchLegalDocumentsToAccept(locale, 'all');
    consentDocuments = docs.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      version: doc.version,
      versionId: doc.versionId,
    }));
  } catch {
    // Le contenu légal peut être indisponible pendant un déploiement : une
    // inscription ne doit jamais être bloquée pour ça (le portail rattrapera).
    consentDocuments = [];
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm consentDocuments={consentDocuments} locale={locale} />
      </Suspense>
    </main>
  );
}
