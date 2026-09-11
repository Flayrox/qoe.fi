import Link from 'next/link';
import { getLanguage } from '@qoe/i18n/server';
import { fetchLegalDocuments } from '@qoe/sdk/actions/legal';
import { CookiePreferencesButton } from '@qoe/ui';

// =====================================================================
// ⚖️ LegalFooterLinks — accès permanent aux pages légales
// =====================================================================
// L'information doit être « facilement accessible » (art. 12 RGPD,
// art. 6 LCEN) : les documents restent liés depuis chaque pied de page,
// avec une porte de sortie pour changer d'avis sur les cookies.
// =====================================================================

export async function LegalFooterLinks({ className }: { className?: string }) {
  const locale = await getLanguage();

  let documents: Awaited<ReturnType<typeof fetchLegalDocuments>> = [];
  try {
    documents = await fetchLegalDocuments(locale);
  } catch {
    // Un pied de page ne doit jamais casser la page : on masque juste les liens.
    return null;
  }

  if (documents.length === 0) return null;

  return (
    <nav className={className ?? 'flex flex-wrap items-center justify-center gap-x-5 gap-y-2'}>
      {documents.map((doc) => (
        <Link
          key={doc.id}
          href={`/legal/${doc.slug}`}
          className="text-sm text-muted-foreground transition-colors hover:text-[var(--tenant-accent)]"
        >
          {doc.title}
        </Link>
      ))}
      <CookiePreferencesButton
        label="Gérer mes cookies"
        className="text-sm text-muted-foreground underline transition-colors hover:text-[var(--tenant-accent)]"
      />
    </nav>
  );
}
