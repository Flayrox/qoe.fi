'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { t } from '@lingui/core/macro';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useDebounce } from 'use-debounce';
import { URLS } from '@qoe/config';
import { CmdKDialog, CmdKInput, CmdKList, CmdKGroup, CmdKItem } from './CommandPrimitives';

// Keep types for legacy compat during migration
export interface MeiliSearchResult {
  id: string;
  title: string;
  slug: string;
  content: string;
}

export interface SearchItem {
  id: string;
  titleKey: string;
  label: string;
  keywordsKey?: string[];
  path: string;
  breadcrumbs?: string[];
  breadcrumbLabels?: string[];
}

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SearchItem[];
}

/**
 * @deprecated Use CmdKPrimitives directly to build your own CommandMenu
 * We kept this here so we don't break existing apps, but apps should use CmdKDialog, CmdKInput, etc.
 */
export function CommandMenu({ open, onOpenChange, items }: CommandMenuProps) {
  const router = useRouter();
  const { setTheme } = useTheme();

  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<MeiliSearchResult[]>([]);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setSearchResults([]);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();

    async function fetchResults() {
      try {
        const searchUrl = `${URLS.API}/search/articles?q=${encodeURIComponent(trimmed)}`;
        const res = await fetch(searchUrl, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.hits) {
            setSearchResults(data.hits);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setSearchResults([]);
        }
      }
    }

    fetchResults();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [debouncedQuery]);

  const handleSelect = (path: string) => {
    onOpenChange(false);
    setQuery('');
    setTimeout(() => {
      router.push(path);
      if (path.includes('#')) {
        const hash = path.split('#')[1];
        window.dispatchEvent(new CustomEvent('cmdKNavigate', { detail: { hash } }));
      }
    }, 150);
  };

  const quickActions = [
    {
      id: 'action-new-article',
      label: t`Rédiger un article`,
      path: '/articles/new',
      icon: Plus,
      category: t`Action`,
    },
    {
      id: 'action-articles',
      label: t`Liste des écrits`,
      path: '/articles',
      icon: FileText,
      category: t`Écrits`,
    },
    {
      id: 'action-audience',
      label: t`Gérer l'audience`,
      path: '/audience',
      icon: Users,
      category: t`Audience`,
    },
    {
      id: 'action-newsletters',
      label: t`Envoyer une newsletter`,
      path: '/newsletters',
      icon: Mail,
      category: t`Diffusion`,
    },
    {
      id: 'action-analytics',
      label: t`Consulter les statistiques`,
      path: '/analytics',
      icon: PieChart,
      category: t`Analyses`,
    },
    {
      id: 'action-settings',
      label: t`Réglages de la console`,
      path: '/settings',
      icon: Settings,
      category: t`Réglages`,
    },
  ];

  return (
    <CmdKDialog open={open} onOpenChange={onOpenChange}>
      <CmdKInput
        value={query}
        onValueChange={setQuery}
        placeholder={t`Rechercher des écrits, réglages, actions...`}
        onEscape={() => onOpenChange(false)}
      />

      <CmdKList emptyText={t`Aucun résultat trouvé.`}>
        <CmdKGroup heading={t`Préférences visuelles`}>
          <CmdKItem
            icon={Sun}
            label={t`Passer en Mode Clair`}
            category={t`Thème`}
            onSelect={() => {
              setTheme('light');
              onOpenChange(false);
            }}
          />
          <CmdKItem
            icon={Moon}
            label={t`Passer en Mode Sombre`}
            category={t`Thème`}
            onSelect={() => {
              setTheme('dark');
              onOpenChange(false);
            }}
          />
        </CmdKGroup>

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
              const displayTitle = item.label;
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
