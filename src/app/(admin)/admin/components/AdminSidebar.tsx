"use client";

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Activity, Users, Settings2, LayoutTemplate, Coffee } from "lucide-react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

const NAV_ITEMS = [
  { href: "/admin", icon: Activity, label: "Overview" },
  { href: "/admin/users", icon: Users, label: "Users & Modération" },
  { href: "/admin/config", icon: Settings2, label: "Feature Flags" },
  { href: "/admin/frontend", icon: LayoutTemplate, label: "Frontend & UI" },
]

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-[260px] bg-white rounded-[36px] border border-neutral-200/60 shadow-2xl flex flex-col overflow-hidden shrink-0">
      <div className="h-[72px] flex items-center px-8 border-b border-neutral-100">
        <Link href="/" className="flex items-center gap-3">
           <Coffee className="w-5 h-5 text-[#EE4B2B]" />
           <span className="font-bold text-lg tracking-tight">qoe.fi</span>
        </Link>
      </div>
      <nav className="p-4 space-y-1.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href}
              href={item.href} 
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-200 relative group",
                isActive ? "text-[#EE4B2B]" : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
              )}
            >
              {isActive && (
                <motion.div 
                  layoutId="active-nav" 
                  className="absolute inset-0 bg-red-50 rounded-2xl" 
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <item.icon className="w-4 h-4 relative z-10" />
              <span className="relative z-10">{item.label}</span>
            </Link>
          )
        })}
      </nav>
      <div className="p-4 border-t border-neutral-100">
        <div className="px-4 py-3 bg-neutral-50 rounded-2xl flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">System Status</span>
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Operational
            </div>
        </div>
      </div>
    </aside>
  )
}
