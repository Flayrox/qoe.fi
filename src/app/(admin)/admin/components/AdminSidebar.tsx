"use client";

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

const NAV_ITEMS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users & Modération" },
  { href: "/admin/config", label: "Feature Flags" },
  { href: "/admin/frontend", label: "Frontend & UI" },
]

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-[260px] lg:w-[300px] flex flex-col shrink-0 bg-white rounded-[32px] md:rounded-[40px] text-neutral-900 shadow-2xl p-8 md:p-8 lg:p-10 sticky top-0 md:top-6 lg:top-8 h-screen md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden ring-1 ring-neutral-200/50">
      
      <nav className="flex-1 flex flex-col gap-3 mt-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center px-4 py-3 rounded-2xl transition-all duration-300",
                isActive
                  ? "bg-[#EE4B2B] text-white shadow-md shadow-[#EE4B2B]/20"
                  : "text-neutral-600 hover:bg-[#EE4B2B] hover:text-white"
              )}
            >
              <span className="text-base font-medium tracking-tight">
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-16 flex flex-col gap-8">
        <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">System</span>
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Operational
            </div>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/docs" className="text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
            API Documentation
          </Link>
          <Link href="/support" className="text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors">
            Support
          </Link>
        </div>
      </div>
    </aside>
  )
}
