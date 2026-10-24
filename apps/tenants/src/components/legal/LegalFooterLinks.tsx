import { headers } from 'next/headers';
import { getLanguage } from '@qoe/i18n/server';
import { fetchLegalDocuments } from '@qoe/sdk/actions/legal';
import { getLegalDocumentUrl } from '@qoe/config';
import { CookiePreferencesButton } from '@qoe/ui';

// =====================================================================
// ⚖️ LegalFooterLinks — accès permanent aux pages légales
// =====================================================================
// L'information doit être « facilement accessible » (art. 12 RGPD,
// art. 6 LCEN) : les documents restent liés depuis chaque pied de page,
// avec une porte de sortie pour changer d'avis sur les cookies.
//
// Ces documents sont ceux de la plateforme, pas ceux de la publication :
// ils vivent uniquement sur la vitrine publique (apps/hi) et les liens
// ouvrent donc cette dernière, jamais une copie locale.
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

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';

  return (
    <nav className={className ?? 'flex flex-wrap items-center justify-center gap-x-5 gap-y-2'}>
      {documents.map((doc) => (
        <a
          key={doc.id}
          href={getLegalDocumentUrl(doc.slug, host)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground transition-colors hover:text-[var(--tenant-accent)]"
        >
          {doc.title}
        </a>
      ))}
      <CookiePreferencesButton
        label="Gérer mes cookies"
        className="text-sm text-muted-foreground underline transition-colors hover:text-[var(--tenant-accent)]"
      />
    </nav>
  );
}
