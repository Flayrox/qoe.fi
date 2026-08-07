"use client";

import * as React from "react";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";
import { useTranslate } from "@qoe/i18n";
import { useRouter } from "next/navigation";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useDebounce } from "use-debounce";
import { URLS } from "@qoe/config";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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

export function CommandMenu({ open, onOpenChange, items }: CommandMenuProps) {
  const { t } = useTranslate();
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [debouncedQuery] = useDebounce(query, 300);
  const [searchResults, setSearchResults] = React.useState<MeiliSearchResult[]>([]);

  React.useEffect(() => {
    if (!debouncedQuery) {
      setSearchResults([]);
      return;
    }

    let isMounted = true;

    const searchUrl = `${URLS.API}/search/articles?q=${encodeURIComponent(debouncedQuery)}`;
    fetch(searchUrl)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.hits) {
          setSearchResults(data.hits);
        }
      })
      .catch((err) => console.error("Search error", err));

    return () => {
      isMounted = false;
    };
  }, [debouncedQuery]);

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [open]);

  const handleSelect = (path: string) => {
    onOpenChange(false);

    setTimeout(() => {
      router.push(path);
      if (path.includes("#")) {
        const hash = path.split("#")[1];
        window.dispatchEvent(new CustomEvent("cmdKNavigate", { detail: { hash } }));
      }
    }, 150);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] sm:pt-[25vh]">
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
        onClick={() => onOpenChange(false)}
      />
      <Command
        className={cn(
          "relative z-50 flex h-full w-full max-w-[600px] flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl sm:h-auto",
          "animate-in fade-in-0 zoom-in-95 duration-200"
        )}
        shouldFilter={false}
      >
        <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            autoFocus
            className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder={t("common.search_placeholder") || "Rechercher un paramètre ou un article..."}
          />
          <button
            onClick={() => onOpenChange(false)}
            className="ml-2 opacity-50 hover:opacity-100 p-1 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            {t("common.no_results") || "Aucun résultat trouvé."}
          </Command.Empty>

          {searchResults.length > 0 && (
            <Command.Group heading={t("common.search_articles") || "Articles & Brouillons"}>
              {searchResults.map((article) => (
                <Command.Item
                  key={article.id}
                  value={article.title}
                  onSelect={() => handleSelect(`/articles/${article.id}`)}
                  className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">{article.title}</span>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {article.content?.replace(/<[^>]*>?/gm, "")}
                    </span>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Paramètres">
            {items.map((item) => (
              <Command.Item
                key={item.id}
                value={`${String(t(item.titleKey as string))} ${item.keywordsKey?.join(" ") || ""}`}
                onSelect={() => handleSelect(item.path)}
                className="relative flex cursor-default select-none items-center rounded-sm px-2 py-2.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {t(item.titleKey as string) || item.titleKey}
                  </span>
                  {item.breadcrumbs && item.breadcrumbs.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                      {item.breadcrumbs.map((bc, idx) => (
                        <React.Fragment key={idx}>
                          <span>{t(bc as string) || bc}</span>
                          {idx < item.breadcrumbs!.length - 1 && <span>→</span>}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
