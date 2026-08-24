import React from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowLeft } from 'lucide-react';
import type { NavigationItem, SocialLink } from '@qoe/api-client/types';
import { SocialIcon } from './SocialIcon';

// Define the nested type since Prisma returns flat by default without includes
type NavItemWithChildren = NavigationItem & { children?: NavigationItem[] };

interface TenantHeaderProps {
  name: string | null;
  domain: string;
  logoUrl: string | null;
  layoutStyle: string | null;
  stripeAccountId: string | null;
  supportUrl: string | null;
  navigation: NavItemWithChildren[];
  socialLinks: SocialLink[];
  isArticlePage?: boolean;
}

export function TenantHeader({
  name,
  domain,
  logoUrl,
  layoutStyle,
  stripeAccountId,
  supportUrl,
  navigation,
  socialLinks,
  isArticlePage = false,
}: TenantHeaderProps) {
  const isBrutalist = layoutStyle === 'brutalist';
  const isMagazine = layoutStyle === 'magazine';

  const headerClasses = isBrutalist
    ? 'border-b-4 border-foreground py-6 md:py-8 bg-background relative z-50'
    : isMagazine && !isArticlePage
      ? 'border-b py-6 md:py-8 bg-card shadow-sm relative z-50'
      : 'border-b py-4 md:py-6 bg-card/80 backdrop-blur-md sticky top-0 z-50 transition-colors';

  const supportLink = stripeAccountId ? `/support` : supportUrl || null;

  // Filter top level nav items (those without a parent)
  const topLevelNav = navigation.filter((n) => !n.parentId);

  // Map children to their parents
  const nestedNav = topLevelNav
    .map((parent) => ({
      ...parent,
      children: navigation
        .filter((n) => n.parentId === parent.id)
        .sort((a, b) => a.order - b.order),
    }))
    .sort((a, b) => a.order - b.order);

  return (
    <header className={headerClasses}>
      <div
        className={`container mx-auto px-4 lg:px-8 flex items-center justify-between ${isArticlePage ? 'max-w-5xl' : ''}`}
      >
        <div className="flex items-center gap-4">
          {isArticlePage && (
            <Link
              href="/"
              className={`flex items-center gap-1.5 text-sm font-medium mr-4 text-muted-foreground hover:text-foreground transition-all hover:-translate-x-1 ${isBrutalist ? 'uppercase tracking-wider font-bold text-foreground' : ''}`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back</span>
            </Link>
          )}

          <Link href="/" className="flex items-center gap-4 group">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={`${name} logo`}
                className={`object-cover ${isBrutalist ? 'w-12 h-12 md:w-16 md:h-16 border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] group-hover:translate-x-1 group-hover:translate-y-1 group-hover:shadow-none transition-all' : 'w-10 h-10 md:w-14 md:h-14 rounded-xl shadow-md group-hover:opacity-80 transition-opacity'}`}
              />
            )}
            <h1
              className={`text-xl md:text-2xl lg:text-3xl tracking-tight ${isBrutalist ? 'font-black uppercase' : 'font-extrabold'}`}
            >
              {name || domain}
            </h1>
          </Link>
        </div>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex items-center gap-6 font-medium text-sm text-muted-foreground">
            {nestedNav.map((nav: NavItemWithChildren) => {
              const hasChildren = nav.children && nav.children.length > 0;

              if (hasChildren) {
                return (
                  <div key={nav.id} className="relative group/nav">
                    <button className="flex items-center gap-1 hover:text-foreground hover:text-[var(--tenant-accent)] transition-colors py-2">
                      {nav.label}
                      <ChevronDown className="w-4 h-4 transition-transform duration-200 group-hover/nav:rotate-180" />
                    </button>
                    {/* Dropdown Menu */}
                    <div className="absolute top-full left-0 pt-2 opacity-0 translate-y-2 pointer-events-none group-hover/nav:opacity-100 group-hover/nav:translate-y-0 group-hover/nav:pointer-events-auto transition-all duration-200 w-48 z-50">
                      <div
                        className={`flex flex-col overflow-hidden ${isBrutalist ? 'border-2 border-foreground bg-background shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]' : 'bg-card border rounded-xl shadow-lg'}`}
                      >
                        {nav.children!.map((child: NavigationItem) => (
                          <Link
                            key={child.id}
                            href="/"
                            target={child.isExternal ? '_blank' : '_self'}
                            className={`block px-4 py-3 hover:bg-[var(--tenant-accent)]/10 hover:text-[var(--tenant-accent)] transition-colors ${isBrutalist ? 'border-b-2 border-foreground last:border-0 font-bold uppercase text-xs' : ''}`}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={nav.id}
                  href="/"
                  target={nav.isExternal ? '_blank' : '_self'}
                  className="hover:text-foreground hover:text-[var(--tenant-accent)] transition-colors py-2 block"
                >
                  {nav.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-4 border-l pl-4 md:pl-6 ml-2">
            {socialLinks.slice(0, 3).map((social: SocialLink) => (
              <Link
                key={social.id}
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-[var(--tenant-accent)] hover:scale-110 transition-all hidden lg:block"
              >
                <SocialIcon platform={social.platform} className="w-5 h-5" />
              </Link>
            ))}

            {supportLink && (
              <Link
                href="/"
                target={supportUrl && !stripeAccountId ? '_blank' : '_self'}
                className={`px-4 py-2 text-sm font-semibold text-white transition-all whitespace-nowrap ${isBrutalist ? 'border-2 border-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:translate-y-px hover:shadow-none' : 'rounded-full hover:opacity-90 active:scale-95'}`}
                style={{ backgroundColor: 'var(--tenant-accent)' }}
              >
                Support Us
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
