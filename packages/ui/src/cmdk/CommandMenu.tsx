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
  Sliders,
} from "lucide-react";
import { useTranslate } from "@qoe/i18n";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useDebounce } from "use-debounce";
import { URLS } from "@qoe/config";

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

  // Safe async fetch with AbortController and try/catch
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
      } catch (err: any) {
        if (err.name !== "AbortError") {
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

  // Handle Escape key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none font-sans">
      {/* Backdrop */}
      <div
        onClick={() => onOpenChange(false)}
        className="fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-200"
      />

      {/* Classic Standard Shadcn CmdK Dialog Container */}
      <div className="relative z-50 flex flex-col w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover/95 text-popover-foreground backdrop-blur-xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200">
        <Command
          label="Console Search"
          className="flex h-auto w-full flex-col overflow-hidden bg-transparent"
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
              className="text-[10px] font-sans font-medium border border-border/50 rounded px-1.5 py-0.5 text-muted-foreground bg-muted/60 hover:bg-muted transition-colors cursor-pointer shrink-0"
            >
              Échap
            </button>
          </div>

          {/* Results List */}
          <Command.List className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar space-y-2">
            <Command.Empty className="text-center py-6 text-muted-foreground text-xs font-medium">
              {t("common.no_results", "Aucun résultat trouvé.")}
            </Command.Empty>

            {/* GROUP 1: Visual Preferences (Themes) */}
            <Command.Group
              heading={t("ask_group_theme", "Préférences visuelles") as string}
              className="px-2 py-1 text-xs font-semibold text-muted-foreground/80 mb-1"
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

            {/* GROUP 2: Console Quick Shortcuts */}
            <Command.Group
              heading={t("ask_group_action", "Raccourcis de la console") as string}
              className="px-2 py-1 text-xs font-semibold text-muted-foreground/80 mb-1"
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

            {/* GROUP 3: Articles & Drafts (Meilisearch) */}
            {searchResults.length > 0 && (
              <Command.Group
                heading={
                  t("ask_group_articles", "Articles & Brouillons") as string
                }
                className="px-2 py-1 text-xs font-semibold text-muted-foreground/80 mb-1"
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

            {/* GROUP 4: Studio Settings Tree (Deep Linking) */}
            {items.length > 0 && (
              <Command.Group
                heading={t("ask_group_settings", "Réglages du Studio") as string}
                className="px-2 py-1 text-xs font-semibold text-muted-foreground/80 mb-1"
              >
                {items.map((item) => {
                  const translated = t(item.titleKey as string);
                  const displayTitle =
                    translated && !translated.startsWith("dashboard.") && !translated.startsWith("settings_")
                      ? translated
                      : item.label;

                  const breadcrumbStr = item.breadcrumbLabels && item.breadcrumbLabels.length > 0
                    ? item.breadcrumbLabels.join(" → ")
                    : undefined;

                  return (
                    <CommandItem
                      key={item.id}
                      value={`${displayTitle} ${item.keywordsKey?.join(" ") || ""}`}
                      icon={Sliders}
                      label={displayTitle}
                      subtitle={breadcrumbStr}
                      category="Réglage"
                      onSelect={() => handleSelect(item.path)}
                    />
                  );
                })}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer Navigation Hints */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-t border-border text-[10px] text-muted-foreground select-none">
            <span>
              Sélectionner avec{" "}
              <kbd className="border border-border/60 rounded px-1 font-medium bg-background">Entrée</kbd>
            </span>
            <span>Naviguer avec la souris ou clavier</span>
          </div>
        </Command>
      </div>
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
      className="w-full flex items-center justify-between text-left px-2.5 py-2 rounded-lg hover:bg-muted aria-selected:bg-muted transition-colors cursor-pointer mb-0.5 select-none group"
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        <div className="w-7 h-7 rounded-md bg-muted/80 flex items-center justify-center border border-border/60 shrink-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground group-aria-selected:text-primary transition-colors" strokeWidth={1.5} />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-foreground/90 truncate">
            {label}
          </span>
          {subtitle && (
            <span className="text-[10px] text-muted-foreground/80 truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {category && (
        <span className="text-[9px] font-medium bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded shrink-0">
          {category}
        </span>
      )}
    </Command.Item>
  );
};
