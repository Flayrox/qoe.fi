import { Home, Settings, FileText, Users, Mail, PieChart } from 'lucide-react';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from '@qoe/ui/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@qoe/ui/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@qoe/ui/ui/avatar';

import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { logout } from '@/app/login/actions';
import { t } from '@lingui/core/macro';

export async function AppSidebar() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await prisma.user.findUnique({
        where: { id: authUser.id },
      })
    : null;

  const userEmail = user?.email || authUser?.email || 'hello@qoe.fi';
  const userName = user?.name || 'Creator';
  const userFallback = userName.slice(0, 2).toUpperCase();

  const items = [
    {
      title: t`Vue d'ensemble`,
      url: '/dashboard',
      icon: Home,
    },
    {
      title: t`Articles`,
      url: '/dashboard/articles',
      icon: FileText,
    },
    {
      title: t`Newsletters`,
      url: '/dashboard/newsletters',
      icon: Mail,
    },
    {
      title: t`Audience`,
      url: '/dashboard/audience',
      icon: Users,
    },
    {
      title: t`Analyses`,
      url: '/dashboard/analytics',
      icon: PieChart,
    },
    {
      title: t`Paramètres`,
      url: '/dashboard/settings',
      icon: Settings,
    },
  ];

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <div className="h-6 w-6 rounded-sm bg-primary text-primary-foreground flex items-center justify-center text-xs">
            Q
          </div>
          <span className="font-sans">qoe.fi</span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground mt-4">
            {t`Plateforme`}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton tooltip={item.title} render={<a href={item.url} />}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  />
                }
              >
                <Avatar className="h-8 w-8 rounded-md">
                  <AvatarFallback className="rounded-md">{userFallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{userName}</span>
                  <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem>{t`Profil`}</DropdownMenuItem>
                <DropdownMenuItem>{t`Facturation`}</DropdownMenuItem>
                <DropdownMenuItem render={<form action={logout} className="w-full" />}>
                  <button
                    type="submit"
                    className="w-full text-left cursor-pointer bg-transparent border-0 p-0 text-foreground font-sans text-sm"
                  >
                    {t`Se déconnecter`}
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
