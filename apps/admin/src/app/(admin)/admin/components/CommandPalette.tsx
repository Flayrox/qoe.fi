'use client';

import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white/40 backdrop-blur-md flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0" onClick={() => setOpen(false)} />
      <Command
        className="w-full max-w-xl bg-white/90 backdrop-blur-xl rounded-2xl shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_16px_32px_rgba(0,0,0,0.1)] overflow-hidden relative z-10 animate-in fade-in zoom-in-[0.98] duration-200 ease-[0.16,1,0.3,1] antialiased font-sans"
        style={{
          boxShadow: '0 0 0 1px rgba(0,0,0,0.06), 0 16px 32px -8px rgba(0,0,0,0.08)',
        }}
      >
        <div className="flex items-center px-4 border-b border-border/80">
          <Command.Input
            autoFocus
            placeholder="Type a command or search..."
            className="w-full h-14 bg-transparent outline-none placeholder:text-muted-foreground text-lg font-light text-foreground"
          />
        </div>
        <Command.List className="max-h-[300px] overflow-y-auto p-2 scroll-smooth">
          <Command.Empty className="py-8 text-center text-muted-foreground text-sm font-light">
            No results found.
          </Command.Empty>

          <Command.Group
            heading="Navigation"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
          >
            <Command.Item
              onSelect={() => {
                router.push('/admin');
                setOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground aria-selected:bg-muted/80 aria-selected:text-foreground cursor-pointer text-sm font-medium transition-colors"
            >
              Overview
            </Command.Item>
            <Command.Item
              onSelect={() => {
                router.push('/admin/users');
                setOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground aria-selected:bg-muted/80 aria-selected:text-foreground cursor-pointer text-sm font-medium transition-colors"
            >
              Users & Modération
            </Command.Item>
            <Command.Item
              onSelect={() => {
                router.push('/admin/config');
                setOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground aria-selected:bg-muted/80 aria-selected:text-foreground cursor-pointer text-sm font-medium transition-colors"
            >
              Feature Flags
            </Command.Item>
            <Command.Item
              onSelect={() => {
                router.push('/admin/frontend');
                setOpen(false);
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-muted-foreground aria-selected:bg-muted/80 aria-selected:text-foreground cursor-pointer text-sm font-medium transition-colors"
            >
              Frontend & UI
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
