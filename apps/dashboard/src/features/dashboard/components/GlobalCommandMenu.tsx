'use client';

import { useCommandMenu } from '@qoe/ui';
import { CmdKDialog, CmdKInput, CmdKList, CmdKGroup, CmdKItem } from '@qoe/ui';
import { settingsTree, flattenSettingsTree } from '../../settings/config/settingsTree';
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from 'use-debounce';
import { URLS } from '@qoe/config';
import { useTranslate } from '@qoe/i18n';
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
} from 'lucide-react';

export interface MeiliSearchResult {
  id: string;
  title: string;
  slug: string;
  content: string;
}

export function GlobalCommandMenu() {
  const { isOpen, setIsOpen } = useCommandMenu();
  const { t } = useTranslate();
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
    const controller = new AbortController();

    async function fetchResults() {
      setIsFetching(true);
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
          if (isMounted) setSearchResults([]);
        }
      } finally {
        if (isMounted) setIsFetching(false);
      }
    }

    fetchResults();

    return () => {
      isMounted = false;
      controller.abort();
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
    <CmdKDialog open={isOpen} onOpenChange={setIsOpen}>
      <CmdKInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('search_header_placeholder', 'Rechercher des écrits, réglages, actions...')}
        onEscape={() => setIsOpen(false)}
      />

      <CmdKList
        emptyText={
          isFetching
            ? (t('common.loading', 'Recherche en cours...') as string)
            : (t('common.no_results', 'Aucun résultat trouvé.') as string)
        }
      >
        {/* Only show default UI if there's no query, or if it's very short */}
        {debouncedQuery.length < 2 && (
          <>
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

            <CmdKGroup heading={t('ask_group_theme', 'Préférences visuelles') as string}>
              <CmdKItem
                icon={Sun}
                label={t('theme_light', 'Passer en Mode Clair') as string}
                category="Thème"
                onSelect={() => {
                  setTheme('light');
                  setIsOpen(false);
                }}
              />
              <CmdKItem
                icon={Moon}
                label={t('theme_dark', 'Passer en Mode Sombre') as string}
                category="Thème"
                onSelect={() => {
                  setTheme('dark');
                  setIsOpen(false);
                }}
              />
            </CmdKGroup>
          </>
        )}

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
