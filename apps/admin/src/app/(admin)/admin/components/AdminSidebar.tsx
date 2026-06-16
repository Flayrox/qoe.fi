"use client";

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@qoe/utils"
import { motion } from "framer-motion"

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users & Modération" },
  { href: "/admin/config", label: "Feature Flags" },
  { href: "/admin/frontend", label: "Frontend & UI" },
  { href: "/admin/widgets", label: "Widgets & Tendances" },
]

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-[260px] lg:w-[300px] flex flex-col shrink-0 p-8 md:p-10 lg:p-12 sticky top-0 md:top-6 lg:top-8 h-screen md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden">
      <div className="mb-16">
        <Link href="/" className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity">
           <span className="font-bold text-xl tracking-tight">qoe.fi</span>
        </Link>
      </div>
      
      <nav className="flex-1 flex flex-col gap-5 mt-8">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={(item.href as any) as any}
              className={cn(
                "relative group flex items-center transition-colors duration-300",
                isActive ? "text-white" : "text-white/50 hover:text-white/80"
              )}
            >
              <span className="text-base font-medium tracking-tight">
                {item.label}
              </span>
              
              {isActive && (
                <motion.div
                  layoutId="active-nav-indicator"
                  className="absolute -left-5 w-1 h-1 bg-white rounded-full"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-16 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">System</span>
            <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                Operational
            </div>
        </div>
        <div className="flex flex-col gap-2">
            <Link href={("/docs" as any) as any} className="text-xs font-medium text-white/40 hover:text-white/80 transition-colors">
              API Documentation
            </Link>
            <Link href="mailto:support@qoe.fi" className="text-xs font-medium text-white/40 hover:text-white/80 transition-colors">
              Support
            </Link>
        </div>
      </div>
    </aside>
  )
}
