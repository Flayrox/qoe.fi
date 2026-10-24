import type { Metadata } from 'next';
import { ExitCard } from '@qoe/ui';

interface PageProps {
  searchParams: Promise<{ url?: string }>;
}

export const metadata: Metadata = {
  title: 'Redirection externe | Qoefi',
  description: 'Avertissement avant redirection vers un site externe.',
  robots: { index: false, follow: false },
};

export default async function CoreExitPage({ searchParams }: PageProps) {
  const { url: rawTargetUrl } = await searchParams;

  return (
    <div className="container mx-auto px-4 py-8">
      <ExitCard targetUrl={rawTargetUrl} publicationName="Qoefi" onBackUrl="/home" />
    </div>
  );
}
