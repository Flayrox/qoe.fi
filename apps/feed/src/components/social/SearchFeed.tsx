"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search as SearchIcon, X, Loader2, User as UserIcon, MessageSquare, FileText, Sparkles } from "lucide-react";
import { useSearchQuery } from "@qoe/api-client";
import { ThoughtCard } from "./ThoughtCard";
import { AuthorAvatar } from "@qoe/ui/ui/AuthorAvatar";
import { CertifiedBadge } from "@qoe/ui/ui/CertifiedBadge";
import Link from "next/link";
import { routes } from "@qoe/config/routes";

export function SearchFeed({ initialQuery = "" }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<"all" | "thoughts" | "users" | "articles">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  // Raccourci clavier "/" pour focus la recherche
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current && !(document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { data, isLoading, isError } = useSearchQuery(query, activeTab);

  const hasQuery = query.trim().length > 0;
  const thoughts = data?.thoughts || [];
  const users = data?.users || [];
  const articles = data?.articles || [];

  return (
    <div className="space-y-4 font-sans pb-12">
      {/* Search Input Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <SearchIcon className="absolute left-4 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une pensée, un profil ou une thématique..."
            className="w-full pl-11 pr-16 py-3 bg-card border border-border/60 rounded-2xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all shadow-2xs"
          />
          {hasQuery ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Effacer"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="absolute right-3 px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground bg-muted/60 border border-border/50 rounded-md">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Tabs Bar */}
      {hasQuery && (
        <div className="flex items-center gap-1 border-b border-border/40 pb-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab("all")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === "all"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            Tous les résultats
          </button>
          <button
            onClick={() => setActiveTab("thoughts")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === "thoughts"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Pensées ({thoughts.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === "users"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profils ({users.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("articles")}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === "articles"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Articles ({articles.length})</span>
          </button>
        </div>
      )}

      {/* State: Prompt if no query */}
      {!hasQuery && (
        <div className="py-16 text-center space-y-3 bg-card/30 border border-border/40 rounded-3xl p-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="font-bold text-base text-foreground">Découvrez des conversations sur qoe.fi</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Saisissez un mot-clé, un hashtag comme <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-semibold">#tech</code> ou un identifiant d'auteur.
          </p>
        </div>
      )}

      {/* State: Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* State: Error */}
      {isError && (
        <div className="p-4 bg-destructive/10 text-destructive text-xs font-semibold rounded-2xl border border-destructive/20 text-center">
          Une erreur est survenue lors de la recherche.
        </div>
      )}

      {/* Results Rendering */}
      {!isLoading && hasQuery && (
        <div className="space-y-6">
          {/* Section Profils */}
          {(activeTab === "all" || activeTab === "users") && users.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                Profils ({users.length})
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {users.map((u: any) => (
                  <Link
                    key={u.id}
                    href={routes.feed.profile(u.username || u.subdomain || u.id)}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50 hover:bg-muted/40 transition-colors group"
                  >
                    <AuthorAvatar user={u} size="md" showBadge={false} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-foreground group-hover:text-primary transition-colors truncate">
                          {u.name || "Auteur"}
                        </span>
                        {u.isCertified && <CertifiedBadge />}
                      </div>
                      <span className="text-[11px] text-muted-foreground block truncate">
                        @{u.username || u.subdomain || u.id.slice(0, 8)}
                      </span>
                      {u.heroText && (
                        <p className="text-[11px] text-muted-foreground/80 line-clamp-1 mt-0.5">
                          {u.heroText}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section Pensées */}
          {(activeTab === "all" || activeTab === "thoughts") && thoughts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                Pensées ({thoughts.length})
              </h3>
              <div className="rounded-2xl border border-border/50 overflow-hidden divide-y divide-border/30 bg-card">
                {thoughts.map((thought: any) => (
                  <ThoughtCard key={thought.id} post={thought} />
                ))}
              </div>
            </div>
          )}

          {/* Section Articles */}
          {(activeTab === "all" || activeTab === "articles") && articles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
                Articles ({articles.length})
              </h3>
              <div className="grid gap-2">
                {articles.map((art: any) => (
                  <div key={art.id} className="p-4 rounded-2xl bg-card border border-border/50 space-y-1">
                    <h4 className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                      {art.title}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {art.content?.slice(0, 140)}...
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* State: No Results */}
          {thoughts.length === 0 && users.length === 0 && articles.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-xs bg-card/30 rounded-2xl border border-border/30 p-6">
              Aucun résultat trouvé pour <strong className="text-foreground">"{query}"</strong>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
