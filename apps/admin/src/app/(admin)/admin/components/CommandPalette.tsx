'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@qoe/ui/dialog';
import {
  ADMIN_CAPABILITY_DOMAINS,
  ADMIN_DOMAIN_LABELS,
  normalizeCapabilities,
  visibleNav,
  type AdminCapability,
} from '@/lib/admin-console';

// =====================================================================
// ⌘K — CommandPalette
// =====================================================================
// Elle ne propose QUE les écrans atteignables : une capacité manquante, et
// l'entrée n'existe pas dans l'index. Un écran absent vaut mieux qu'un écran
// qui répond 403 après un clic — et l'index reste la même source que la
// sidebar (lib/admin-console), donc les deux ne peuvent pas diverger.
// =====================================================================

interface CommandPaletteProps {
  capabilities: string[] | readonly string[];
  /** Conservé pour l'affichage et les futurs verbes contextuels (Phase 6). */
  roles?: readonly string[];
}

export function CommandPalette({ capabilities }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const items = useMemo(() => {
    const caps = normalizeCapabilities(capabilities as readonly string[]) as AdminCapability[];
    return visibleNav(caps);
  }, [capabilities]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg">
      <DialogContent
        showCloseButton={false}
        aria-label="Palette de commandes"
        overlayClassName="items-start pt-[15vh] bg-foreground/25 backdrop-blur-md"
        className="w-full max-w-xl p-0 gap-0 overflow-hidden bg-popover/95 backdrop-blur-xl border border-border/80 shadow-2xl"
        data-testid="admin-command-palette"
      >
        <Command className="w-full bg-transparent overflow-hidden relative z-10 antialiased font-sans">
          <div className="flex items-center px-4 border-b border-border/80">
            <Command.Input
              autoFocus
              placeholder="Aller à un écran, chercher une action…"
              className="w-full h-14 bg-transparent outline-none placeholder:text-muted-foreground text-lg font-light text-foreground"
            />
          </div>
          <Command.List className="max-h-[320px] overflow-y-auto p-2 scroll-smooth">
            <Command.Empty className="py-8 text-center text-muted-foreground text-sm font-light">
              Aucun écran accessible ne correspond.
            </Command.Empty>

            <Command.Group
              heading="Écrans"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest"
            >
              {items.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.href} ${item.description}`}
                  onSelect={() => {
                    router.push(item.href);
                    setOpen(false);
                  }}
                  data-testid={`admin-command-${item.href.replace(/\//g, '-')}`}
                  className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl text-muted-foreground aria-selected:bg-muted/80 aria-selected:text-foreground cursor-pointer transition-colors"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-[11px] font-normal opacity-70">
                    {ADMIN_DOMAIN_LABELS[ADMIN_CAPABILITY_DOMAINS[item.capability]]} —{' '}
                    {item.description}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
