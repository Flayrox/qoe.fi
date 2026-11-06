'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@qoe/utils';
import { navByDomain, normalizeCapabilities, type AdminCapability } from '@/lib/admin-console';
import { DENSITY } from '@/components/shell/tokens';
import { ADMIN_NAV_ICONS } from './nav-icons';

// =====================================================================
// 🧭 AdminSidebar — la navigation suit les capacités, pas l'ordre alphabétique
// =====================================================================
// Chaque entrée déclare la capacité qui l'ouvre (lib/admin-console) : une entrée
// dont la capacité manque N'EST PAS rendue. Masquer n'autorise rien — le garde
// HTTP du Go reste l'autorité — mais proposer un écran qui répondra 403 est un
// mensonge d'interface.
//
// Densité d'exploitation : 232 px, entrées de 32 px, icône de 16 px et compteur
// de file. Pas de padding de page marketing.
// =====================================================================

export interface AdminSidebarProps {
  identity: {
    roles: string[];
    capabilities: string[];
  };
  /** Compteur par route de file (clé = `href` de l'entrée). */
  queueCounts?: Record<string, number>;
}

export function AdminSidebar({ identity, queueCounts = {} }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const capabilities = useMemo<AdminCapability[]>(
    () => normalizeCapabilities(identity?.capabilities),
    [identity?.capabilities]
  );
  const sections = useMemo(() => navByDomain(capabilities), [capabilities]);

  return (
    <aside
      className={cn(
        'w-full shrink-0 border-b border-border bg-muted/30 md:h-screen md:border-r md:border-b-0',
        DENSITY.sidebar
      )}
    >
      <div className="flex h-11 items-center justify-between gap-2 border-b border-border px-3">
        <Link
          href="/admin"
          className="flex items-baseline gap-1.5 transition-opacity hover:opacity-80"
          data-testid="admin-sidebar-home"
        >
          <span className="text-[13px] font-semibold tracking-tight">qoefi</span>
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            console
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="admin-navigation"
          aria-label={mobileOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'}
          className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground md:hidden"
        >
          {mobileOpen ? (
            <X className="size-4" aria-hidden />
          ) : (
            <Menu className="size-4" aria-hidden />
          )}
        </button>
      </div>

      <div
        className={cn(
          'flex flex-col md:h-[calc(100%-2.75rem)]',
          mobileOpen ? 'flex' : 'hidden md:flex'
        )}
      >
        <nav
          id="admin-navigation"
          aria-label="Navigation de la console"
          className="flex-1 overflow-y-auto px-2 py-3"
        >
          {sections.length === 0 ? (
            <p
              className="px-2 py-2 text-[12px] text-muted-foreground"
              data-testid="admin-sidebar-empty"
            >
              Aucun écran accessible avec vos rôles actuels.
            </p>
          ) : (
            sections.map((section) => (
              <section
                key={section.domain}
                className="mb-4 last:mb-0"
                data-testid={`admin-sidebar-domain-${section.domain}`}
              >
                <h2 className={cn(DENSITY.navSection, 'text-muted-foreground')}>{section.label}</h2>
                <div className="mt-1 space-y-px">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const Icon = ADMIN_NAV_ICONS[item.href];
                    const count = queueCounts[item.href] ?? 0;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.description}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`admin-nav-${item.href.replace(/\//g, '-')}`}
                        className={cn(
                          'flex items-center',
                          DENSITY.navItem,
                          isActive
                            ? 'bg-background font-medium text-foreground shadow-xs'
                            : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                        )}
                      >
                        {Icon ? (
                          <Icon className={DENSITY.navIcon} aria-hidden />
                        ) : (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                            aria-hidden
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                        {count > 0 && (
                          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </nav>

        <div className="border-t border-border px-3 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Vos rôles
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1" data-testid="admin-sidebar-roles">
            {identity?.roles?.length ? (
              identity.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {role}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-muted-foreground">aucun rôle</span>
            )}
          </div>
          <Link
            href="/admin/forbidden"
            className="mt-2 block text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            data-testid="admin-sidebar-my-access"
          >
            Mon accès
          </Link>
        </div>
      </div>
    </aside>
  );
}
