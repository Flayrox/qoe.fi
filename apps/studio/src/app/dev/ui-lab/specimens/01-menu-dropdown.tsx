'use client';

import { useState } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
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
        label="Primitive actuelle"
        kind="actuel"
        hint="Rendu réel de @qoe/ui/ui/dropdown-menu : conteneur rounded-[20px] en bg-white (casse en thème sombre), items rounded-[12px] avec survol vermillon en dur, et icônes supprimées par [&_svg]:hidden."
      >
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            Actions
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {/* DropdownMenuLabel est un GroupLabel Base UI : hors <DropdownMenuGroup>
                il lève « MenuGroupContext is missing » et casse tout le menu. */}
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
        <DefectList
          items={[
            'Icônes invisibles : [&_svg]:hidden dans DropdownMenuItem',
            'bg-white en dur → menu blanc sur fond sombre',
            'Survol #EE4B2B : la marque devient une couleur d’état',
            'Rayon 20px ici, rounded-lg (8px) dans Popover et Select',
            'DropdownMenuLabel hors DropdownMenuGroup plante le menu (MenuGroupContext is missing)',
          ]}
        />
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

/** Proposition : Base UI + tokens uniquement, aucun style de marque en état. */
function CandidateMenu() {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        render={<Button variant="outline" size="sm" />}
        className="aria-expanded:bg-muted"
      >
        <Settings className="size-3.5" strokeWidth={1.5} />
        Options
        <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
      </MenuPrimitive.Trigger>

      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner sideOffset={6} align="start" className="isolate z-50">
          <MenuPrimitive.Popup className="w-56 origin-(--transform-origin) rounded-lg border border-border/60 bg-popover/95 p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 backdrop-blur-xl duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
            <MenuPrimitive.Group>
              <MenuPrimitive.GroupLabel className="px-2 py-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                Article
              </MenuPrimitive.GroupLabel>

              <MenuItem icon={<Pencil className="size-4" strokeWidth={1.5} />} shortcut="E">
                Modifier
              </MenuItem>
              <MenuItem icon={<Copy className="size-4" strokeWidth={1.5} />}>Dupliquer</MenuItem>
              <MenuItem icon={<Share2 className="size-4" strokeWidth={1.5} />}>Partager</MenuItem>
            </MenuPrimitive.Group>

            <MenuPrimitive.Separator className="my-1 h-px bg-border/60" />

            <MenuItem icon={<LogOut className="size-4" strokeWidth={1.5} />}>
              Déplacer vers brouillon
            </MenuItem>
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

function MenuItem({
  icon,
  shortcut,
  children,
}: {
  icon: React.ReactNode;
  shortcut?: string;
  children: React.ReactNode;
}) {
  return (
    <MenuPrimitive.Item className="group flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] text-foreground outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:shrink-0">
      <span className="text-muted-foreground group-focus:text-accent-foreground">{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {shortcut && (
        <kbd className="font-mono text-[10.5px] text-muted-foreground group-focus:text-accent-foreground/80">
          {shortcut}
        </kbd>
      )}
    </MenuPrimitive.Item>
  );
}
