'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';
import { Dialog, DialogContent } from '@qoe/ui/dialog';
import {
  ADMIN_CAPABILITY_DOMAINS,
  ADMIN_DOMAIN_LABELS,
  normalizeCapabilities,
  visibleNav,
  type AdminCapability,
} from '@/lib/admin-console';
import { visibleActions } from '@/lib/admin-actions-index';
import { CopyableId } from '@/components/shell/CopyableId';

// =====================================================================
// ⌘K — CommandPalette
// =====================================================================
// Elle ne propose QUE ce que la personne peut faire : une capacité manquante,
// et l'entrée n'existe pas dans l'index. Elle cherche trois choses —
// des actions (verbes), des dossiers (les files en cours) et des écrans.
// L'index des écrans reste la même source que la sidebar (lib/admin-console),
// donc les deux ne peuvent pas diverger.
// =====================================================================

export interface CommandDossier {
  id: string;
  queue: string;
  title: string;
  status: string;
  href: string;
  slaState: string;
}

interface CommandPaletteProps {
  capabilities: string[] | readonly string[];
  /** Conservé pour l'affichage et les futurs verbes contextuels (Phase 6). */
  roles?: readonly string[];
  /** Dossiers ouverts des files, indexés pour y sauter directement. */
  dossiers?: readonly CommandDossier[];
}

const SLA_LABELS: Record<string, string> = {
  breached: 'SLA dépassé',
  due_soon: 'échéance proche',
  on_track: 'dans les temps',
  closed: 'fermé',
};

export function CommandPalette({ capabilities, dossiers = [] }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const caps = useMemo(
    () => normalizeCapabilities(capabilities as readonly string[]) as AdminCapability[],
    [capabilities]
  );
  const screens = useMemo(() => visibleNav(caps), [caps]);
  const actions = useMemo(() => visibleActions(caps), [caps]);

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

  const go = (href: string) => {
    router.push(href);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg">
      <DialogContent
        showCloseButton={false}
        aria-label="Palette de commandes"
        overlayClassName="items-start pt-[15vh] bg-foreground/25 backdrop-blur-sm"
        className="w-full max-w-xl gap-0 overflow-hidden border border-border bg-popover p-0 shadow-lg"
        data-testid="admin-command-palette"
      >
        <Command className="w-full overflow-hidden bg-transparent font-sans">
          <div className="flex items-center border-b border-border px-3">
            <Command.Input
              autoFocus
              placeholder="Chercher un dossier, une action, un écran…"
              className="h-11 w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[420px] overflow-y-auto p-1.5">
            <Command.Empty className="py-6 text-center text-[12px] text-muted-foreground">
              Rien ne correspond.
            </Command.Empty>

            {actions.length > 0 && (
              <Command.Group
                heading="Actions"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {actions.map((action) => (
                  <Command.Item
                    key={action.id}
                    value={`${action.label} ${action.keywords} ${action.href}`}
                    onSelect={() => go(action.href)}
                    data-testid={`admin-command-action-${action.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground aria-selected:bg-muted aria-selected:text-foreground"
                  >
                    <Zap className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{action.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {dossiers.length > 0 && (
              <Command.Group
                heading="Dossiers"
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {dossiers.map((dossier) => (
                  <Command.Item
                    key={`${dossier.queue}:${dossier.id}`}
                    value={`${dossier.title} ${dossier.queue} ${dossier.id} ${dossier.status}`}
                    onSelect={() => go(dossier.href)}
                    data-testid={`admin-command-dossier-${dossier.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground aria-selected:bg-muted aria-selected:text-foreground"
                  >
                    <span className="min-w-0 flex-1 truncate">{dossier.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {SLA_LABELS[dossier.slaState] ?? dossier.status}
                    </span>
                    <CopyableId id={dossier.id} max={6} label="Copier l’identifiant du dossier" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Écrans"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {screens.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.href} ${item.description}`}
                  onSelect={() => go(item.href)}
                  data-testid={`admin-command-${item.href.replace(/\//g, '-')}`}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-muted-foreground aria-selected:bg-muted aria-selected:text-foreground"
                >
                  <span className="text-[13px] font-medium">{item.label}</span>
                  <span className="text-[11px] opacity-70">
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
