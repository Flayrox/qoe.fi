import { ReactNode } from 'react';
import { createClient } from '@qoe/supabase/server';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { AdminSidebar } from './components/AdminSidebar';
import { CommandPalette } from './components/CommandPalette';
import { AdminHeader } from './components/AdminHeader';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const headersList = await headers();
  const host = headersList.get('host') || '';

  if (!authUser) {
    const isLocal =
      host.includes('localhost') ||
      host.includes('qoe.test') ||
      host.includes('lvh.me') ||
      process.env.NODE_ENV === 'development';
    const mainDomain = host.includes('qoe.test') ? 'qoe.test' : 'lvh.me';
    const loginUrl = isLocal
      ? `http://${mainDomain}:3010/login?redirect=${encodeURIComponent(`http://${host}/admin`)}`
      : 'https://qoe.fi/login';
    redirect(loginUrl);
  }

  // ⚡ Go : le backend vérifie le rôle superadmin (403 sinon).
  let user: {
    id: string;
    name: string | null;
    email: string;
    username: string | null;
    role: string;
  } | null = null;

  try {
    await goFetch('/v1/admin/dashboard');
    // Le user Supabase est superadmin (vérifié par le Go) — shape réduite
    // pour l'AdminHeader (id + email + name + username + role).
    user = {
      id: authUser.id,
      name: authUser.user_metadata?.name ?? null,
      email: authUser.email ?? '',
      username: authUser.user_metadata?.username ?? authUser.user_metadata?.user_name ?? null,
      role: 'superadmin',
    };
  } catch {
    // Non-superadmin ou erreur Go → refus (pas de fuite).
  }

  // Security Check: Only superadmins
  if (!user) {
    const isLocal =
      host.includes('localhost') ||
      host.includes('qoe.test') ||
      host.includes('lvh.me') ||
      process.env.NODE_ENV === 'development';
    const mainDomain = host.includes('qoe.test') ? 'qoe.test' : 'lvh.me';
    const homeUrl = isLocal ? `http://${mainDomain}:3010/home` : 'https://qoe.fi/home';
    redirect(homeUrl);
  }

  return (
    <div className="min-h-screen bg-[#EE4B2B] text-white flex flex-col md:flex-row p-0 md:p-6 lg:p-8 gap-0 md:gap-6 font-sans antialiased selection:bg-[#EE4B2B]/20 selection:text-foreground">
      <AdminSidebar />

      <main className="flex-1 bg-white rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative text-foreground ring-1 ring-white/20">
        <AdminHeader user={user} />

        <div className="flex-1 overflow-y-auto p-8 md:p-12 lg:p-16 xl:p-24 bg-white relative">
          {children}
        </div>
      </main>

      <CommandPalette />
    </div>
  );
}
