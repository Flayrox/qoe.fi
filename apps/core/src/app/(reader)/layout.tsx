import React from 'react';
import { createClient } from '@qoe/supabase/server';
import { getRequestDbUser } from '../../lib/cached-queries';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ReaderNavOverlay } from '@/components/layout/ReaderNavOverlay';
import { MainContentWrapper } from '@/components/layout/MainContentWrapper';
import { Toaster } from '@qoe/ui/toast';
import { getLanguage } from '@qoe/i18n/server';
import { fetchPendingAcceptances } from '@qoe/sdk/actions/legal';
import { LegalConsentGate, type ConsentItem } from '@qoe/ui';
import { logout } from '@/app/login/actions';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dbUser = user ? await getRequestDbUser(user.id) : null;
  const locale = await getLanguage();

  // Consentements légaux manquants (une nouvelle version d'un document
  // « à accepter » redéclenche la demande). Vide pour un visiteur anonyme.
  let pendingConsents: ConsentItem[] = [];
  if (user) {
    pendingConsents = (await fetchPendingAcceptances(locale)).map((item) => ({
      slug: item.slug,
      title: item.title,
      version: item.version,
    }));
  }

  // 🛡️ Garde Onboarding : Tout compte lecteur connecté qui n'a pas terminé son onboarding
  // est immédiatement redirigé vers /onboarding (sauf s'il y est déjà).
  // Note: /onboarding est dans (reader), son layout est ce fichier.
  // Une redirection ici quand on est déjà sur /onboarding provoquait une boucle 307 infinie.

  const userEmail = dbUser?.email || user?.email || '';
  const userName = dbUser?.name || dbUser?.username || 'Lecteur';
  const userAvatar = dbUser?.logoUrl || null;

  return (
    <div className="relative min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-foreground selection:text-background">
      <AppSidebar
        userName={userName}
        userUsername={dbUser?.username}
        userEmail={userEmail}
        userAvatar={userAvatar}
        userRole={dbUser?.role}
        onLogout={logout}
      />
      <ReaderNavOverlay
        userName={userName}
        userUsername={dbUser?.username}
        userEmail={userEmail}
        userAvatar={userAvatar}
        userRole={dbUser?.role}
        onLogout={logout}
      />
      <MainContentWrapper>{children}</MainContentWrapper>
      <LegalConsentGate pending={pendingConsents} locale={locale} />
      <Toaster />
    </div>
  );
}
