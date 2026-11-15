// =====================================================================
// ⬇️ /export — portabilité de la publication
// =====================================================================
// Le contrat de traitement promet un export complet ; cette page le rend
// visible. L'archive est produite par Go (articles + HTML d'origine +
// abonnés CSV + manifeste) et relayée par /api/export.
// =====================================================================

import { redirect } from 'next/navigation';
import { requireUser } from '@qoe/auth/current-user';
import { getActiveWorkspace } from '@/lib/active-workspace';
import { StudioHeader, StudioPage } from '@/components/studio-page';

export const metadata = {
  title: 'Export | qoefi Studio',
  description: 'Télécharger l’archive complète de votre publication.',
};

export default async function ExportPage() {
  const user = await requireUser();
  if (!user) {
    redirect('/login');
  }
  const workspace = await getActiveWorkspace(user.id);

  return (
    <StudioPage>
      <StudioHeader
        title="Export & portabilité"
        description="Vos écrits et votre audience, dans des formats ouverts. Aucun verrou."
      />

      <section className="max-w-2xl rounded-2xl border border-border/60 bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Ce que contient l’archive</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">articles/</strong> — chaque écrit en Markdown
            (front-matter titre/slug/état/dates) et son HTML d’origine, sans perte.
          </li>
          <li>
            <strong className="text-foreground">subscribers.csv</strong> — email, état, premium, LTV
            et date d’inscription de votre audience.
          </li>
          <li>
            <strong className="text-foreground">manifest.json</strong> — format, date d’export et
            compteurs, pour vérifier l’intégrité.
          </li>
        </ul>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="/api/export"
            download
            className="inline-flex items-center justify-center rounded-xl bg-foreground px-4 py-2 text-xs font-bold text-background transition-opacity hover:opacity-90"
          >
            Télécharger l’archive
          </a>
          <span className="text-[11px] text-muted-foreground">Publication : {workspace.name}</span>
        </div>
      </section>
    </StudioPage>
  );
}
