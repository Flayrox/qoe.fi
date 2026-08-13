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
import { useTranslate } from '@qoe/i18n';
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
  const { t } = useTranslate();
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
      label: t('ask_action_new', 'Rédiger un article'),
      path: '/articles/new',
      icon: Plus,
      category: 'Action',
    },
    {
      id: 'action-articles',
      label: t('ask_action_articles', 'Liste des écrits'),
      path: '/articles',
      icon: FileText,
      category: 'Écrits',
    },
    {
      id: 'action-audience',
      label: t('ask_action_audience', "Gérer l'audience"),
      path: '/audience',
      icon: Users,
      category: 'Audience',
    },
    {
      id: 'action-newsletters',
      label: t('ask_action_newsletters', 'Envoyer une newsletter'),
      path: '/newsletters',
      icon: Mail,
      category: 'Diffusion',
    },
    {
      id: 'action-analytics',
      label: t('ask_action_analytics', 'Consulter les statistiques'),
      path: '/analytics',
      icon: PieChart,
      category: 'Analyses',
    },
    {
      id: 'action-settings',
      label: t('ask_action_settings', 'Réglages de la console'),
      path: '/settings',
      icon: Settings,
      category: 'Réglages',
    },
  ];

  return (
    <CmdKDialog open={open} onOpenChange={onOpenChange}>
      <CmdKInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('search_header_placeholder', 'Rechercher des écrits, réglages, actions...')}
        onEscape={() => onOpenChange(false)}
      />

      <CmdKList emptyText={t('common.no_results', 'Aucun résultat trouvé.') as string}>
        <CmdKGroup heading={t('ask_group_theme', 'Préférences visuelles') as string}>
          <CmdKItem
            icon={Sun}
            label={t('theme_light', 'Passer en Mode Clair') as string}
            category="Thème"
            onSelect={() => {
              setTheme('light');
              onOpenChange(false);
            }}
          />
          <CmdKItem
            icon={Moon}
            label={t('theme_dark', 'Passer en Mode Sombre') as string}
            category="Thème"
            onSelect={() => {
              setTheme('dark');
              onOpenChange(false);
            }}
          />
        </CmdKGroup>

        <CmdKGroup heading={t('ask_group_action', 'Raccourcis de la console') as string}>
          {quickActions.map((action) => (
            <CmdKItem
              key={action.id}
              icon={action.icon}
              label={action.label as string}
              category={action.category}
              onSelect={() => handleSelect(action.path)}
            />
          ))}
        </CmdKGroup>

        {searchResults.length > 0 && (
          <CmdKGroup heading={t('ask_group_articles', 'Articles & Brouillons') as string}>
            {searchResults.map((article) => (
              <CmdKItem
                key={article.id}
                icon={FileCode2}
                label={article.title}
                subtitle={article.content?.replace(/<[^>]*>?/gm, '')}
                category="Article"
                onSelect={() => handleSelect(`/articles/${article.id}`)}
              />
            ))}
          </CmdKGroup>
        )}

        {items.length > 0 && (
          <CmdKGroup heading={t('ask_group_settings', 'Réglages du Studio') as string}>
            {items.map((item) => {
              const translated = t(item.titleKey as string);
              const displayTitle =
                translated &&
                !translated.startsWith('dashboard.') &&
                !translated.startsWith('settings_')
                  ? translated
                  : item.label;
              const breadcrumbStr = item.breadcrumbLabels?.length
                ? item.breadcrumbLabels.join(' → ')
                : undefined;
              return (
                <CmdKItem
                  key={item.id}
                  value={`${displayTitle} ${item.keywordsKey?.join(' ') || ''}`}
                  icon={Sliders}
                  label={displayTitle as string}
                  subtitle={breadcrumbStr}
                  category="Réglage"
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
