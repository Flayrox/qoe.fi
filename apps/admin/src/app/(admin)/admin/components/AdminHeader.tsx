'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SafeAvatar } from '@qoe/ui';
import { Button } from '@qoe/ui/button';
import { Icon } from '@qoe/ui/icons';
import { Kbd } from '@qoe/ui/kbd';
import { ADMIN_CAPABILITY_DOMAINS, ADMIN_DOMAIN_LABELS, navItemForPath } from '@/lib/admin-console';
import { DENSITY } from '@/components/shell/tokens';

interface AdminHeaderUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
}

interface AdminHeaderProps {
  user: AdminHeaderUser | null;
  /** Rôles réellement attribués (le header ne suppose plus « superadmin »). */
  roles?: readonly string[];
  /** Environnement servi — un opérateur doit voir sur quelle plateforme il agit. */
  environment?: 'local' | 'production';
}

// =====================================================================
// ⇧ AdminHeader — 44 px : fil d'Ariane, palette, environnement, compte
// =====================================================================
// Une barre, pas une pastille flottante : le fil d'Ariane dit où l'on est, le
// badge d'environnement dit sur quoi on agit, et ⌘K reste à un clic.
// =====================================================================

export function AdminHeader({ user, roles = [], environment = 'production' }: AdminHeaderProps) {
  const pathname = usePathname() ?? '';
  const navItem = navItemForPath(pathname);
  const domain = navItem ? ADMIN_CAPABILITY_DOMAINS[navItem.capability] : null;

  const openCommandPalette = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
      })
    );
  };

  return (
    <header
      className={`flex ${DENSITY.header} shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4`}
    >
      <nav
        aria-label="Fil d’Ariane"
        className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground"
      >
        <Link href="/admin" className="shrink-0 transition-colors hover:text-foreground">
          Console
        </Link>
        {domain && (
          <>
            <Icon name="chevron-right" size="sm" className="shrink-0 opacity-60" aria-hidden />
            <span className="truncate">{ADMIN_DOMAIN_LABELS[domain]}</span>
          </>
        )}
        {navItem && (
          <>
            <Icon name="chevron-right" size="sm" className="shrink-0 opacity-60" aria-hidden />
            <span className="truncate font-medium text-foreground">{navItem.label}</span>
          </>
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={openCommandPalette}
          aria-label="Ouvrir la palette de commandes"
          aria-haspopup="dialog"
          data-testid="admin-open-command-palette"
          className="h-7 gap-1.5 px-2 text-[11px] font-normal text-muted-foreground"
        >
          <Icon name="search" size="sm" aria-hidden />
          <span className="hidden sm:inline">Rechercher</span>
          <span className="hidden sm:inline-flex">
            <Kbd size="xs">⌘K</Kbd>
          </span>
        </Button>

        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
            environment === 'production'
              ? 'border-border bg-muted text-muted-foreground'
              : 'border-highlight/40 bg-highlight/10 text-highlight'
          }`}
          title={
            environment === 'production' ? 'Environnement de production' : 'Environnement local'
          }
        >
          {environment}
        </span>

        {roles.length > 0 && (
          <div
            className="hidden items-center gap-1 md:flex"
            data-testid="admin-header-roles"
            title={`Rôles attribués : ${roles.join(', ')}`}
          >
            {roles.slice(0, 2).map((role) => (
              <span
                key={role}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {role}
              </span>
            ))}
            {roles.length > 2 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                +{roles.length - 2}
              </span>
            )}
          </div>
        )}

        <Link
          href="/admin/forbidden"
          aria-label="Voir mon accès"
          title={user?.email || 'Mon accès'}
          className="block rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight/40"
          data-testid="admin-header-avatar"
        >
          <SafeAvatar name={user?.name} username={user?.username} size={26} shape="circle" />
        </Link>
      </div>
    </header>
  );
}
