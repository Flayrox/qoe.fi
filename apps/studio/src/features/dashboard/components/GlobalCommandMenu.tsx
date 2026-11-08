'use client';

import { useCommandMenu } from '@qoe/ui';
import { CmdKDialog, CmdKInput, CmdKList, CmdKGroup, CmdKItem } from '@qoe/ui';
import { settingsTree, flattenSettingsTree } from '../../settings/config/settingsTree';
import { useState, useEffect, useMemo, type ComponentType } from 'react';
import { useDebounce } from 'use-debounce';
import { searchAllAction } from '@qoe/sdk/actions/search';
import { getCmdKSurfaces, type SurfaceDescriptor } from '@qoe/config';
import { t } from '@lingui/core/macro';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Plus,
  FileText,
  Users,
  Mail,
  PieChart,
  Settings,
  Sun,
  Moon,
  FileCode2,
  Sliders,
  Home,
  Building2,
  Wallet,
  Bell,
  Code,
  Compass,
} from 'lucide-react';

// Icônes et sections résolues depuis le manifeste de surfaces : aucune route
// ni libellé d'action n'est recopié ici.
const SURFACE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Home,
  Plus,
  FileText,
  Mail,
  Users,
  PieChart,
  Building2,
  Wallet,
  Bell,
  Code,
  Settings,
  Compass,
};

const SECTION_LABELS: Record<SurfaceDescriptor['section'], string> = {
  navigation: t`Navigation`,
  library: t`Bibliothèque`,
  creation: t`Création`,
  growth: t`Croissance`,
  workspace: t`Espace de travail`,
  system: t`Système`,
};

export interface MeiliSearchResult {
  id: string;
  title: string;
  slug: string;
  content: string;
}

export function GlobalCommandMenu({ permissions }: { permissions?: string[] }) {
  const { isOpen, setIsOpen } = useCommandMenu();
  const router = useRouter();
  const { setTheme } = useTheme();

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<MeiliSearchResult[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  // Parse items
  const items = useMemo(() => {
    return flattenSettingsTree(settingsTree);
  }, []);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      setIsFetching(false);
      return;
    }

    let isMounted = true;

    async function fetchResults() {
      setIsFetching(true);
      try {
        const result = await searchAllAction({
          query: trimmed,
          type: 'articles',
          limit: 10,
          scope: 'mine',
        });
        if (isMounted) {
          if (result.ok) {
            setSearchResults(
              result.data.articles.map((article) => ({
                id: article.id,
                title: article.title ?? '',
                slug: article.slug ?? '',
                content: article.content ?? '',
              }))
            );
          } else {
            setSearchResults([]);
          }
        }
      } catch {
        if (isMounted) setSearchResults([]);
      } finally {
        if (isMounted) setIsFetching(false);
      }
    }

    fetchResults();

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  const handleSelect = (path: string) => {
    setIsOpen(false);
    setQuery('');

    // Allow animation to finish
    setTimeout(() => {
      router.push(path);
      if (path.includes('#')) {
        const hash = path.split('#')[1];
        window.dispatchEvent(new CustomEvent('cmdKNavigate', { detail: { hash } }));
      }
    }, 150);
  };

  const quickActions = useMemo(
    () =>
      getCmdKSurfaces('studio', permissions).map((surface) => ({
        id: surface.id,
        label: surface.defaultLabel,
        path: surface.path,
        icon: SURFACE_ICONS[surface.iconName] ?? FileText,
        category: SECTION_LABELS[surface.section],
      })),
    [permissions]
  );

  return (
    <CmdKDialog open={isOpen} onOpenChange={setIsOpen}>
      <CmdKInput
        value={query}
        onValueChange={setQuery}
        placeholder={t`Rechercher des écrits, réglages, actions...`}
        onEscape={() => setIsOpen(false)}
      />

      <CmdKList emptyText={isFetching ? t`Recherche en cours...` : t`Aucun résultat trouvé.`}>
        {/* Only show default UI if there's no query, or if it's very short */}
        {debouncedQuery.length < 2 && (
          <>
            <CmdKGroup heading={t`Raccourcis de la console`}>
              {quickActions.map((action) => (
                <CmdKItem
                  key={action.id}
                  icon={action.icon}
                  label={action.label}
                  category={action.category}
                  onSelect={() => handleSelect(action.path)}
                />
              ))}
            </CmdKGroup>

            <CmdKGroup heading={t`Préférences visuelles`}>
              <CmdKItem
                icon={Sun}
                label={t`Passer en Mode Clair`}
                category={t`Thème`}
                onSelect={() => {
                  setTheme('light');
                  setIsOpen(false);
                }}
              />
              <CmdKItem
                icon={Moon}
                label={t`Passer en Mode Sombre`}
                category={t`Thème`}
                onSelect={() => {
                  setTheme('dark');
                  setIsOpen(false);
                }}
              />
            </CmdKGroup>
          </>
        )}

        {searchResults.length > 0 && (
          <CmdKGroup heading={t`Articles & Brouillons`}>
            {searchResults.map((article) => (
              <CmdKItem
                key={article.id}
                icon={FileCode2}
                label={article.title}
                subtitle={article.content?.replace(/<[^>]*>?/gm, '')}
                category={t`Article`}
                onSelect={() => handleSelect(`/articles/${article.id}`)}
              />
            ))}
          </CmdKGroup>
        )}

        {items.length > 0 && (
          <CmdKGroup heading={t`Réglages du Studio`}>
            {items.map((item) => {
              const displayTitle = item.label();
              const breadcrumbStr = item.breadcrumbLabels?.length
                ? item.breadcrumbLabels.join(' → ')
                : undefined;
              return (
                <CmdKItem
                  key={item.id}
                  value={`${displayTitle} ${item.keywordsKey?.join(' ') || ''}`}
                  icon={Sliders}
                  label={displayTitle}
                  subtitle={breadcrumbStr}
                  category={t`Réglage`}
                  onSelect={() => handleSelect(item.path)}
                />
              );
            })}
          </CmdKGroup>
        )}
      </CmdKList>
    </CmdKDialog>
  );
}
