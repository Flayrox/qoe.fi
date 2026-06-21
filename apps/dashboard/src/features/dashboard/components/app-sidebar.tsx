import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Logo } from "@qoe/ui"
import { createClient } from "@qoe/supabase/server"
import { prisma } from "@qoe/db/client"
import { logout } from "@/app/login/actions"
import { getTranslate } from "@qoe/i18n/server"
import { SidebarMenuClient, type IconName } from "./SidebarMenuClient"

export async function AppSidebar() {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  const user = authUser
    ? await prisma.user.findUnique({
        where: { id: authUser.id },
      })
    : null

  const userEmail = user?.email || authUser?.email || "hello@qoe.fi"
  const userName = user?.name || "Creator"
  const userFallback = userName.slice(0, 2).toUpperCase()

  const t = await getTranslate()

  const items = [
    {
      title: t('sidebar.nav_overview'),
      url: "/",
      iconName: "Home" as IconName,
    },
    {
      title: t('sidebar.nav_articles'),
      url: "/articles",
      iconName: "FileText" as IconName,
    },
    {
      title: t('sidebar.nav_newsletters'),
      url: "/newsletters",
      iconName: "Mail" as IconName,
    },
    {
      title: t('sidebar.nav_audience'),
      url: "/audience",
      iconName: "Users" as IconName,
    },
    {
      title: t('sidebar.nav_analytics'),
      url: "/analytics",
      iconName: "PieChart" as IconName,
    },
    {
      title: t('sidebar.nav_settings'),
      url: "/settings",
      iconName: "Settings" as IconName,
    },
  ]

  return (
    <Sidebar variant="inset" className="border-r border-border/50">
      <SidebarHeader className="p-4 flex flex-row items-center gap-2 select-none">
        <Logo className="h-4.5 w-auto" fillColor="currentColor" />
        <span className="font-sans text-sm font-semibold tracking-tight text-foreground">qoe.fi</span>
        <span className="text-[9px] uppercase tracking-wider bg-zinc-100 text-zinc-500 font-black px-1.5 py-0.5 rounded dark:bg-zinc-800 dark:text-zinc-400">
          Console
        </span>
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-black tracking-wider text-muted-foreground/60 px-3 mt-4 mb-2">
            {t('sidebar.platform')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuClient items={items} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md" />}>
                <Avatar className="h-8 w-8 rounded-md border border-border/50">
                  <AvatarFallback className="rounded-md font-sans text-xs bg-zinc-100 text-zinc-950 font-bold dark:bg-zinc-800 dark:text-zinc-50">{userFallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight font-sans">
                  <span className="truncate font-semibold text-foreground text-xs leading-none">{userName}</span>
                  <span className="truncate text-[10px] text-muted-foreground mt-0.5 leading-none">{userEmail}</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-white/95 backdrop-blur-xl border border-border/50 shadow-lg p-1.5 dark:bg-zinc-900/95" side="top" align="end" sideOffset={8}>
                <DropdownMenuItem className="text-xs font-medium font-sans cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded px-2.5 py-1.5">
                  {t('sidebar.user_profile')}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs font-medium font-sans cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded px-2.5 py-1.5">
                  {t('sidebar.user_billing')}
                </DropdownMenuItem>
                <DropdownMenuItem render={<form action={logout} className="w-full" />} className="p-0">
                  <button type="submit" className="w-full text-left cursor-pointer bg-transparent border-0 px-2.5 py-1.5 text-red-500 font-sans text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/20 rounded">
                    {t('sidebar.user_logout')}
                  </button>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
