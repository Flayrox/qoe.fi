'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@qoe/utils';
import { motion } from 'framer-motion';
import { navByDomain, normalizeCapabilities, type AdminCapability } from '@/lib/admin-console';

// =====================================================================
// 🧭 AdminSidebar — la navigation suit les capacités, pas l'ordre alphabétique
// =====================================================================
// Chaque entrée déclare la capacité qui l'ouvre (lib/admin-console) : une entrée
// dont la capacité manque N'EST PAS rendue. Masquer n'autorise rien — le garde
// HTTP du Go reste l'autorité — mais proposer un écran qui répondra 403 est un
// mensonge d'interface.
//
// Les domaines deviennent des sections : modération, communauté, produit,
// plateforme, pilotage. Un compte `legal` ne voit que ce qu'il peut faire.
// =====================================================================

export interface AdminSidebarProps {
  identity: {
    roles: string[];
    capabilities: string[];
  };
}

export function AdminSidebar({ identity }: AdminSidebarProps) {
  const pathname = usePathname();
  const capabilities = useMemo<AdminCapability[]>(
    () => normalizeCapabilities(identity?.capabilities),
    [identity?.capabilities]
  );
  const sections = useMemo(() => navByDomain(capabilities), [capabilities]);

  return (
    <aside className="w-full md:w-[260px] lg:w-[300px] flex flex-col shrink-0 p-8 md:p-10 lg:p-12 sticky top-0 md:top-6 lg:top-8 h-screen md:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden">
      <div className="mb-10">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-white hover:opacity-80 transition-opacity"
          data-testid="admin-sidebar-home"
        >
          <span className="font-bold text-xl tracking-tight">qoefi</span>
        </Link>
      </div>

      <nav className="flex-1 flex flex-col gap-7" aria-label="Navigation de la console">
        {sections.length === 0 ? (
          <p className="text-xs font-medium text-white/50" data-testid="admin-sidebar-empty">
            Aucun écran accessible avec vos rôles actuels.
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.domain} data-testid={`admin-sidebar-domain-${section.domain}`}>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                {section.label}
              </h2>
              <div className="mt-3 flex flex-col gap-3">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={item.description}
                      data-testid={`admin-nav-${item.href.replace(/\//g, '-')}`}
                      className={cn(
                        'relative group flex items-center transition-colors duration-300',
                        isActive ? 'text-white' : 'text-white/50 hover:text-white/80'
                      )}
                    >
                      <span className="text-sm font-medium tracking-tight">{item.label}</span>

                      {isActive && (
                        <motion.div
                          layoutId="active-nav-indicator"
                          className="absolute -left-5 w-1 h-1 bg-white rounded-full"
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </nav>

      <div className="mt-12 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
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
              <span className="text-[10px] font-medium text-white/50">aucun rôle</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/docs"
            className="text-xs font-medium text-white/40 hover:text-white/80 transition-colors"
          >
            Documentation API
          </Link>
          <Link
            href="/admin/forbidden"
            className="text-xs font-medium text-white/40 hover:text-white/80 transition-colors"
            data-testid="admin-sidebar-my-access"
          >
            Mon accès
          </Link>
        </div>
      </div>
    </aside>
  );
}
