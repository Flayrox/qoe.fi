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
  Building2,
  Check,
  Compass,
  FileText,
  Highlighter,
  Home,
  Mail,
  PieChart,
  Plus,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { Sidebar, type SidebarItemData } from '@qoe/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

const WORKSPACES = [
  { id: 'ws-1', name: 'Louis Robin', nature: 'PERSONAL', role: 'Auteur' },
  { id: 'ws-2', name: 'Le Journal Éco', nature: 'MEDIA', role: 'Fondateur' },
  { id: 'ws-3', name: 'Atelier Revue', nature: 'MEDIA', role: 'Rédacteur en chef' },
] as const;

const DRAFTS = [
  { title: 'La ville sans voiture', meta: 'Brouillon · modifié il y a 2 h', state: 'Brouillon' },
  { title: 'Ce que coûte un clic', meta: 'En revue · relu par la rédaction', state: 'En revue' },
  { title: 'Les ports du silence', meta: 'Publié · 1 240 lectures', state: 'Publié' },
];

export function SidebarSpecimen() {
  const [activeUrl, setActiveUrl] = useState('#articles');
  const [activeWorkspace, setActiveWorkspace] = useState<(typeof WORKSPACES)[number]>(
    WORKSPACES[1]
  );

  const activeSection = NAV_ITEMS.find((item) => item.url === activeUrl)?.title ?? 'Accueil';

  return (
    <Variant
      label="Barre latérale, sélecteur d’espace et menu de compte"
      kind="candidat"
      hint="Le sélecteur d’espace (haut) et le menu de compte (bas) partagent la densité, les rayons et les jetons de la navigation : une seule famille visuelle, deux niveaux d’identité — personne et média."
    >
      <div className="overflow-hidden rounded-panel border border-border/60 bg-background">
        {/* Barre d'application : identité du workspace à gauche, action à droite */}
        <div className="flex h-14 items-center justify-between gap-4 border-b border-border/50 px-4">
          <WorkspaceSwitcher
            active={activeWorkspace}
            onChange={setActiveWorkspace}
            className="max-w-[260px]"
          />

          <button
            type="button"
            onClick={() => setActiveUrl('#articles')}
            className="inline-flex h-control-sm items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 type-control-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="size-3.5" />
            Nouvel article
          </button>
        </div>

        <div className="flex min-h-[600px]">
          {/* La barre latérale garde sa géométrie de production */}
          <div className="w-[250px] shrink-0 border-r border-border/40 p-2">
            <Sidebar
              className="relative bottom-0 left-0 top-0 z-auto h-[584px] w-full"
              items={NAV_ITEMS}
              activeUrl={activeUrl}
              brandName="Qoefi"
              userName={activeWorkspace.name}
              userEmail="redaction@qoefi.media"
              userId={`usr_${activeWorkspace.id}`}
              userUsername="louisrobin"
              userType={activeWorkspace.nature}
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
                  Studio
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
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 type-control-xs',
                      draft.state === 'Publié'
                        ? 'border-success/30 bg-success/10 text-success-text'
                        : draft.state === 'En revue'
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-border/60 bg-muted text-muted-foreground'
                    )}
                  >
                    {draft.state}
                  </span>
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
 * Deux natures coexistent : une personne (avatar rond) et un média (carré à
 * coins arrondis). Elles ne diffèrent que par cette forme et par le libellé
 * de rôle : le reste de la ligne est identique, sinon on donne à croire que
 * ce sont deux produits.
 */
function WorkspaceSwitcher({
  active,
  onChange,
  className,
}: {
  active: (typeof WORKSPACES)[number];
  onChange: (workspace: (typeof WORKSPACES)[number]) => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex h-control-sm items-center gap-2.5 rounded-panel border border-border/50 bg-card px-2.5',
          'type-control-xs font-medium text-foreground transition-colors',
          'hover:bg-muted/60 outline-none data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/60',
          className
        )}
      >
        <IdentityMark nature={active.nature} />
        <span className="min-w-0 truncate">{active.name}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="w-64 rounded-panel border border-border/40 bg-card p-1.5 shadow-xl"
        header={
          <p className="px-2.5 py-1.5 type-control-xs uppercase tracking-wider text-muted-foreground">
            Espaces de travail
          </p>
        }
        footer={
          <div className="mt-1 border-t border-border/20 pt-1">
            <DropdownMenuItem className="flex items-center gap-2 rounded-lg px-2.5 py-2 type-control-xs font-medium text-primary">
              <Plus className="size-3.5" />
              Créer un média
            </DropdownMenuItem>
          </div>
        }
      >
        {WORKSPACES.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onAction={() => onChange(workspace)}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <IdentityMark nature={workspace.nature} />
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-foreground">
                  {workspace.name}
                </span>
                <span className="block truncate type-control-xs text-muted-foreground">
                  {workspace.nature === 'MEDIA' ? `Média · ${workspace.role}` : 'Compte personnel'}
                </span>
              </span>
            </span>
            {active.id === workspace.id && <Check className="size-4 shrink-0 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** La seule différence admise entre une personne et un média : la forme. */
function IdentityMark({ nature }: { nature: 'PERSONAL' | 'MEDIA' }) {
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center bg-primary/10 text-primary',
        nature === 'MEDIA' ? 'rounded-md' : 'rounded-full'
      )}
    >
      {nature === 'MEDIA' ? <Building2 className="size-3" /> : <User className="size-3" />}
    </span>
  );
}
