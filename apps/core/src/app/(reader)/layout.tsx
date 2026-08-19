import React from 'react';
import { createClient } from '@qoe/supabase/server';
import { getRequestDbUser } from '../../lib/cached-queries';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { ReaderNavOverlay } from '@/components/layout/ReaderNavOverlay';
import { MainContentWrapper } from '@/components/layout/MainContentWrapper';
import { Toaster } from '@qoe/ui/ui/sonner';
import { logout } from '@/app/login/actions';

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dbUser = user ? await getRequestDbUser(user.id) : null;

  const userEmail = dbUser?.email || user?.email || '';
  const userName = dbUser?.name || dbUser?.username || 'Lecteur';
  const userAvatar = dbUser?.logoUrl || null;

  return (
    <div className="relative min-h-screen bg-background text-foreground transition-colors duration-300 font-sans selection:bg-primary/10 selection:text-primary">
      <AppSidebar
        userName={userName}
        userEmail={userEmail}
        userAvatar={userAvatar}
        userRole={dbUser?.role}
        onLogout={logout}
      />
      <ReaderNavOverlay
        userName={userName}
        userEmail={userEmail}
        userAvatar={userAvatar}
        userRole={dbUser?.role}
        onLogout={logout}
      />
      <MainContentWrapper>{children}</MainContentWrapper>
      <Toaster />
    </div>
  );
}
