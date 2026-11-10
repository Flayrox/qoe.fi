'use client';

import React, { useState, useEffect, createContext, useContext, useId, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, animate, useMotionValue, AnimatePresence } from 'framer-motion';
import { cn } from '@qoe/utils';
import { BRAND_LOGOS } from '@qoe/brand';
import { ThemeToggle } from './ui/ThemeToggle';
import { SafeAvatar } from './SafeAvatar';
import { Badge } from './primitives/badge/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import {
  Home,
  FileText,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
  Plus,
  LogOut,
  Search,
  Bookmark,
  Highlighter,
  Wallet,
  Bell,
  Building2,
  Webhook,
  Compass,
  CircleUserRound,
  ChevronsUpDown,
  Crown,
  ExternalLink,
  LayoutDashboard,
  BookOpen,
  X,
} from 'lucide-react';
import { t } from '@lingui/core/macro';

/* ─────────────────────────────────────────────
   Icon Registry (Lucide)
   ───────────────────────────────────────────── */
const iconRegistry: Record<
  string,
  React.ComponentType<{ className?: string; strokeWidth?: number; width?: number; height?: number }>
> = {
  Home,
  FileText,
  Building2,
  Mail,
  Users,
  PieChart,
  Code,
  Settings,
  Bookmark,
  Highlighter,
  Wallet,
  Bell,
  Search,
  Webhook,
  Compass,
  CircleUserRound,
  Crown,
};

/* ─────────────────────────────────────────────
   Types & Interfaces
   ───────────────────────────────────────────── */
export interface SidebarItemData {
  title: string;
  url: string;
  iconName?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  section?: string;
  badge?: string | number;
}

export interface SidebarAppSwitch {
  /** Application courante : l'encadré du logo y repose au repos. */
  current: 'reader' | 'studio';
  /** URL absolue de l'application sœur (studio ↔ feed). */
  counterpartHref: string;
}

export interface SidebarProps {
  /** Shorthand navigation items */
  items?: SidebarItemData[];
  /** Currently active path (defaults to usePathname) */
  activeUrl?: string;
  /** Gestionnaire optionnel pour intercepter la sélection d'une entrée (ex. bac à sable). */
  onItemSelect?: (url: string) => void;
  /** Header logo element */
  logo?: React.ReactNode;
  /** Brand name displayed next to logo */
  brandName?: string;
  /**
   * 🎛️ Bascule Studio ↔ Feed logée dans le logo : le symbole mène au Studio,
   * le nom de marque au feed. Fourni par l'application hôte, la sidebar ne
   * connaît aucune URL métier.
   */
  appSwitch?: SidebarAppSwitch;
  /** Authenticated user ID (for deterministic avatar seed) */
  userId?: string | null;
  /** Authenticated user username/handle (for deterministic avatar seed) */
  userUsername?: string | null;
  /** Authenticated user name */
  userName?: string;
  /** Authenticated user email */
  userEmail?: string;
  /** User fallback initials */
  userFallback?: string;
  /** User avatar image URL */
  userAvatar?: string | null;
  /** Nature du compte : un média garde un carré à coins arrondis. */
  userType?: 'PERSONAL' | 'MEDIA' | string | null;
  /** Href ou gestionnaire vers les réglages de l'application courante. */
  settingsHref?: string;
  onSettingsClick?: () => void;
  /** Lien optionnel vers la vitrine publique du compte ou média. */
  publicUrl?: string;
  /** Logout handler function */
  onLogout?: () => void | Promise<void>;
  /** Primary CTA action */
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: React.ComponentType<{ className?: string }>;
  };
  /** Optional search change handler */
  onSearchChange?: (query: string) => void;
  /** Optional search placeholder */
  searchPlaceholder?: string;
  /** Custom additional CSS classes */
  className?: string;
  /** Optional custom children for compound component composition */
  children?: React.ReactNode;
}

/* ─────────────────────────────────────────────
   Context for Compound Components
   ───────────────────────────────────────────── */
interface SidebarContextValue {
  activeUrl: string;
  onItemSelect?: (url: string) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebarContext() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('Sidebar sub-components must be used within <Sidebar>');
  }
  return ctx;
}

const ArrowSVG = () => (
  <svg height="16" width="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M1.559 16 13.795 3.764v8.962H16V0H3.274v2.205h8.962L0 14.441 1.559 16z" />
  </svg>
);

/* ─────────────────────────────────────────────
   Compound Sub-Components
   ───────────────────────────────────────────── */

export function SidebarHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between px-2 pt-1 pb-4 mb-1', className)}>
      {children}
    </div>
  );
}

export function SidebarContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin', className)}>
      {children}
    </div>
  );
}

export function SidebarGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      {title && (
        <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-muted-foreground/70 uppercase">
          {title}
        </div>
      )}
      <ul className="space-y-[2px]">{children}</ul>
    </div>
  );
}

export function SidebarItem({
  href,
  icon: Icon,
  badge,
  children,
  className,
}: {
  href: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  const { activeUrl, onItemSelect } = useSidebarContext();
  const active = href === '/' ? activeUrl === '/' : activeUrl.startsWith(href);

  return (
    <li className="relative">
      <Link
        href={href}
        onClick={(e) => {
          if (onItemSelect) {
            e.preventDefault();
            onItemSelect(href);
            return;
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('reset-feed-view'));
          }
        }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex items-center gap-3 px-3 py-2 rounded-[10px] transition-colors duration-150 outline-none z-10',
          active
            ? 'text-sidebar-foreground font-medium'
            : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
          className
        )}
      >
        {active && (
          <motion.span
            layoutId="sidebar-active-pill"
            className="absolute inset-0 bg-sidebar-accent/80 rounded-[10px] -z-10"
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          />
        )}
        {Icon && (
          <span
            className={cn(
              'flex items-center justify-center shrink-0 transition-colors w-[20px] h-[20px]',
              active ? 'text-sidebar-primary' : 'text-sidebar-foreground/70'
            )}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.5} />
          </span>
        )}
        <span
          className={cn(
            'truncate flex-1 text-[14px] tracking-[-0.1px] leading-[1.2] font-normal',
            active ? 'text-sidebar-primary font-medium' : ''
          )}
        >
          {children}
        </span>
        {badge !== undefined && (
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground'
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    </li>
  );
}

export function SidebarFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('pt-3.5 border-t border-sidebar-border/50 flex flex-col gap-3', className)}>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Bascule Studio ↔ Feed (logée dans le logo)
   ───────────────────────────────────────────── */
/**
 * 🎛️ Bascule Studio ↔ Lecteur logée dans le logo : ce n'est pas un cadre qui
 * se déplace, c'est la **fenêtre du symbole** qui coulisse dans la forme. Le
 * logo change donc littéralement de silhouette — à droite le feed, à gauche le
 * Studio, où l'ouverture prend tout l'espace libre et le bloc plein garde sa
 * largeur. Le clic suit la fenêtre. Même grammaire que le plateau de
 * `apps/hi`, où les cartes finissent par épouser la fenêtre du Q.
 *
 * Géométrie officielle du symbole (relevée dans `packages/brand`) : fenêtre
 * 71,13 × 115,44 à y = 8,31, rayon 8,34, de x = 134,22 à x = 205,35.
 */
const SYMBOL_W = 216;
const SYMBOL_H = 133;
const WINDOW_W = 71.13;
const WINDOW_H = 115.44;
const WINDOW_Y = 8.31;
const WINDOW_R = 8.34;
const WINDOW_RIGHT_X = 134.22;
const WINDOW_LEFT_X = SYMBOL_W - WINDOW_RIGHT_X - WINDOW_W; // ≈ 10,65
// Les deux repos sont des intervalles : au feed la fenêtre garde la largeur
// officielle de la marque, dans le Studio elle prend tout l'espace laissé libre
// à gauche, jusqu'au bloc plein — le plein et le vide échangent leurs rôles.
const FEED_LEFT = WINDOW_RIGHT_X; // 134,22
const FEED_RIGHT = WINDOW_RIGHT_X + WINDOW_W; // 205,35
const STUDIO_LEFT = WINDOW_LEFT_X; // 10,65
const STUDIO_RIGHT = WINDOW_RIGHT_X; // 134,22

function SidebarAppSwitch({
  brandName,
  current,
  counterpartHref,
}: {
  brandName?: string;
  current: SidebarAppSwitch['current'];
  counterpartHref: string;
}) {
  const [hovered, setHovered] = useState<SidebarAppSwitch['current'] | null>(null);
  // Une destination cliquée se fige : la souris qui sort pendant la navigation
  // ne doit pas renvoyer la fenêtre d'où elle vient.
  const [committed, setCommitted] = useState<SidebarAppSwitch['current'] | null>(null);
  const side = committed ?? hovered ?? current;
  // Identifiant stable SSR/bornes, sans caractère réservé dans `url(#…)`.
  const maskId = `qoe-app-switch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const windowRef = useRef<SVGRectElement | null>(null);

  // Course 0 (lecteur) → 1 (Studio) portée par un ressort : la fenêtre glisse
  // et s'élargit en route, comme le plateau de `hi` qui se dilate en rejoignant
  // la fenêtre du symbole.
  const progress = useMotionValue(current === 'studio' ? 1 : 0);
  useEffect(() => {
    const controls = animate(progress, side === 'studio' ? 1 : 0, {
      type: 'spring',
      stiffness: 280,
      damping: 28,
    });
    return () => controls.stop();
  }, [progress, side]);

  useEffect(() => {
    const rect = windowRef.current;
    if (!rect) return;

    const apply = (raw: number) => {
      // Course bornée : la fenêtre ne mord jamais sur le bord du symbole.
      const p = Math.min(1, Math.max(0, raw));
      // Les deux bords glissent ensemble : l'ouverture s'élargit en partant
      // vers la gauche et se rétracte en revenant vers la droite.
      const left = FEED_LEFT + (STUDIO_LEFT - FEED_LEFT) * p;
      const right = FEED_RIGHT + (STUDIO_RIGHT - FEED_RIGHT) * p;
      rect.setAttribute('x', left.toFixed(3));
      rect.setAttribute('width', (right - left).toFixed(3));
    };

    apply(progress.get());
    return progress.on('change', apply);
  }, [progress]);

  // La fenêtre indique où mène le clic : à droite le feed, à gauche le Studio.
  // L'application où l'on se trouve n'est qu'un repère, jamais un lien.
  const zones: Array<{
    id: SidebarAppSwitch['current'];
    label: string;
    href: string | null;
    className: string;
  }> = [
    {
      id: 'studio',
      label: t`Studio`,
      href: current === 'studio' ? null : counterpartHref,
      className: 'rounded-l-[8px]',
    },
    {
      id: 'reader',
      label: t`Lecteur`,
      href: current === 'reader' ? null : counterpartHref,
      className: 'rounded-r-[8px]',
    },
  ];

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="relative shrink-0" onMouseLeave={() => setHovered(null)}>
        <svg
          viewBox={`0 0 ${SYMBOL_W} ${SYMBOL_H}`}
          className="block h-5 w-auto"
          aria-hidden="true"
        >
          {/* Le masque est plein : seule la fenêtre mobile y découpe la forme. */}
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={0}
            y={0}
            width={SYMBOL_W}
            height={SYMBOL_H}
          >
            <rect x={0} y={0} width={SYMBOL_W} height={SYMBOL_H} fill="white" />
            <rect
              ref={windowRef}
              x={current === 'reader' ? FEED_LEFT : STUDIO_LEFT}
              y={WINDOW_Y}
              width={current === 'reader' ? FEED_RIGHT - FEED_LEFT : STUDIO_RIGHT - STUDIO_LEFT}
              height={WINDOW_H}
              rx={WINDOW_R}
              fill="black"
            />
          </mask>

          <g mask={`url(#${maskId})`}>
            {/* Silhouette pleine : le tracé officiel, son trou d'origine
                rebouché — sinon la marque garde son propre trou et la fenêtre
                en creuse un second. */}
            <path d={BRAND_LOGOS.symbol.path} fill={BRAND_LOGOS.symbol.defaultColor} />
            <rect
              x={WINDOW_RIGHT_X - 1}
              y={WINDOW_Y - 1}
              width={WINDOW_W + 2}
              height={WINDOW_H + 2}
              rx={WINDOW_R + 1}
              fill={BRAND_LOGOS.symbol.defaultColor}
            />
          </g>
        </svg>

        {/* Deux moitiés de logo : survol = fenêtre, clic = application. */}
        <div className="absolute inset-0 flex">
          {zones.map((zone) => {
            const zoneClassName = cn(
              'h-full w-1/2 outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              zone.className
            );

            return zone.href ? (
              <a
                key={zone.id}
                href={zone.href}
                title={zone.label}
                aria-label={zone.label}
                onMouseEnter={() => setHovered(zone.id)}
                onClick={() => setCommitted(zone.id)}
                className={zoneClassName}
              />
            ) : (
              <span
                key={zone.id}
                title={zone.label}
                onMouseEnter={() => setHovered(zone.id)}
                className={zoneClassName}
              />
            );
          })}
        </div>
      </div>

      {brandName && (
        <span className="min-w-0 truncate font-semibold text-[17px] tracking-tight leading-none text-sidebar-foreground">
          {brandName}
        </span>
      )}

      {/* 🚀 Prerender spéculatif Chrome/Edge vers l'application sœur au survol ou focus */}
      {counterpartHref && (
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [
                {
                  source: 'list',
                  urls: [counterpartHref],
                  eagerness: 'moderate',
                },
              ],
            }),
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main <Sidebar /> Component
   ───────────────────────────────────────────── */
export function Sidebar({
  items,
  activeUrl: activeUrlProp,
  onItemSelect,
  logo,
  brandName = 'qoefi',
  appSwitch,
  userId,
  userUsername,
  userName,
  userEmail,
  userAvatar,
  userType = null,
  settingsHref = '/settings',
  onSettingsClick,
  publicUrl,
  onLogout,
  primaryAction,
  onSearchChange,
  searchPlaceholder = t`Rechercher...`,
  className,
  children,
}: SidebarProps) {
  const currentPathname = usePathname();
  const activeUrl = activeUrlProp ?? currentPathname;
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Handle Escape key & Mobile drawer toggle event
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileOpen(false);
      }
    };
    const handleToggleMobile = () => {
      setIsMobileOpen((prev) => !prev);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('toggle-mobile-sidebar', handleToggleMobile);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('toggle-mobile-sidebar', handleToggleMobile);
    };
  }, []);

  // Close mobile menu on page navigation
  useEffect(() => {
    setIsMobileOpen(false);
  }, [activeUrl]);

  // Group items by section if provided
  const groupedItems = (items || []).reduce<Record<string, SidebarItemData[]>>((acc, item) => {
    const section = item.section || 'DEFAULT';
    if (!acc[section]) acc[section] = [];
    acc[section].push(item);
    return acc;
  }, {});

  const contextValue = { activeUrl, onItemSelect, isMobileOpen, setIsMobileOpen };

  return (
    <SidebarContext.Provider value={contextValue}>
      {/* ── MOBILE BACKDROP ── */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <aside
        style={{ viewTransitionName: 'app-sidebar' }}
        className={cn(
          'font-sans select-none w-[250px] flex flex-col',
          'fixed top-[6px] left-[6px] bottom-[6px] z-50 transition-transform duration-300 ease-out',
          isMobileOpen ? 'translate-x-0' : '-translate-x-[calc(100%+16px)] md:translate-x-0',
          className
        )}
      >
        <nav
          aria-label={t`Navigation principale`}
          className={cn(
            'h-full flex flex-col justify-between p-4 rounded-[18px] relative overflow-hidden',
            'bg-sidebar backdrop-blur-[25px] saturate-[180%] border border-sidebar-border shadow-xl text-sidebar-foreground'
          )}
        >
          {children ? (
            children
          ) : (
            <>
              {/* ── HEADER / LOGO ── */}
              <SidebarHeader>
                {appSwitch ? (
                  <SidebarAppSwitch
                    brandName={brandName}
                    current={appSwitch.current}
                    counterpartHref={appSwitch.counterpartHref}
                  />
                ) : (
                  <Link href="/" className="flex items-center gap-2 outline-none group">
                    {logo}
                    {brandName && (
                      <span className="font-semibold text-[17px] tracking-tight leading-none text-sidebar-foreground group-hover:opacity-85 transition-opacity ml-0.5">
                        {brandName}
                      </span>
                    )}
                  </Link>
                )}
                <div className="flex items-center gap-1.5">
                  {/* Bascule clair/sombre toujours visible (Soleil/Lune) */}
                  <ThemeToggle />
                  {/* Bouton de fermeture tactile sur mobile */}
                  <button
                    type="button"
                    onClick={() => setIsMobileOpen(false)}
                    className="md:hidden p-1.5 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    aria-label={t`Fermer le menu`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </SidebarHeader>

              {/* ── OPTIONAL SEARCH BAR ── */}
              {onSearchChange && (
                <div className="px-2 pb-3">
                  <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sidebar-accent/50 border border-sidebar-border/40 text-xs text-muted-foreground">
                    <Search className="w-3.5 h-3.5 shrink-0" />
                    <input
                      type="text"
                      placeholder={searchPlaceholder}
                      onChange={(e) => onSearchChange(e.target.value)}
                      className="w-full bg-transparent outline-none placeholder:text-muted-foreground/60 text-sidebar-foreground text-xs"
                    />
                  </div>
                </div>
              )}

              {/* ── SCROLLABLE NAVIGATION LIST ── */}
              <SidebarContent>
                {Object.entries(groupedItems).map(([section, sectionItems]) => (
                  <SidebarGroup key={section} title={section !== 'DEFAULT' ? section : undefined}>
                    {sectionItems.map((item) => {
                      const Icon =
                        item.icon || (item.iconName ? iconRegistry[item.iconName] : FileText);

                      return (
                        <SidebarItem
                          key={item.title}
                          href={item.url}
                          icon={Icon}
                          badge={item.badge}
                        >
                          {item.title}
                        </SidebarItem>
                      );
                    })}
                  </SidebarGroup>
                ))}
              </SidebarContent>

              {/* ── FOOTER: PRIMARY ACTION & ACCOUNT ── */}
              <SidebarFooter>
                {primaryAction &&
                  (primaryAction.onClick ? (
                    <button
                      type="button"
                      onClick={primaryAction.onClick}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-2 rounded-[12px] text-[13px] font-medium transition-all duration-200 cursor-pointer outline-none',
                        'bg-sidebar-accent/60 hover:bg-sidebar-accent border border-sidebar-border/60 text-sidebar-foreground active:scale-[0.98]'
                      )}
                    >
                      <span className="text-sidebar-primary flex items-center justify-center shrink-0 w-[22px] h-[22px]">
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                      <span className="flex-1 text-left ml-2 truncate font-medium text-[13px] tracking-[-0.1px]">
                        {primaryAction.label}
                      </span>
                      <span className="text-sidebar-foreground/45 shrink-0 hover:text-sidebar-foreground transition-colors">
                        <ArrowSVG />
                      </span>
                    </button>
                  ) : (
                    <Link
                      href={primaryAction.href || '#'}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-2 rounded-[12px] text-[13px] font-medium transition-all duration-200',
                        'bg-sidebar-accent/60 hover:bg-sidebar-accent border border-sidebar-border/60 text-sidebar-foreground active:scale-[0.98]'
                      )}
                    >
                      <span className="text-sidebar-primary flex items-center justify-center shrink-0 w-[22px] h-[22px]">
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                      <span className="flex-1 text-left ml-2 truncate font-medium text-[13px] tracking-[-0.1px]">
                        {primaryAction.label}
                      </span>
                      <span className="text-sidebar-foreground/45 shrink-0 hover:text-sidebar-foreground transition-colors">
                        <ArrowSVG />
                      </span>
                    </Link>
                  ))}

                {/* Profile & Account Menu — aligné sur le contrat (@qoe/ui) */}
                <div className="relative">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        'group/account flex w-full cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-sidebar-foreground outline-none transition-colors',
                        'hover:bg-sidebar-accent/70 data-[pressed]:bg-sidebar-accent/80',
                        'data-[focus-visible]:ring-2 data-[focus-visible]:ring-ring/60'
                      )}
                      aria-label={t`Menu compte`}
                    >
                      <SafeAvatar
                        id={userId}
                        username={userUsername}
                        src={userAvatar}
                        name={userName}
                        size={28}
                        type={userType}
                        className="shrink-0 border border-border/50"
                      />
                      <div className="min-w-0 flex-1 truncate">
                        <span className="block truncate type-control-sm font-medium leading-tight text-sidebar-foreground">
                          {userName || t`Créateur`}
                        </span>
                        {(userUsername || userEmail) && (
                          <span className="mt-0.5 block truncate type-control-xs leading-tight text-muted-foreground">
                            {userUsername ? `@${userUsername}` : userEmail}
                          </span>
                        )}
                      </div>
                      <ChevronsUpDown
                        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover/account:text-sidebar-foreground"
                        strokeWidth={1.5}
                      />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      side="top"
                      align="start"
                      sideOffset={8}
                      className="w-[236px]"
                      header={
                        <div className="mb-1 flex items-center gap-2.5 border-b border-border/50 px-2 py-2">
                          <SafeAvatar
                            id={userId}
                            username={userUsername}
                            src={userAvatar}
                            name={userName}
                            size={30}
                            type={userType}
                            className="shrink-0 border border-border/50"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate type-control-sm font-semibold leading-tight text-foreground">
                                {userName || t`Créateur`}
                              </span>
                              {userType && (
                                <Badge size="xs" variant="soft" tone="neutral">
                                  {userType === 'MEDIA' ? t`Média` : t`Perso`}
                                </Badge>
                              )}
                            </div>
                            {(userEmail || userUsername) && (
                              <span className="mt-0.5 block truncate type-control-xs leading-tight text-muted-foreground">
                                {userEmail || `@${userUsername}`}
                              </span>
                            )}
                          </div>
                        </div>
                      }
                    >
                      {/* 🎛️ Changer d'application sans quitter la sidebar :
                          la destination dépend de l'app où l'on se trouve. */}
                      {appSwitch && (
                        <>
                          <DropdownMenuGroup>
                            <DropdownMenuItem href={appSwitch.counterpartHref}>
                              {appSwitch.current === 'studio' ? (
                                <BookOpen className="text-muted-foreground" strokeWidth={1.5} />
                              ) : (
                                <LayoutDashboard
                                  className="text-muted-foreground"
                                  strokeWidth={1.5}
                                />
                              )}
                              <span className="flex-1 truncate">
                                {appSwitch.current === 'studio' ? t`Retour au feed` : t`Studio`}
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                        </>
                      )}

                      <DropdownMenuGroup>
                        <DropdownMenuLabel>
                          {userType === 'MEDIA' ? t`Publisher` : t`Compte`}
                        </DropdownMenuLabel>
                        {/* Un seul point d’entrée vers les réglages, qui reste dans
                            l’application courante : surface sobre (bg-secondary au focus),
                            jamais d’applat vermillon. */}
                        <DropdownMenuItem
                          href={onSettingsClick ? undefined : settingsHref}
                          onAction={onSettingsClick}
                        >
                          <Settings className="text-muted-foreground" strokeWidth={1.5} />
                          <span className="flex-1 truncate">
                            {userType === 'MEDIA' ? t`Réglages du média` : t`Réglages du compte`}
                          </span>
                        </DropdownMenuItem>

                        {publicUrl && (
                          <DropdownMenuItem
                            href={publicUrl}
                            target={publicUrl.startsWith('#') ? undefined : '_blank'}
                          >
                            <ExternalLink className="text-muted-foreground" strokeWidth={1.5} />
                            <span className="flex-1 truncate">
                              {userType === 'MEDIA' ? t`Voir la publication` : t`Voir le profil`}
                            </span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>

                      {onLogout && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onAction={onLogout}>
                            <LogOut strokeWidth={1.5} />
                            <span className="flex-1 truncate">{t`Se déconnecter`}</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </SidebarFooter>
            </>
          )}
        </nav>
      </aside>
    </SidebarContext.Provider>
  );
}
