'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';

import { Dialog, DialogContent } from '../primitives/dialog/dialog';

interface CmdKDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

/**
 * ⌘K — palette de commandes.
 *
 * 🔁 F135 — c'était un `<div class="fixed inset-0">` : ni `role="dialog"`, ni
 *    `aria-modal`, ni piège du focus, ni restitution ; Échap et le verrou de
 *    défilement étaient refaits à la main (`document.body.style.overflow`
 *    écrasé sans restauration). La palette est pourtant l'interface clavier du
 *    produit : elle repose sur `Dialog`/`DialogContent` (react-aria), comme
 *    toutes les autres surfaces modales.
 */
export function CmdKDialog({ open, onOpenChange, children }: CmdKDialogProps) {
  const label = t`Menu de commandes`;

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-label={label}
        size="lg"
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg sm:p-0"
      >
        <Command
          label={label}
          className="flex h-auto w-full flex-col overflow-hidden bg-transparent"
          shouldFilter={true}
        >
          {children}

          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-t border-border text-[10px] text-muted-foreground select-none">
            <span>
              Sélectionner avec{' '}
              <kbd className="border border-border/60 rounded px-1 font-medium bg-background">
                Entrée
              </kbd>
            </span>
            <span>Naviguer avec la souris ou clavier</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

interface CmdKInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  onEscape?: () => void;
}

export function CmdKInput({ value, onValueChange, placeholder, onEscape }: CmdKInputProps) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
      <Search className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
      <Command.Input
        value={value}
        onValueChange={onValueChange}
        autoFocus
        placeholder={placeholder || 'Rechercher...'}
        className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60"
      />
      {onEscape && (
        <button
          type="button"
          onClick={onEscape}
          className="text-[10px] font-sans font-medium border border-border/50 rounded px-1.5 py-0.5 text-muted-foreground bg-muted/60 hover:bg-muted transition-colors cursor-pointer shrink-0"
        >
          Échap
        </button>
      )}
    </div>
  );
}

export function CmdKList({
  children,
  emptyText,
}: {
  /** Facultatif : une palette peut n'afficher que son état vide. */
  children?: React.ReactNode;
  emptyText?: string;
}) {
  return (
    <Command.List className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar space-y-2">
      <Command.Empty className="text-center py-6 text-muted-foreground text-xs font-medium">
        {emptyText || t`Aucun résultat trouvé.`}
      </Command.Empty>
      {children}
    </Command.List>
  );
}

export function CmdKGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="px-2 py-1 text-xs font-semibold text-muted-foreground/80 mb-1"
    >
      {children}
    </Command.Group>
  );
}

interface CmdKItemProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  subtitle?: string;
  category?: string;
  value?: string;
  onSelect: () => void;
}

export function CmdKItem({
  icon: Icon,
  label,
  subtitle,
  category,
  value,
  onSelect,
}: CmdKItemProps) {
  return (
    <Command.Item
      value={value || label}
      onSelect={onSelect}
      className="w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg hover:bg-muted aria-selected:bg-muted transition-colors cursor-pointer mb-0.5 select-none group"
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        <div className="w-7 h-7 rounded-md bg-muted/80 flex items-center justify-center border border-border/60 shrink-0">
          <Icon
            className="w-3.5 h-3.5 text-muted-foreground group-aria-selected:text-primary transition-colors"
            strokeWidth={1.5}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground/90 truncate">{label}</span>
          {subtitle && (
            <span className="text-[10px] text-muted-foreground/80 truncate">{subtitle}</span>
          )}
        </div>
      </div>
      {category && (
        <span className="text-[9px] font-medium bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
          {category}
        </span>
      )}
    </Command.Item>
  );
}
