'use client';

// =====================================================================
// 🧭 Spécimen 18 — Barre latérale, sélecteur d'espace, menu de compte
// =====================================================================
// 📖 Ce qui se juge ici, c'est la console telle qu'elle se tient : la
//    navigation, le sélecteur d'espace de travail en haut et le menu de
//    compte en bas. Pas de banc d'essai de librairie, pas de badge de
//    technologie : seulement les états que le produit montre vraiment.
//
// 🎯 Les trois surfaces doivent se lire comme une seule famille : même
//    échelle de densité (type-control-xs), même rayon (rounded-panel),
//    mêmes jetons sémantiques que le contrat.
// =====================================================================

import { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronsUpDown,
  Compass,
  FileText,
  Highlighter,
  Home,
  Mail,
  PieChart,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import { SafeAvatar } from '@qoe/ui';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Sidebar, type SidebarItemData } from '@qoe/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@qoe/ui/ui/dropdown-menu';
import { cn } from '@qoe/utils';
import { Variant } from '../specimen-frame';

const NAV_ITEMS: SidebarItemData[] = [
  { title: 'Accueil', url: '#accueil', icon: Home, section: 'Général' },
  {
    title: 'Articles & brouillons',
    url: '#articles',
    icon: FileText,
    badge: 8,
    section: 'Édition',
  },
  { title: 'Audience & abonnés', url: '#audience', icon: Users, badge: '+12', section: 'Édition' },
  { title: 'Newsletters', url: '#newsletters', icon: Mail, section: 'Édition' },
  { title: 'Analytics & revenus', url: '#analytics', icon: PieChart, section: 'Monétisation' },
  { title: 'Annotations', url: '#annotations', icon: Highlighter, badge: 3, section: 'Outils' },
  { title: 'Découvrir', url: '#decouvrir', icon: Compass, section: 'Réseau' },
  { title: 'Sauvegardés', url: '#sauvegardes', icon: Bookmark, section: 'Réseau' },
  { title: 'Réglages', url: '#reglages', icon: Settings, section: 'Système' },
];

interface LabWorkspace {
  id: string;
  name: string;
  handle: string;
  email: string;
  logoUrl: string | null;
  nature: 'PERSONAL' | 'MEDIA';
  role: string;
}

const WORKSPACES: readonly LabWorkspace[] = [
  {
    id: 'ws-1',
    name: 'Louis Robin',
    handle: 'louisrobin',
    email: 'louis@qoefi.media',
    logoUrl: '/avatars/avatar-1.svg',
    nature: 'PERSONAL',
    role: 'Compte personnel',
  },
  {
    id: 'ws-2',
    name: 'Le Journal Éco',
    handle: 'journaleco',
    email: 'redaction@journaleco.media',
    logoUrl: '/avatars/media-camille.svg',
    nature: 'MEDIA',
    role: 'Fondateur',
  },
  {
    id: 'ws-3',
    name: 'Atelier Revue',
    handle: 'atelierrevue',
    email: 'contact@atelierrevue.fr',
    logoUrl: null,
    nature: 'MEDIA',
    role: 'Rédacteur en chef',
  },
];

const DRAFTS = [
  { title: 'La ville sans voiture', meta: 'Brouillon · modifié il y a 2 h', state: 'Brouillon' },
  { title: 'Ce que coûte un clic', meta: 'En revue · relu par la rédaction', state: 'En revue' },
  { title: 'Les ports du silence', meta: 'Publié · 1 240 lectures', state: 'Publié' },
];

export function SidebarSpecimen() {
  const [activeUrl, setActiveUrl] = useState('#articles');
  const [activeWorkspace, setActiveWorkspace] = useState<LabWorkspace>(WORKSPACES[1]);

  const activeSection = NAV_ITEMS.find((item) => item.url === activeUrl)?.title ?? 'Accueil';

  return (
    <Variant
      label="Barre latérale, sélecteur d’espace et menu de compte"
      kind="candidat"
      hint="Le sélecteur d’espace (haut) et le menu de compte (bas) partagent la densité, les rayons et les jetons du contrat : SafeAvatar (rond pour une personne, carré arrondi pour un média), sections titrées, survol en surface secondaire."
    >
      <div className="overflow-hidden rounded-panel border border-border/60 bg-background">
        {/* Barre d'application : identité du workspace à gauche, action à droite */}
        <div className="flex h-14 items-center justify-between gap-4 border-b border-border/50 px-4">
          <WorkspaceSwitcher
            active={activeWorkspace}
            onChange={setActiveWorkspace}
            onCreateMedia={() => setActiveUrl('#reglages')}
            className="max-w-[260px]"
          />

          <Button variant="outline" size="sm" onClick={() => setActiveUrl('#articles')}>
            <Plus />
            Nouvel article
          </Button>
        </div>

        <div className="flex min-h-[600px]">
          {/* La barre latérale garde sa géométrie de production */}
          <div className="w-[250px] shrink-0 border-r border-border/40 p-2">
            <Sidebar
              className="relative bottom-0 left-0 top-0 z-auto h-[584px] w-full"
              items={NAV_ITEMS}
              activeUrl={activeUrl}
              onItemSelect={setActiveUrl}
              brandName="Qoefi"
              userName={activeWorkspace.name}
              userEmail={activeWorkspace.email}
              userId={`usr_${activeWorkspace.id}`}
              userUsername={activeWorkspace.handle}
              userAvatar={activeWorkspace.logoUrl}
              userType={activeWorkspace.nature}
              onSettingsClick={() => setActiveUrl('#reglages')}
              publicUrl="#decouvrir"
              primaryAction={{
                label: 'Nouvel article',
                icon: Plus,
                onClick: () => setActiveUrl('#articles'),
              }}
              onLogout={() => setActiveUrl('#accueil')}
            />
          </div>

          {/* Contenu : de quoi situer une console, pas une leçon de design system */}
          <div className="flex-1 p-8">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="type-control-xs uppercase tracking-wider text-muted-foreground">
                  {activeWorkspace.nature === 'MEDIA' ? activeWorkspace.name : 'Espace personnel'}
                </p>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  {activeSection}
                </h3>
              </div>
              <p className="type-control-xs text-muted-foreground">32 brouillons · 8 en revue</p>
            </div>

            <ul className="mt-6 divide-y divide-border/40 rounded-panel border border-border/50">
              {DRAFTS.map((draft) => (
                <li
                  key={draft.title}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{draft.title}</p>
                    <p className="type-control-xs mt-0.5 truncate text-muted-foreground">
                      {draft.meta}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    shape="pill"
                    size="sm"
                    dot
                    tone={
                      draft.state === 'Publié'
                        ? 'success'
                        : draft.state === 'En revue'
                          ? 'brand'
                          : 'neutral'
                    }
                  >
                    {draft.state}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Variant>
  );
}

/**
 * Sélecteur d'espace de travail — l'endroit où l'on change d'identité.
 *
 * Deux natures coexistent : une personne (`SafeAvatar` rond) et un média
 * (`SafeAvatar` carré à coins arrondis). Toutes les actions, y compris
 * « Créer un média », restent à l'intérieur de la collection `<AriaMenu>`
 * pour préserver la navigation complète au clavier.
 */
function WorkspaceSwitcher({
  active,
  onChange,
  onCreateMedia,
  className,
}: {
  active: LabWorkspace;
  onChange: (workspace: LabWorkspace) => void;
  onCreateMedia?: () => void;
  className?: string;
}) {
  const personalWorkspaces = WORKSPACES.filter((ws) => ws.nature === 'PERSONAL');
  const mediaWorkspaces = WORKSPACES.filter((ws) => ws.nature === 'MEDIA');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Changer d’espace de travail"
        className={cn(
          'group/ws inline-flex h-control-sm cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-2.5',
          'type-control-sm font-medium text-foreground transition-colors outline-none',
          'hover:bg-secondary/70 data-[pressed]:bg-secondary',
          'data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/60',
          className
        )}
      >
        <SafeAvatar
          id={active.id}
          username={active.handle}
          src={active.logoUrl}
          name={active.name}
          size={20}
          type={active.nature}
          className="shrink-0"
        />
        <span className="min-w-0 truncate">{active.name}</span>
        <ChevronsUpDown
          className="ml-0.5 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/ws:text-foreground"
          strokeWidth={1.5}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        aria-label="Espaces de travail"
        className="w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Compte personnel</DropdownMenuLabel>
          {personalWorkspaces.map((workspace) => (
            <WorkspaceOptionItem
              key={workspace.id}
              workspace={workspace}
              isActive={active.id === workspace.id}
              onSelect={() => onChange(workspace)}
            />
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel>Publications & médias</DropdownMenuLabel>
          {mediaWorkspaces.map((workspace) => (
            <WorkspaceOptionItem
              key={workspace.id}
              workspace={workspace}
              isActive={active.id === workspace.id}
              onSelect={() => onChange(workspace)}
            />
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onAction={onCreateMedia}>
          <Plus className="text-muted-foreground" strokeWidth={1.75} />
          <span className="flex-1 truncate font-medium">Créer un média</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceOptionItem({
  workspace,
  isActive,
  onSelect,
}: {
  workspace: LabWorkspace;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem onAction={onSelect} className="gap-2.5 py-1.5">
      <SafeAvatar
        id={workspace.id}
        username={workspace.handle}
        src={workspace.logoUrl}
        name={workspace.name}
        size={26}
        type={workspace.nature}
        className="shrink-0"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate type-control-sm font-medium leading-tight text-foreground">
          {workspace.name}
        </span>
        <span className="mt-0.5 block truncate type-control-xs leading-tight text-muted-foreground">
          {workspace.nature === 'MEDIA' ? workspace.role : `@${workspace.handle}`}
        </span>
      </span>
      {isActive && <Check className="ml-auto size-3.5 shrink-0 text-foreground" strokeWidth={2} />}
    </DropdownMenuItem>
  );
}
