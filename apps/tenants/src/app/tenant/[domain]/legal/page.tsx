import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getMainAppUrl } from '@qoe/config';

interface PageProps {
  params: Promise<{ domain: string }>;
}

// Les documents légaux (conditions, confidentialité, cookies) sont ceux de la
// plateforme qoefi, pas ceux de la publication : on renvoie vers l'app
// principale pour qu'il n'existe qu'une seule version de référence.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TenantLegalRedirect({ params }: PageProps) {
  const { domain } = await params;
  void domain;

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';

  redirect(`${getMainAppUrl(host)}/legal`);
}
