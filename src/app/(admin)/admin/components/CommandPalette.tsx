"use client";

import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { Users, Activity, Settings2, LayoutTemplate } from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/20 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <div 
        className="fixed inset-0" 
        onClick={() => setOpen(false)}
      />
      <Command 
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-neutral-200 overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="px-4 border-b border-neutral-100 flex items-center">
          <Command.Input 
            autoFocus
            placeholder="Type a command or search..." 
            className="w-full h-14 bg-transparent outline-none placeholder:text-neutral-400 text-lg font-medium text-neutral-900"
          />
        </div>
        <Command.List className="max-h-[400px] overflow-y-auto p-2 scroll-smooth">
          <Command.Empty className="py-12 text-center text-neutral-500 text-sm font-medium">
            No results found.
          </Command.Empty>

          <Command.Group heading="Navigation" className="px-2 py-3 text-xs font-bold text-neutral-400 uppercase tracking-wider">
            <Command.Item 
              onSelect={() => { router.push("/admin"); setOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 mt-1 rounded-xl text-neutral-600 aria-selected:bg-neutral-100 aria-selected:text-neutral-900 cursor-pointer text-sm font-medium transition-colors"
            >
              <Activity className="w-4 h-4 opacity-70" /> Overview
            </Command.Item>
            <Command.Item 
              onSelect={() => { router.push("/admin/users"); setOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 mt-1 rounded-xl text-neutral-600 aria-selected:bg-neutral-100 aria-selected:text-neutral-900 cursor-pointer text-sm font-medium transition-colors"
            >
              <Users className="w-4 h-4 opacity-70" /> Users & Modération
            </Command.Item>
            <Command.Item 
              onSelect={() => { router.push("/admin/config"); setOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 mt-1 rounded-xl text-neutral-600 aria-selected:bg-neutral-100 aria-selected:text-neutral-900 cursor-pointer text-sm font-medium transition-colors"
            >
              <Settings2 className="w-4 h-4 opacity-70" /> Feature Flags
            </Command.Item>
            <Command.Item 
              onSelect={() => { router.push("/admin/frontend"); setOpen(false); }}
              className="flex items-center gap-3 px-4 py-3 mt-1 rounded-xl text-neutral-600 aria-selected:bg-neutral-100 aria-selected:text-neutral-900 cursor-pointer text-sm font-medium transition-colors"
            >
              <LayoutTemplate className="w-4 h-4 opacity-70" /> Frontend & UI
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}