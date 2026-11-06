import { ReactNode } from 'react';
import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { navItemForPath } from '@/lib/admin-console';
import { getAdminWorkQueue } from '@/lib/admin-data';
import { AdminSidebar } from './components/AdminSidebar';
import { CommandPalette } from './components/CommandPalette';
import { AdminHeader } from './components/AdminHeader';
import { AccessDenied } from './components/AccessDenied';
import { StepUpGate } from '@/components/security/step-up';

// L'identité d'accès est résolue à chaque requête : une attribution retirée doit
// fermer la console au rechargement suivant, sans redéploiement.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const headersList = await headers();
  const host = headersList.get('host') || '';

  const isLocal =
    host.includes('localhost') ||
    host.includes('qoe.test') ||
    host.includes('lvh.me') ||
    process.env.NODE_ENV === 'development';
  const mainDomain = host.includes('qoe.test') ? 'qoe.test' : 'lvh.me';

  if (!authUser) {
    const loginUrl = isLocal
      ? `http://${mainDomain}:3010/login?redirect=${encodeURIComponent(`http://${host}/admin`)}`
      : `https://qoe.fi/login?redirect=${encodeURIComponent(`https://${host}/admin`)}`;
    redirect(loginUrl);
  }

  // L'accès réel vient du serveur (`GET /v1/admin/me`) : rôles attribués et
  // capacités résolues, échéances appliquées. La console n'est plus binaire —
  // un compte `analyst`, `legal` ou `support` ouvre les écrans qu'il détient.
  const identity = await getAdminIdentity();
  if (!identity) {
    // Session Supabase sans accès lisible côté Go (promotion absente, service
    // indisponible) : refus, pas de fuite. Le chemin de sortie est explicite.
    const homeUrl = isLocal ? `http://${mainDomain}:3010/home` : 'https://qoe.fi/home';
    redirect(homeUrl);
  }

  const user = {
    id: authUser.id,
    name: authUser.user_metadata?.name ?? null,
    email: authUser.email ?? '',
    username: authUser.user_metadata?.username ?? authUser.user_metadata?.user_name ?? null,
  };

  // Garde centralisé : chaque écran de navigation déclare sa capacité, et le
  // layout refuse avant de charger la page. Les pages conservent leur propre
  // requireCapability en défense en profondeur.
  const pathname = headersList.get('x-admin-pathname') || '';
  const navItem = navItemForPath(pathname);
  if (navItem) requireCapability(identity, navItem.capability);

  const opensNothing = identity.capabilities.length === 0;

  // Compteurs de la navigation et dossiers de la palette : une seule lecture
  // pour toute la console. Un rôle sans accès aux files obtient un objet vide
  // (getAdminWorkQueue ne lève jamais), donc la coquille reste servie.
  const work = opensNothing
    ? { items: [], entries: [], assignedToMe: 0, breached: 0 }
    : await getAdminWorkQueue();
  const queueCounts: Record<string, number> = {};
  for (const item of work.items) queueCounts[item.href] = item.count;
  const dossiers = work.entries.slice(0, 40).map((entry) => ({
    id: entry.id,
    queue: entry.queue,
    title: entry.title,
    status: entry.status,
    href: entry.href,
    slaState: entry.slaState,
  }));

  return (
    <div className="flex min-h-screen flex-col bg-muted/25 font-sans text-foreground antialiased md:h-screen md:flex-row md:overflow-hidden">
      <AdminSidebar identity={identity} queueCounts={queueCounts} />

      <main className="flex min-w-0 flex-1 flex-col bg-background md:h-screen">
        <AdminHeader
          user={user}
          roles={identity.roles}
          environment={isLocal ? 'local' : 'production'}
        />

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {opensNothing ? (
            <AccessDenied roles={identity.roles} capabilities={identity.capabilities} />
          ) : (
            children
          )}
        </div>
      </main>

      <CommandPalette
        capabilities={identity.capabilities}
        roles={identity.roles}
        dossiers={dossiers}
      />

      {/*
        Vérification d'un facteur fort (Phase 3) : monté UNE fois pour toute la
        console. Quand le garde refuse un acte par manque de preuve récente
        (`needs_step_up`) ou par méthode insuffisante (`deny_weak_auth`),
        l'écran propose la vérification ici, puis rejoue l'action — sans
        quitter la page ni ressaisir le formulaire.
      */}
      <StepUpGate />
    </div>
  );
}
