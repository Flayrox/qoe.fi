'use client';

// =====================================================================
// 📑 @qoe/ui — craft-sidebar-drawer.tsx
// =====================================================================
// Réplique exacte 1:1 de Devouring Details (devouringdetails.com)
// basée sur les captures d'écran officielles (Screenshots 1 & 2).
//
// Caractéristiques conformes au pixel près :
// 1. Fermé (Screenshot 2) : la sidebar est 100% escamotée à gauche (-translate-x-full, opacity-0, pointer-events-none)
// 2. Ouvert (Screenshot 1) : slide-in fluide depuis la gauche (translate-x-0, opacity-100, pointer-events-auto)
// 3. Titre de chapitre actif (ex: 'Behind scenes') : tiret noir étiré (34px) + libellé noir gras
// 4. Sous-titre H2 actif (ex: 'Interactive examples') : tiret orange (34px) + libellé orange accent
// 5. Tirets standards / inactifs : 18px de large, gris subtil (bg-black/15 dark:bg-white/15)
// 6. Espacements et cibles de clic (hit-areas) confortables avec h-6 flex items-center
// =====================================================================

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@qoe/utils';
import type { TemplatePublicationContext } from '../templates/schema';

export interface SidebarToggleIconProps {
  isOpen: boolean;
  className?: string;
  size?: number;
}

/**
 * Icône polymorphe exacte de Devouring Details.
 * Fenêtre avec tiret coulissant interne animé par ressort physique Framer Motion.
 */
export function SidebarToggleIcon({ isOpen, className, size = 16 }: SidebarToggleIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('transition-colors select-none shrink-0', className)}
    >
      <rect
        x="1.5"
        y="1.5"
        width="13"
        height="13"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        className="opacity-70"
      />
      <motion.rect
        initial={false}
        animate={{
          x: isOpen ? 7 : 3,
          opacity: isOpen ? 1 : 0.7,
        }}
        transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        y="3"
        width="2"
        height="10"
        rx="1"
        fill="currentColor"
      />
    </svg>
  );
}

export interface CraftDrawerItem {
  id: string;
  label: string;
  href?: string;
  number?: string | number;
  category?: string;
  isActive?: boolean;
}

export interface CraftTocHeading {
  id: string;
  label: string;
}

export interface CraftSidebarProps {
  isOpen: boolean;
  onToggle?: () => void;
  onClose?: () => void;
  title?: string;
  subtitle?: string;
  section?: string;
  side?: 'left' | 'right';
  publication?: TemplatePublicationContext;
  items: CraftDrawerItem[];
  activeId?: string;
  indicatorColor?: string;
  indicatorType?: string;
  onSelectItem?: (item: CraftDrawerItem) => void;
  className?: string;
}

export type CraftSidebarDrawerProps = CraftSidebarProps;

/**
 * Graduation de tiret Devouring Details.
 * Repos : 18px
 * Actif / Surligné : 34px
 */
function PlatformTick({
  width = 18,
  isActive = false,
  isAccent = false,
  indicatorColor = '#F97316',
  className = '',
}: {
  width?: number;
  isActive?: boolean;
  isAccent?: boolean;
  indicatorColor?: string;
  className?: string;
}) {
  const effectiveWidth = isActive ? 34 : width;

  return (
    <span
      className={cn(
        'platform_tick inline-block h-[1.5px] rounded-full transition-all duration-200 shrink-0 ease-[cubic-bezier(0.23,1,0.32,1)]',
        isAccent
          ? 'shadow-2xs'
          : isActive
            ? 'bg-foreground'
            : 'bg-black/20 dark:bg-white/20 group-hover:bg-foreground/60',
        className
      )}
      style={{
        width: `${effectiveWidth}px`,
        backgroundColor: isAccent ? indicatorColor : undefined,
      }}
      aria-hidden="true"
    />
  );
}

/**
 * Sidebar Devouring Details conforme aux Screenshots 1 & 2.
 */
export function CraftSidebarDrawer({
  isOpen,
  title,
  side = 'left',
  items = [],
  activeId,
  indicatorColor = '#F97316',
  onSelectItem,
  className = '',
}: CraftSidebarProps) {
  const [headings, setHeadings] = useState<CraftTocHeading[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  const isLeft = side === 'left';

  // Extraction dynamique des sections H2 de l'article actif
  useEffect(() => {
    const scanHeadings = () => {
      const headingElements = Array.from(
        document.querySelectorAll('#article-content h2, article h2, [data-slide-title="true"]')
      );

      if (headingElements.length === 0) {
        setHeadings([]);
        return;
      }

      const extracted: CraftTocHeading[] = headingElements.map((el, idx) => {
        let id = el.id || el.closest('section')?.id;
        if (!id) {
          id = `section-${idx}-${(el.textContent || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 30)}`;
          el.id = id;
        }
        return {
          id,
          label: el.textContent?.trim() || `Section ${idx + 1}`,
        };
      });

      setHeadings(extracted);
      // Par défaut, première section active si aucune détectée
      if (extracted.length > 0 && !activeHeadingId) {
        setActiveHeadingId(extracted[0].id);
      }
    };

    scanHeadings();
    const timer = setTimeout(scanHeadings, 300);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeadingId(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-15% 0px -65% 0px' }
    );

    const elementsToObserve = document.querySelectorAll(
      '#article-content h2, article h2, section[id]'
    );
    elementsToObserve.forEach((el) => observer.observe(el));

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [activeId]);

  // Regroupement des chapitres par rubrique
  const categoriesMap = new Map<string, CraftDrawerItem[]>();

  items.forEach((item) => {
    const cat = item.category || 'Chapitres';
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, []);
    }
    categoriesMap.get(cat)!.push(item);
  });

  if (categoriesMap.size === 0) {
    categoriesMap.set('Articles', [
      {
        id: 'current',
        label: title || 'Article en cours',
        isActive: true,
      },
    ]);
  }

  const categoryEntries = Array.from(categoriesMap.entries());

  return (
    <aside
      tabIndex={0}
      aria-hidden={!isOpen}
      data-open={isOpen ? 'true' : 'false'}
      className={cn(
        'platform_sidebar fixed top-0 bottom-0 z-30 flex flex-col select-none transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
        isLeft ? 'left-6 sm:left-10 items-start' : 'right-6 sm:right-10 items-end',
        isOpen
          ? 'translate-x-0 opacity-100 pointer-events-auto'
          : isLeft
            ? '-translate-x-full opacity-0 pointer-events-none'
            : 'translate-x-full opacity-0 pointer-events-none',
        className
      )}
    >
      <div className="my-auto flex flex-col gap-1.5 max-h-[85vh] overflow-y-auto no-scrollbar py-8 w-[240px] sm:w-[260px]">
        {categoryEntries.map(([categoryName, categoryItems], catIdx) => (
          <React.Fragment key={categoryName}>
            {/* 6 tirets intercalaires séparateurs de catégorie majeure */}
            {catIdx > 0 && (
              <div className="flex flex-col gap-1.5 py-1">
                <PlatformTick width={18} />
                <PlatformTick width={18} />
                <PlatformTick width={18} />
                <PlatformTick width={18} />
                <PlatformTick width={18} />
                <PlatformTick width={18} />
              </div>
            )}

            {/* Titre de catégorie (Primary) */}
            <div
              className="platform_link relative flex items-center gap-[10px] group cursor-default h-6"
              data-variant="primary"
              data-disabled="true"
            >
              <PlatformTick width={18} />
              <span
                className="platform_label text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/60 select-none whitespace-nowrap truncate"
                data-variant="primary"
              >
                {categoryName}
              </span>
            </div>

            {/* 2 tirets intercalaires sous la catégorie */}
            <PlatformTick width={18} />
            <PlatformTick width={18} />

            {/* Chapitres / Articles */}
            {categoryItems.map((item, itemIdx) => {
              const isChapterActive = item.isActive || item.id === activeId;
              const hasHref = Boolean(item.href);

              return (
                <React.Fragment key={item.id}>
                  {itemIdx > 0 && (
                    <>
                      <PlatformTick width={18} />
                      <PlatformTick width={18} />
                    </>
                  )}

                  {hasHref ? (
                    <a
                      href={item.href}
                      onClick={(e) => {
                        if (onSelectItem) {
                          e.preventDefault();
                          onSelectItem(item);
                        }
                      }}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      className="platform_link relative flex items-center gap-[10px] group cursor-pointer h-6"
                      data-variant="secondary"
                      data-disabled="false"
                      data-active={isChapterActive ? 'true' : 'false'}
                      data-interactive="true"
                      tabIndex={0}
                    >
                      <PlatformTick
                        width={18}
                        isActive={isChapterActive || hoveredItemId === item.id}
                        isAccent={false}
                      />
                      <span
                        className={cn(
                          'platform_label text-[13px] tracking-tight whitespace-nowrap transition-colors truncate',
                          isChapterActive
                            ? 'text-foreground font-semibold'
                            : 'text-muted-foreground/80 group-hover:text-foreground'
                        )}
                        data-variant="secondary"
                      >
                        {item.label}
                      </span>
                    </a>
                  ) : (
                    <div
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      onClick={() => onSelectItem?.(item)}
                      className="platform_link relative flex items-center gap-[10px] group cursor-pointer h-6"
                      data-variant="secondary"
                      data-disabled="false"
                      data-active={isChapterActive ? 'true' : 'false'}
                      data-interactive="true"
                      tabIndex={0}
                    >
                      <PlatformTick
                        width={18}
                        isActive={isChapterActive || hoveredItemId === item.id}
                        isAccent={false}
                      />
                      <span
                        className={cn(
                          'platform_label text-[13px] tracking-tight whitespace-nowrap transition-colors truncate',
                          isChapterActive
                            ? 'text-foreground font-semibold'
                            : 'text-muted-foreground/80 group-hover:text-foreground'
                        )}
                        data-variant="secondary"
                      >
                        {item.label}
                      </span>
                    </div>
                  )}

                  {/* Sous-titres H2 de l'article actif (ex: 'Interactive examples' en orange) */}
                  {isChapterActive && headings.length > 0 && (
                    <div className="flex flex-col gap-1.5 pl-0.5">
                      {headings.map((heading) => {
                        const isHeadingActive = activeHeadingId === heading.id;

                        return (
                          <React.Fragment key={heading.id}>
                            <PlatformTick width={18} />
                            <PlatformTick width={18} />

                            <a
                              href={`#${heading.id}`}
                              onMouseEnter={() => setHoveredItemId(heading.id)}
                              onMouseLeave={() => setHoveredItemId(null)}
                              onClick={(e) => {
                                e.preventDefault();
                                const el = document.getElementById(heading.id);
                                if (el) {
                                  el.scrollIntoView({ behavior: 'smooth' });
                                  setActiveHeadingId(heading.id);
                                }
                              }}
                              className="platform_link relative flex items-center gap-[10px] group cursor-pointer h-6"
                              data-variant="secondary"
                              data-disabled="false"
                              data-active={isHeadingActive ? 'true' : 'false'}
                              data-interactive="true"
                              tabIndex={0}
                            >
                              <PlatformTick
                                width={18}
                                isActive={isHeadingActive}
                                isAccent={isHeadingActive}
                                indicatorColor={indicatorColor}
                              />
                              <span
                                className={cn(
                                  'platform_label text-[13px] tracking-tight whitespace-nowrap transition-colors truncate',
                                  isHeadingActive
                                    ? 'font-medium'
                                    : 'text-muted-foreground/75 group-hover:text-foreground'
                                )}
                                style={{
                                  color: isHeadingActive ? indicatorColor : undefined,
                                }}
                                data-variant="secondary"
                              >
                                {heading.label}
                              </span>
                            </a>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </aside>
  );
}
