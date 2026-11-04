'use client';

import { useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  Copy,
  LogOut,
  Pencil,
  Plus,
  Settings,
  Share2,
  Trash2,
  User,
} from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Dropdown } from '@qoe/ui/dropdown';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@qoe/ui/ui/dropdown-menu';
import { DefectList, Variant } from '../specimen-frame';

const WORKSPACES = [
  { id: 'personal', label: 'Louis Robin', type: 'PERSONAL' as const },
  { id: 'climat', label: 'Climat', type: 'MEDIA' as const },
  { id: 'atelier', label: 'Atelier Nord', type: 'MEDIA' as const },
];

export function MenuDropdownSpecimen() {
  return (
    <div className="grid gap-10">
      <Variant
        label="Primitive composée (@qoe/ui/ui/dropdown-menu)"
        kind="candidat"
        hint="Variante composée réalignée sur le contrat : conteneur rounded-panel en bg-popover, sections titrées, survol en surface secondaire, icônes 14px visibles et raccourci à droite."
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            Actions
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Article</DropdownMenuLabel>
              <DropdownMenuItem>
                <Pencil />
                Modifier
                <DropdownMenuShortcut>E</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy />
                Dupliquer
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Share2 />
                Partager
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <Trash2 />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Variant>

      <Variant
        label="Call-site réel"
        kind="actuel"
        hint="HeaderWorkspaceSwitcher, tel qu’implémenté aujourd’hui : un dropdown fait main avec useState et une div positionnée en absolu."
      >
        <HandRolledWorkspaceMenu />
        <DefectList
          items={[
            'Aucune navigation clavier (flèches, Échap, focus visible)',
            'Pas de portail : un parent en overflow-hidden coupe le menu',
            'Pas d’aria-expanded ni de fermeture au clic extérieur',
            'Styles de call-site (rounded-2xl, shadow-xl) sans lien avec les primitives',
          ]}
        />
      </Variant>

      <Variant
        label="Candidat"
        kind="candidat"
        hint="Même moteur (Base UI Menu : clavier, portail, aria) mais aligné sur ce que le reste de l’app fait déjà : tokens uniquement, rayon de l’échelle, survol en surface (accent) et jamais en couleur de marque, items en h-8, icônes visibles, raccourci à droite."
      >
        <CandidateMenu />
      </Variant>
    </div>
  );
}

/** Reproduction fidèle du pattern actuel du Studio (sélecteur d’espace). */
function HandRolledWorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(WORKSPACES[1]);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/40"
      >
        <Building2 className="size-4 text-muted-foreground" strokeWidth={1.5} />
        <span className="max-w-40 truncate">{active.label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-2 w-64 rounded-2xl border border-border/60 bg-card p-2 shadow-xl">
          <p className="px-2 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
            Espaces
          </p>
          {WORKSPACES.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => {
                setActive(ws);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              {ws.type === 'MEDIA' ? (
                <Building2 className="size-4 text-muted-foreground" strokeWidth={1.5} />
              ) : (
                <User className="size-4 text-muted-foreground" strokeWidth={1.5} />
              )}
              <span className="flex-1 truncate text-left">{ws.label}</span>
              {active.id === ws.id && <Check className="size-3.5 text-primary" strokeWidth={1.5} />}
            </button>
          ))}
          <div className="my-1 h-px bg-border/60" />
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-4" strokeWidth={1.5} />
            Créer un espace
          </button>
        </div>
      )}
    </div>
  );
}

/** Proposition : Dropdown react-aria + tokens uniquement, aucun style de marque en état. */
function CandidateMenu() {
  return (
    <Dropdown
      label={
        <>
          <Settings className="size-3.5" strokeWidth={1.5} />
          <span>Options</span>
        </>
      }
      ariaLabel="Options"
      variant="outline"
      size="sm"
      items={[
        {
          id: 'edit',
          label: 'Modifier',
          icon: <Pencil className="size-4" strokeWidth={1.5} />,
          shortcut: 'E',
          onAction: () => {},
        },
        {
          id: 'duplicate',
          label: 'Dupliquer',
          icon: <Copy className="size-4" strokeWidth={1.5} />,
          onAction: () => {},
        },
        {
          id: 'share',
          label: 'Partager',
          icon: <Share2 className="size-4" strokeWidth={1.5} />,
          onAction: () => {},
        },
        {
          id: 'draft',
          label: 'Déplacer vers brouillon',
          icon: <LogOut className="size-4" strokeWidth={1.5} />,
          onAction: () => {},
        },
      ]}
    />
  );
}
