import { Calendar, Home, Inbox, Search, Settings, FileText, Users, Mail, PieChart } from "lucide-react"

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
} from "@/components/ui/sidebar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/db"
import { logout } from "@/app/login/actions"
import { getDictionary } from "@/lib/i18n"

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

  const dict = await getDictionary()

  const items = [
    {
      title: dict.sidebar.nav_overview,
      url: "/dashboard",
      icon: Home,
    },
    {
      title: dict.sidebar.nav_articles,
      url: "/dashboard/articles",
      icon: FileText,
    },
    {
      title: dict.sidebar.nav_newsletters,
      url: "/dashboard/newsletters",
      icon: Mail,
    },
    {
      title: dict.sidebar.nav_audience,
      url: "/dashboard/audience",
      icon: Users,
    },
    {
      title: dict.sidebar.nav_analytics,
      url: "/dashboard/analytics",
      icon: PieChart,
    },
    {
      title: dict.sidebar.nav_settings,
      url: "/dashboard/settings",
      icon: Settings,
    },
  ]

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
            {dict.sidebar.platform}
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
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" />}>
                <Avatar className="h-8 w-8 rounded-md">
                  <AvatarFallback className="rounded-md">{userFallback}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{userName}</span>
                  <span className="truncate text-xs text-muted-foreground">{userEmail}</span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg" side="top" align="end" sideOffset={4}>
                <DropdownMenuItem>
                  {dict.sidebar.user_profile}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  {dict.sidebar.user_billing}
                </DropdownMenuItem>
                <DropdownMenuItem render={<form action={logout} className="w-full" />}>
                  <button type="submit" className="w-full text-left cursor-pointer bg-transparent border-0 p-0 text-foreground font-sans text-sm">
                    {dict.sidebar.user_logout}
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
