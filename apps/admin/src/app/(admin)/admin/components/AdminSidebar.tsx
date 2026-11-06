'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@qoe/utils';
import { navByDomain, normalizeCapabilities, type AdminCapability } from '@/lib/admin-console';

// =====================================================================
// 🧭 AdminSidebar — la navigation suit les capacités, pas l'ordre alphabétique
// =====================================================================
// Chaque entrée déclare la capacité qui l'ouvre (lib/admin-console) : une entrée
// dont la capacité manque N'EST PAS rendue. Masquer n'autorise rien — le garde
// HTTP du Go reste l'autorité — mais proposer un écran qui répondra 403 est un
// mensonge d'interface.
//
// Les domaines deviennent des sections : pilotage, confiance & sécurité,
// support & communauté, croissance & communication, produit & contenu,
// conformité & plateforme. Un compte `legal` ne voit que ce qu'il peut faire.
// =====================================================================

export interface AdminSidebarProps {
  identity: {
    roles: string[];
    capabilities: string[];
  };
}

export function AdminSidebar({ identity }: AdminSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const capabilities = useMemo<AdminCapability[]>(
    () => normalizeCapabilities(identity?.capabilities),
    [identity?.capabilities]
  );
  const sections = useMemo(() => navByDomain(capabilities), [capabilities]);

  return (
    <aside className="w-full shrink-0 p-4 md:sticky md:top-6 md:flex md:h-[calc(100vh-3rem)] md:w-[260px] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:p-10 lg:top-8 lg:h-[calc(100vh-4rem)] lg:w-[300px] lg:p-12">
      <div className="flex items-center justify-between gap-3 md:mb-10 md:block">
        <Link
          href="/admin"
          className="flex items-baseline gap-2 text-white transition-opacity hover:opacity-80"
          data-testid="admin-sidebar-home"
        >
          <span className="text-xl font-bold tracking-tight">qoefi</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
            Console
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="admin-navigation"
          className="rounded-full border border-white/25 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 md:hidden"
        >
          {mobileOpen ? 'Fermer' : 'Menu'}
        </button>
      </div>

      <div
        className={cn(
          'md:mt-0 md:flex md:flex-1 md:flex-col',
          mobileOpen ? 'mt-6 flex flex-col' : 'hidden'
        )}
      >
        <nav
          id="admin-navigation"
          className="flex flex-1 flex-col gap-7"
          aria-label="Navigation de la console"
        >
          {sections.length === 0 ? (
            <p className="text-xs font-medium text-white/60" data-testid="admin-sidebar-empty">
              Aucun écran accessible avec vos rôles actuels.
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.domain} data-testid={`admin-sidebar-domain-${section.domain}`}>
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
                  {section.label}
                </h2>
                <div className="mt-2 flex flex-col gap-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.description}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`admin-nav-${item.href.replace(/\//g, '-')}`}
                        className={cn(
                          'group -mx-3 flex items-center rounded-xl px-3 py-2 transition-colors duration-200',
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:bg-white/5 hover:text-white'
                        )}
                      >
                        <span className="text-sm font-medium tracking-tight">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </nav>

        <div className="mt-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
              Vos rôles
            </span>
            <div className="flex flex-wrap gap-1.5" data-testid="admin-sidebar-roles">
              {identity?.roles?.length ? (
                identity.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80"
                  >
                    {role}
                  </span>
                ))
              ) : (
                <span className="text-[10px] font-medium text-white/60">aucun rôle</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href="/admin/forbidden"
              className="text-xs font-medium text-white/60 transition-colors hover:text-white"
              data-testid="admin-sidebar-my-access"
            >
              Mon accès
            </Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
