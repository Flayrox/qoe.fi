'use client';

import { useState } from 'react';
import { cn } from '@qoe/utils';
import {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Settings,
  Plus,
  Compass,
  Bookmark,
  Highlighter,
  Sliders,
  Smartphone,
  Monitor,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { Sidebar, type SidebarItemData } from '@qoe/ui/sidebar';
import { Button } from '@qoe/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@qoe/ui/ui/dropdown-menu';
import { Building2, User, Check } from 'lucide-react';
import { Variant } from '../specimen-frame';

const DEMO_ITEMS: SidebarItemData[] = [
  {
    title: 'Accueil',
    url: '/dev/ui-lab#home',
    icon: Home,
    section: 'Général',
  },
  {
    title: 'Articles & Brouillons',
    url: '/dev/ui-lab#articles',
    icon: FileText,
    badge: 8,
    section: 'Édition',
  },
  {
    title: 'Audience & Abonnés',
    url: '/dev/ui-lab#audience',
    icon: Users,
    badge: '+12',
    section: 'Édition',
  },
  {
    title: 'Newsletters',
    url: '/dev/ui-lab#newsletter',
    icon: Mail,
    section: 'Édition',
  },
  {
    title: 'Analytics & Revenus',
    url: '/dev/ui-lab#analytics',
    icon: PieChart,
    section: 'Monétisation',
  },
  {
    title: 'Annotations & Surlignages',
    url: '/dev/ui-lab#annotations',
    icon: Highlighter,
    badge: 3,
    section: 'Outils',
  },
  {
    title: 'Découvrir',
    url: '/dev/ui-lab#explore',
    icon: Compass,
    section: 'Réseau',
  },
  {
    title: 'Sauvegardés',
    url: '/dev/ui-lab#bookmarks',
    icon: Bookmark,
    section: 'Réseau',
  },
  {
    title: 'Paramètres du Média',
    url: '/dev/ui-lab#settings',
    icon: Settings,
    section: 'Système',
  },
];

const DEMO_WORKSPACES = [
  { id: 'ws-1', name: 'Louis Robin (Perso)', type: 'PERSONAL', role: 'Auteur' },
  { id: 'ws-2', name: 'Le Journal Éco', type: 'MEDIA', role: 'Fondateur' },
  { id: 'ws-3', name: 'Atelier Revue', type: 'MEDIA', role: 'Rédacteur en chef' },
];

export function SidebarSpecimen() {
  const [activeUrl, setActiveUrl] = useState('/dev/ui-lab#articles');
  const [activeWorkspace, setActiveWorkspace] = useState(DEMO_WORKSPACES[1]);
  const [isMobileMode, setIsMobileMode] = useState(false);
  const [userRole, setUserRole] = useState<'PERSONAL' | 'MEDIA'>('MEDIA');

  return (
    <div className="grid gap-10">
      <Variant
        label="Barre latérale de production (@qoe/ui/sidebar) & Menu de compte unifié"
        kind="candidat"
        hint="100% react-aria-components. La navigation utilise l'indicateur animé sans perte de focus. Le menu profil en bas et le sélecteur d'espace en haut sont des menus accessibles avec raccourcis clavier, gestion du focus et support thème."
      >
        {/* Barre d'outils de démonstration */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="size-3.5" />
              Contrôles du spécimen :
            </span>
            <Button
              variant={isMobileMode ? 'solid' : 'outline'}
              size="sm"
              onClick={() => setIsMobileMode(!isMobileMode)}
              className="gap-2"
            >
              {isMobileMode ? (
                <Smartphone className="size-3.5" />
              ) : (
                <Monitor className="size-3.5" />
              )}
              {isMobileMode ? 'Vue Mobile (390px)' : 'Vue Bureau'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUserRole((r) => (r === 'MEDIA' ? 'PERSONAL' : 'MEDIA'))}
            >
              Avatar : {userRole === 'MEDIA' ? 'Média (Carré)' : 'Personnel (Rond)'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Route active :</span>
            <code className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-foreground">
              {activeUrl}
            </code>
          </div>
        </div>

        {/* Espace de travail & Header contextuel */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
          {/* Faux en-tête d'application avec HeaderWorkspaceSwitcher */}
          <div className="h-14 px-6 border-b border-border/40 flex items-center justify-between bg-muted/10">
            <div className="flex items-center gap-4">
              <span className="text-xs font-bold tracking-tight text-foreground flex items-center gap-2">
                <span className="size-2 rounded-full bg-primary animate-pulse" />
                Studio Qoefi
              </span>
              <span className="text-border">/</span>
              {/* Sélecteur d'espace de travail interactif */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-card border border-border/50 hover:bg-muted/60 transition-all text-xs font-semibold cursor-pointer shadow-2xs outline-hidden">
                  <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {activeWorkspace.type === 'MEDIA' ? (
                      <Building2 className="w-3 h-3" />
                    ) : (
                      <User className="w-3 h-3" />
                    )}
                  </div>
                  <span className="truncate max-w-[140px] text-foreground font-medium">
                    {activeWorkspace.name}
                  </span>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="start"
                  side="bottom"
                  sideOffset={6}
                  className="w-64 p-1.5 rounded-2xl bg-card border border-border/40 shadow-xl"
                  header={
                    <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Espaces de Travail
                    </div>
                  }
                  footer={
                    <div className="border-t border-border/20 mt-1 pt-1">
                      <DropdownMenuItem className="flex items-center gap-2 px-2.5 py-2 text-xs font-semibold text-primary rounded-xl cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Créer un Média</span>
                      </DropdownMenuItem>
                    </div>
                  }
                >
                  {DEMO_WORKSPACES.map((ws) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onAction={() => setActiveWorkspace(ws)}
                      className="w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {ws.type === 'MEDIA' ? (
                            <Building2 className="w-3 h-3" />
                          ) : (
                            <User className="w-3 h-3" />
                          )}
                        </div>
                        <div className="truncate text-left">
                          <p className="font-semibold text-foreground truncate">{ws.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {ws.type === 'MEDIA' ? `Média (${ws.role})` : 'Profil Personnel'}
                          </p>
                        </div>
                      </div>
                      {activeWorkspace.id === ws.id && (
                        <Check className="w-4 h-4 text-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">État du menu profil :</span>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium text-[11px] flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                RAC DropdownMenu actif
              </span>
            </div>
          </div>

          {/* Corps de prévisualisation : Simulateur de fenêtre */}
          <div
            className={cn(
              'relative min-h-[640px] bg-background/60 transition-all flex',
              isMobileMode ? 'max-w-[420px] mx-auto border-x border-border/40' : 'w-full'
            )}
          >
            {/* Sidebar montée en conteneur relatif */}
            <div className="relative w-[250px] shrink-0 p-2">
              <Sidebar
                className="relative top-0 left-0 bottom-0 z-auto h-[620px] w-full"
                items={DEMO_ITEMS}
                activeUrl={activeUrl}
                brandName="Qoefi"
                userName={activeWorkspace.name}
                userEmail="redaction@qoefi.media"
                userId="usr_demo_42"
                userUsername="louisrobin"
                userType={userRole}
                primaryAction={{
                  label: 'Nouvel article',
                  icon: Plus,
                  onClick: () => setActiveUrl('/dev/ui-lab#new-article'),
                }}
                onLogout={() => {
                  alert('Déconnexion simulée avec succès !');
                }}
              />
            </div>

            {/* Zone de contenu simulée du Studio */}
            <div className="flex-1 p-8 flex flex-col justify-between border-l border-border/30">
              <div className="space-y-4 max-w-lg">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  <Sparkles className="size-3.5" />
                  Navigation interactive du Studio
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground">
                  Section active : {activeUrl.replace('/dev/ui-lab#', '') || 'accueil'}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Cliquez sur n’importe quel élément de la barre latérale pour observer la
                  transition de pilule fluide, les badges de notification, et tester le menu compte
                  en bas à gauche.
                </p>

                <div className="p-4 rounded-xl border border-border/40 bg-card/60 space-y-2 text-xs">
                  <p className="font-semibold text-foreground">
                    Fonctionnalités intégrées du menu compte (en bas) :
                  </p>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    <li>Rendu déterministe de l’avatar (forme adaptée profil vs média)</li>
                    <li>Ouverture popover vers le haut (évite de sortir de l’écran)</li>
                    <li>Navigation complète au clavier : Tab, Flèches Haut/Bas, Entrée, Échap</li>
                    <li>Sélecteur d’apparence / thème instantané sans recharger</li>
                    <li>Option de déconnexion sécurisée stylée en variante destructive</li>
                  </ul>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground border-t border-border/30 pt-4">
                Composant :{' '}
                <code className="font-mono text-foreground">packages/ui/src/sidebar.tsx</code>
              </div>
            </div>
          </div>
        </div>
      </Variant>
    </div>
  );
}
