// =====================================================================
// 📬 Page Newsletters — envoi d'emails aux abonnés (feature créateur)
// =====================================================================
// Go en primaire : GET/POST /v1/newsletters (module Go newsletters,
// réservé créateur). Le worker asynq distribue l'issue aux abonnés
// receiveArticles via l'EmailProvider (SMTP self-hosté Stalwart).

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { NewsletterClient } from './NewsletterClient';
import { listNewslettersAction, NewsletterIssue } from './actions';

export default async function NewslettersPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const res = await listNewslettersAction();
  const items: NewsletterIssue[] = res.success ? res.items : [];

  return <NewsletterClient initialIssues={items} />;
}
