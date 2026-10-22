import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getMainAppUrl } from '@qoe/config';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

// Les documents légaux vivent sur qoe.fi (source unique) : le sous-domaine ne
// sert plus de copie locale, il redirige vers l'app principale.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TenantLegalDocumentRedirect({ params }: PageProps) {
  const { slug } = await params;

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';

  redirect(`${getMainAppUrl(host)}/legal/${encodeURIComponent(decodeURIComponent(slug))}`);
}
