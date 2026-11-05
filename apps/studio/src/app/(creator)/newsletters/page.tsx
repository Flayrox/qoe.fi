// =====================================================================
// 📬 Page Newsletters — Hub de configuration & d'envoi
// =====================================================================
// 1. Configuration de diffusion & identité d'expéditeur (nom, logo, footer).
// 2. Message direct (Broadcast réservé aux abonnés PRO).
// 3. Historique & métriques des campagnes envoyées.

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { listNewslettersAction, NewsletterIssue } from './actions';
import { getEmailSettingsAction, type PublicationEmailSettings } from '@/features/settings/actions';
import { NewsletterClient } from './NewsletterClient';

export default async function NewslettersPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const workspace = await getActiveWorkspace(user.id);
  const [newslettersRes, emailSettingsRes] = await Promise.all([
    listNewslettersAction(),
    getEmailSettingsAction(workspace.publicationId).catch(() => null),
  ]);

  const items: NewsletterIssue[] = newslettersRes.success ? newslettersRes.items : [];
  const emailSettings: PublicationEmailSettings | null = emailSettingsRes
    ? emailSettingsRes.emailSettings
    : null;
  const emailPro = Boolean(emailSettingsRes?.emailPro);
  const publicationName = emailSettingsRes?.publicationName || workspace.name || 'Votre média';

  return (
    <NewsletterClient
      initialIssues={items}
      publicationId={workspace.publicationId}
      publicationName={publicationName}
      initialEmailSettings={emailSettings}
      emailPro={emailPro}
      locales={emailSettingsRes?.locales ?? ['fr', 'en']}
      accentColor={emailSettingsRes?.accentColor}
      logoUrl={emailSettingsRes?.logoUrl}
    />
  );
}
