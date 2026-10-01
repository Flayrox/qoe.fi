import { ReactNode } from 'react';
import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAdminIdentity } from '@/lib/admin-identity';
import { AdminSidebar } from './components/AdminSidebar';
import { CommandPalette } from './components/CommandPalette';
import { AdminHeader } from './components/AdminHeader';
import { AccessDenied } from './components/AccessDenied';

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

  const opensNothing = identity.capabilities.length === 0;

  return (
    <div className="min-h-screen bg-[#EE4B2B] text-white flex flex-col md:flex-row p-0 md:p-6 lg:p-8 gap-0 md:gap-6 font-sans antialiased selection:bg-[#EE4B2B]/20 selection:text-foreground">
      <AdminSidebar identity={identity} />

      <main className="flex-1 bg-white rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative text-foreground ring-1 ring-white/20">
        <AdminHeader user={user} roles={identity.roles} />

        <div className="flex-1 overflow-y-auto p-8 md:p-12 lg:p-16 xl:p-24 bg-white relative">
          {opensNothing ? (
            <AccessDenied roles={identity.roles} capabilities={identity.capabilities} />
          ) : (
            children
          )}
        </div>
      </main>

      <CommandPalette capabilities={identity.capabilities} roles={identity.roles} />
    </div>
  );
}
