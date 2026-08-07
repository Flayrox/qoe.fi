"use client";

import React, { useState, useEffect } from "react";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Search,
  Plus,
  FileText,
  Users,
  Mail,
  PieChart,
  Settings,
  Sun,
  Moon,
  CornerDownLeft,
  X,
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
  showTriggerPill?: boolean;
}

export function CommandMenu({
  open,
  onOpenChange,
  items,
  showTriggerPill = true,
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
      icon: <Plus className="w-4 h-4 text-primary" />,
      shortcut: "N E W",
    },
    {
      id: "action-articles",
      label: t("ask_action_articles", "Liste des écrits"),
      path: "/articles",
      icon: <FileText className="w-4 h-4 text-primary" />,
      shortcut: "A R T",
    },
    {
      id: "action-audience",
      label: t("ask_action_audience", "Gérer l'audience"),
      path: "/audience",
      icon: <Users className="w-4 h-4 text-primary" />,
      shortcut: "A U D",
    },
    {
      id: "action-newsletters",
      label: t("ask_action_newsletters", "Envoyer une newsletter"),
      path: "/newsletters",
      icon: <Mail className="w-4 h-4 text-primary" />,
      shortcut: "N E W S",
    },
    {
      id: "action-analytics",
      label: t("ask_action_analytics", "Consulter les statistiques"),
      path: "/analytics",
      icon: <PieChart className="w-4 h-4 text-primary" />,
      shortcut: "S T A T",
    },
    {
      id: "action-settings",
      label: t("ask_action_settings", "Paramètres de la publication"),
      path: "/settings",
      icon: <Settings className="w-4 h-4 text-primary" />,
      shortcut: "S E T",
    },
  ];

  return (
    <>
      {/* =====================================================================
          FLOATING PILL AT BOTTOM OF VIEWPORT (Original AskQoeBar Design)
          ===================================================================== */}
      {showTriggerPill && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-6 pointer-events-none">
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{
              delay: 0.3,
              type: "spring",
              stiffness: 260,
              damping: 20,
            }}
            onClick={() => onOpenChange(true)}
            className="pointer-events-auto cursor-pointer group flex items-center justify-between p-1.5 bg-card/70 dark:bg-card/65 backdrop-blur-2xl border border-border/60 hover:border-primary/50 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] transition-all duration-500 overflow-hidden relative"
          >
            {/* Animated halo gradient inside pill */}
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

            <div className="flex items-center gap-3 pl-4 py-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse shrink-0" />
              <span className="text-xs text-muted-foreground font-sans">
                {t(
                  "ask_bar_placeholder",
                  "Demandez à qoe.fi ou cherchez... (⌘K)"
                )}
              </span>
            </div>

            <div className="flex items-center gap-2 pr-1">
              <kbd className="hidden sm:inline-flex h-7 select-none items-center gap-1 rounded-full bg-muted px-3 text-[10px] font-mono text-muted-foreground border border-border/40 font-semibold">
                <span className="text-xs">⌘</span>K
              </kbd>
              <div className="p-2 bg-foreground text-background dark:bg-foreground dark:text-background rounded-full hover:scale-105 active:scale-95 transition-all">
                <Search className="w-3.5 h-3.5" />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* =====================================================================
          COMMAND PALETTE MODAL (Original AskQoeBar Rounded Design)
          ===================================================================== */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => onOpenChange(false)}
              className="absolute inset-0 bg-background/60 backdrop-blur-md"
            />

            {/* Modal Container */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
              className="relative w-full max-w-xl bg-card border border-border/60 rounded-[2.5rem] shadow-2xl overflow-hidden pointer-events-auto"
            >
              {/* Top primary glow line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />

              <Command
                label="Command Menu"
                className="flex flex-col h-full max-h-[480px]"
                shouldFilter={true}
              >
                {/* Search Input Box */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-border/40 relative">
                  <Search className="w-5 h-5 text-muted-foreground shrink-0" />
                  <Command.Input
                    autoFocus
                    placeholder={t(
                      "ask_modal_placeholder",
                      "Que recherchez-vous ? (Paramètres, articles...)"
                    )}
                    value={query}
                    onValueChange={setQuery}
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none border-none py-1 focus:ring-0"
                  />
                  {query ? (
                    <button
                      onClick={() => setQuery("")}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground px-2 py-1 bg-muted rounded-md transition-all cursor-pointer"
                    >
                      CLEAR
                    </button>
                  ) : (
                    <button
                      onClick={() => onOpenChange(false)}
                      className="text-muted-foreground hover:text-foreground p-1 transition-all cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Command Lists */}
                <Command.List className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                  <Command.Empty className="py-12 text-center text-xs text-muted-foreground italic">
                    {t("ask_empty", "Aucun résultat trouvé.")}
                  </Command.Empty>

                  {/* GROUP 1: Articles & Drafts (Meilisearch) */}
                  {searchResults.length > 0 && (
                    <Command.Group
                      heading={
                        t("ask_group_articles", "Articles & Brouillons") as string
                      }
                      className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 px-3 mb-2"
                    >
                      {searchResults.map((article) => (
                        <CommandItem
                          key={article.id}
                          icon={<FileCode2 className="w-4 h-4 text-primary" />}
                          label={article.title}
                          subtitle={article.content?.replace(/<[^>]*>?/gm, "")}
                          onSelect={() => handleSelect(`/articles/${article.id}`)}
                        />
                      ))}
                    </Command.Group>
                  )}

                  {/* GROUP 2: Settings Tree Nodes */}
                  {items.length > 0 && (
                    <Command.Group
                      heading={t("ask_group_settings", "Paramètres du Studio") as string}
                      className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 px-3 mb-2"
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
                            icon={<Settings className="w-4 h-4 text-primary" />}
                            label={translatedTitle}
                            subtitle={translatedBreadcrumbs}
                            onSelect={() => handleSelect(item.path)}
                          />
                        );
                      })}
                    </Command.Group>
                  )}

                  {/* GROUP 3: Quick Navigation Actions */}
                  <Command.Group
                    heading={t("ask_group_action", "Actions rapides") as string}
                    className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 px-3 mb-2"
                  >
                    {quickActions.map((action) => (
                      <CommandItem
                        key={action.id}
                        icon={action.icon}
                        label={action.label}
                        shortcut={action.shortcut}
                        onSelect={() => handleSelect(action.path)}
                      />
                    ))}
                  </Command.Group>

                  {/* GROUP 4: Theme Preferences */}
                  <Command.Group
                    heading={t("ask_group_theme", "Préférences Visuelles") as string}
                    className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 px-3 mb-2"
                  >
                    <CommandItem
                      icon={<Sun className="w-4 h-4 text-amber-500" />}
                      label={t("theme_light", "Passer en Mode Clair (Nuages & Lumière)")}
                      onSelect={() => {
                        setTheme("light");
                        onOpenChange(false);
                      }}
                    />
                    <CommandItem
                      icon={<Moon className="w-4 h-4 text-indigo-500" />}
                      label={t("theme_dark", "Passer en Mode Sombre (Onyx / Dark)")}
                      onSelect={() => {
                        setTheme("dark");
                        onOpenChange(false);
                      }}
                    />
                  </Command.Group>
                </Command.List>

                {/* Footer Hints (Original AskQoeBar Footer) */}
                <div className="px-6 py-4 bg-muted/20 border-t border-border/40 flex items-center justify-between text-[10px] font-mono text-muted-foreground uppercase tracking-widest select-none">
                  <div className="flex items-center gap-4">
                    <span>↑↓ Naviguer</span>
                    <span>⏎ Valider</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>Ask qoe.fi</span>
                    <CornerDownLeft className="w-3 h-3 text-primary" />
                  </div>
                </div>
              </Command>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

interface CommandItemProps {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  shortcut?: string;
  value?: string;
  onSelect: () => void;
}

const CommandItem = ({
  icon,
  label,
  subtitle,
  shortcut,
  value,
  onSelect,
}: CommandItemProps) => {
  return (
    <Command.Item
      value={value || label}
      onSelect={onSelect}
      className="flex items-center justify-between p-3.5 rounded-2xl hover:bg-muted/60 data-[selected=true]:bg-muted/80 cursor-pointer transition-all duration-200 select-none group mb-1"
    >
      <div className="flex items-center gap-3 min-w-0 pr-2">
        <div className="p-2 bg-muted/60 rounded-xl group-data-[selected=true]:bg-card group-data-[selected=true]:scale-105 transition-all shrink-0">
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-foreground font-medium group-data-[selected=true]:text-primary transition-colors truncate">
            {label}
          </span>
          {subtitle && (
            <span className="text-[11px] text-muted-foreground/70 truncate mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {shortcut && (
        <span className="text-[10px] font-mono text-muted-foreground/60 px-2 py-0.5 bg-muted rounded border border-border/30 shrink-0">
          {shortcut}
        </span>
      )}
    </Command.Item>
  );
};
