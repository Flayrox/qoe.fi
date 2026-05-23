"use client"

import { Shield, Search } from "lucide-react"
import { motion } from "framer-motion"
import { User } from "@prisma/client"

interface AdminHeaderProps {
  user: User | null
}

export function AdminHeader({ user }: AdminHeaderProps) {
  return (
    <header className="absolute top-8 right-8 md:top-12 md:right-12 z-10 flex items-center justify-end w-full pointer-events-none">
      <div className="flex items-center gap-4 pointer-events-auto bg-white/60 backdrop-blur-xl border border-neutral-200/50 p-1.5 rounded-full shadow-[0_8px_16px_-4px_rgba(0,0,0,0.05)]">
        <motion.div
          whileHover={{ scale: 0.98 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-full hover:bg-neutral-100/80 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-900 transition-colors" />
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-900 transition-colors">Search</span>
            <kbd className="font-mono text-[10px] bg-white border border-neutral-200 text-neutral-400 px-1.5 py-0.5 rounded shadow-sm">⌘K</kbd>
          </div>
        </motion.div>
        
        <div className="w-px h-5 bg-neutral-200/60 hidden sm:block" />
        
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="cursor-pointer pr-1"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-b from-neutral-800 to-neutral-900 shadow-inner text-white flex items-center justify-center font-sans font-medium text-xs tracking-tight ring-1 ring-black/10">
            {user?.username?.charAt(0).toUpperCase() || "A"}
          </div>
        </motion.div>
      </div>
    </header>
  )
}
