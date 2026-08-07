"use client";

import React, { useState, useEffect } from "react";
import { Command } from "cmdk";
import {
  Search,
  Plus,
  FileText,
  Users,
  Mail,
  PieChart,
  Settings,
  Sun,
  Moon,
  FileCode2,
} from "lucide-react";
import { useTranslate } from "@qoe/i18n";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useDebounce } from "use-debounce";
import { URLS } from "@qoe/config";
import { cn } from "@qoe/utils";

export interface MeiliSearchResult {
  id: string;
  title: string;
  slug: string;
  content: string;
}

export interface SearchItem {
  id: string;
  titleKey: string;
  keywordsKey?: string[];
  path: string;
  breadcrumbs?: string[];
}

interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: SearchItem[];
}

export function CommandMenu({
  open,
  onOpenChange,
  items,
}: CommandMenuProps) {
  const { t } = useTranslate();
  const router = useRouter();
  const { setTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query, 300);
  const [searchResults, setSearchResults] = useState<MeiliSearchResult[]>([]);

  // Fetch articles from Meilisearch API when typing
  useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }

    let isMounted = true;
    const searchUrl = `${URLS.API}/search/articles?q=${encodeURIComponent(
      debouncedQuery
    )}`;

    fetch(searchUrl)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.hits) {
          setSearchResults(data.hits);
        }
      })
      .catch((err) => console.error("Search error:", err));

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [open]);

  // Handle item selection with deep linking hash support
  const handleSelect = (path: string) => {
    onOpenChange(false);
    setQuery("");

    setTimeout(() => {
      router.push(path);
      if (path.includes("#")) {
        const hash = path.split("#")[1];
        window.dispatchEvent(
          new CustomEvent("cmdKNavigate", { detail: { hash } })
        );
      }
    }, 150);
  };

  // Quick navigation actions
  const quickActions = [
    {
      id: "action-new-article",
      label: t("ask_action_new", "Rédiger un article"),
      path: "/articles/new",
      icon: Plus,
      category: "Action",
    },
    {
      id: "action-articles",
      label: t("ask_action_articles", "Liste des écrits"),
      path: "/articles",
      icon: FileText,
      category: "Écrits",
    },
    {
      id: "action-audience",
      label: t("ask_action_audience", "Gérer l'audience"),
      path: "/audience",
      icon: Users,
      category: "Audience",
    },
    {
      id: "action-newsletters",
      label: t("ask_action_newsletters", "Envoyer une newsletter"),
      path: "/newsletters",
      icon: Mail,
      category: "Diffusion",
    },
    {
      id: "action-analytics",
      label: t("ask_action_analytics", "Consulter les statistiques"),
      path: "/analytics",
      icon: PieChart,
      category: "Analyses",
    },
    {
      id: "action-settings",
      label: t("ask_action_settings", "Réglages de la console"),
      path: "/settings",
      icon: Settings,
      category: "Réglages",
    },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] sm:pt-[20vh] p-4 select-none font-sans">
      {/* Backdrop */}
      <div
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-background/40 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Top Navbar Style Search Modal Container */}
      <Command
        label="Console Search"
        className={cn(
          "relative z-50 flex h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground backdrop-blur-xl shadow-2xl sm:h-auto",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
        shouldFilter={true}
      >
        {/* Header Search Field */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            placeholder={t(
              "search_header_placeholder",
              "Rechercher des écrits, réglages, actions..."
            )}
            className="flex-1 text-sm bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60"
          />
          <button
            onClick={() => onOpenChange(false)}
            className="text-[10px] font-sans font-semibold border border-border rounded px-1.5 py-0.5 text-muted-foreground bg-muted hover:bg-muted/80 transition-colors cursor-pointer"
          >
            Échap
          </button>
        </div>

        {/* Results List */}
        <Command.List className="max-h-[340px] overflow-y-auto p-2">
          <Command.Empty className="text-center py-8 text-muted-foreground text-xs font-medium">
            {t("common.no_results", "Aucun résultat trouvé.")}
          </Command.Empty>

          {/* GROUP 1: Articles & Drafts (Meilisearch) */}
          {searchResults.length > 0 && (
            <Command.Group
              heading={
                t("ask_group_articles", "Articles & Brouillons") as string
              }
              className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80 mb-1"
            >
              {searchResults.map((article) => (
                <CommandItem
                  key={article.id}
                  icon={FileCode2}
                  label={article.title}
                  subtitle={article.content?.replace(/<[^>]*>?/gm, "")}
                  category="Article"
                  onSelect={() => handleSelect(`/articles/${article.id}`)}
                />
              ))}
            </Command.Group>
          )}

          {/* GROUP 2: Settings Tree Nodes */}
          {items.length > 0 && (
            <Command.Group
              heading={t("ask_group_settings", "Réglages de la Console") as string}
              className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80 mb-1"
            >
              {items.map((item) => {
                const translatedTitle =
                  t(item.titleKey as string) || item.titleKey;
                const translatedBreadcrumbs = item.breadcrumbs
                  ?.map((bc) => t(bc as string) || bc)
                  .join(" → ");

                return (
                  <CommandItem
                    key={item.id}
                    value={`${translatedTitle} ${item.keywordsKey?.join(" ") || ""}`}
                    icon={Settings}
                    label={translatedTitle}
                    subtitle={translatedBreadcrumbs}
                    category="Réglage"
                    onSelect={() => handleSelect(item.path)}
                  />
                );
              })}
            </Command.Group>
          )}

          {/* GROUP 3: Quick Navigation Actions */}
          <Command.Group
            heading={t("ask_group_action", "Raccourcis de la Console") as string}
            className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80 mb-1"
          >
            {quickActions.map((action) => (
              <CommandItem
                key={action.id}
                icon={action.icon}
                label={action.label}
                category={action.category}
                onSelect={() => handleSelect(action.path)}
              />
            ))}
          </Command.Group>

          {/* GROUP 4: Theme Preferences */}
          <Command.Group
            heading={t("ask_group_theme", "Préférences Visuelles") as string}
            className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/80 mb-1"
          >
            <CommandItem
              icon={Sun}
              label={t("theme_light", "Passer en Mode Clair")}
              category="Thème"
              onSelect={() => {
                setTheme("light");
                onOpenChange(false);
              }}
            />
            <CommandItem
              icon={Moon}
              label={t("theme_dark", "Passer en Mode Sombre")}
              category="Thème"
              onSelect={() => {
                setTheme("dark");
                onOpenChange(false);
              }}
            />
          </Command.Group>
        </Command.List>

        {/* Footer Navigation Hints */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-t border-border text-[10px] text-muted-foreground select-none">
          <span>
            Sélectionner avec{" "}
            <kbd className="border border-border rounded px-1 font-semibold">Entrée</kbd>
          </span>
          <span>Naviguer avec la souris ou clavier</span>
        </div>
      </Command>
    </div>
  );
}

interface CommandItemProps {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  subtitle?: string;
  category?: string;
  value?: string;
  onSelect: () => void;
}

const CommandItem = ({
  icon: Icon,
  label,
  subtitle,
  category,
  value,
  onSelect,
}: CommandItemProps) => {
  return (
    <Command.Item
      value={value || label}
      onSelect={onSelect}
      className="w-full flex items-center justify-between text-left p-2.5 rounded-lg hover:bg-muted aria-selected:bg-muted transition-colors cursor-pointer mb-1 select-none group"
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center border border-border shrink-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground group-aria-selected:text-primary transition-colors" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground/90 truncate">
            {label}
          </span>
          {subtitle && (
            <span className="text-[10px] text-muted-foreground truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {category && (
        <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium shrink-0">
          {category}
        </span>
      )}
    </Command.Item>
  );
};
