// =====================================================================
// ⛔ AccessDenied — le refus EXPLICITE de la console
// =====================================================================
// Une redirection silencieuse laisse croire à une panne ; un « 403 » nu ne dit
// pas quoi demander. Cet écran nomme la capacité manquante, le domaine et les
// rôles réellement détenus — de quoi demander la bonne attribution, à la bonne
// personne, sans lire les logs.
// =====================================================================

import Link from 'next/link';
import {
  ADMIN_CAPABILITY_DOMAINS,
  ADMIN_DOMAIN_LABELS,
  type AdminCapability,
} from '@/lib/admin-console';

export interface AccessDeniedProps {
  /** Capacités absentes qui motivent le refus (vide = refus global). */
  missing?: readonly string[];
  /** Rôles détenus par la personne (pour ne pas la laisser sans piste). */
  roles?: readonly string[];
  /** Capacités effectivement détenues. */
  capabilities?: readonly AdminCapability[];
  /** Écran visé, si connu (« /admin/audit »). */
  screen?: string;
}

/** Libellé lisible d'une capacité : « admin.audit.read » → « admin.audit.read (Pilotage) ». */
function describeCapability(capability: string): string {
  const domain = ADMIN_CAPABILITY_DOMAINS[capability as AdminCapability];
  return domain ? `${capability} (${ADMIN_DOMAIN_LABELS[domain]})` : capability;
}

export function AccessDenied({
  missing = [],
  roles = [],
  capabilities = [],
  screen,
}: AccessDeniedProps) {
  return (
    <section
      data-testid="admin-access-denied"
      className="mx-auto flex max-w-2xl flex-col gap-6 py-16"
    >
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Accès refusé
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">
          {screen
            ? `L’écran ${screen} demande une capacité que vous ne détenez pas.`
            : 'Votre compte n’ouvre aucun écran de la console.'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Le serveur reste l’autorité : cette page ne fait qu’expliquer une décision déjà prise par
          le garde de capacités.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-muted/40 p-6">
        <h2 className="text-sm font-semibold">Il vous manque</h2>
        {missing.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2" data-testid="admin-access-denied-missing">
            {missing.map((capability) => (
              <li key={capability} className="font-mono text-xs text-foreground">
                {describeCapability(capability)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-foreground" data-testid="admin-access-denied-missing">
            aucune capacité de console — un rôle doit vous être attribué pour ouvrir le moindre
            écran.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Vos rôles
          </h2>
          <p className="mt-2 text-sm">
            {roles.length > 0 ? roles.join(', ') : 'aucun rôle attribué'}
          </p>
        </div>
        <div className="rounded-2xl border border-border p-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Vos capacités
          </h2>
          <p className="mt-2 text-sm">
            {capabilities.length > 0 ? `${capabilities.length} capacité(s)` : 'aucune capacité'}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Demandez l’attribution depuis l’écran « Accès staff » (capacité&nbsp;
        <span className="font-mono">admin.access.grant</span>) à une personne qui la détient : le
        motif de l’attribution est enregistré.{' '}
        <Link href="/admin" className="underline">
          Revenir à l’accueil
        </Link>
        .
      </p>
    </section>
  );
}
