"use client"

import React from "react"
import { Bookmark, Clock, ExternalLink } from "lucide-react"
import { useTranslate } from "@qoe/i18n"
import { motion } from "framer-motion"
import { trackServerEvent } from "@qoe/analytics"
import { ReaderPageLayout } from "@/components/layout/ReaderPageLayout"
import { routes } from "@qoe/config/routes"

interface LibraryClientProps {
  bookmarks: any[]
}

export function LibraryClient({ bookmarks }: LibraryClientProps) {
  const { t } = useTranslate()

  const handleReadClick = (articleId: string, slug: string) => {
    trackServerEvent("library_article_read", { articleId, slug })
  }

  return (
    <ReaderPageLayout giantTitle="Signets">
      <div className="bg-card text-card-foreground shadow-2xl border-t border-x border-border/40 rounded-t-2xl min-h-screen mt-24 relative z-20">
        <div className="px-6 pt-6 pb-6 space-y-6">
          {/* Page header inside the sheet */}
          <div className="px-1">
            <h1 className="text-lg font-bold tracking-tight text-foreground">
              {t("library.title", "Le Sanctuaire")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("library.subtitle", "Vos lectures sauvegardées et articles favoris.")}
            </p>
          </div>

          {/* Bento shell */}
          <div className="flex flex-col gap-4">
            {bookmarks.length === 0 ? (
              <div className="bg-muted/40 rounded-xl p-12 border border-border/40 text-center flex flex-col items-center justify-center gap-3">
                <Bookmark className="w-10 h-10 text-muted-foreground/60" />
                <h4 className="font-bold text-sm text-foreground">
                  {t("library.empty_title", "Votre sanctuaire est vide")}
                </h4>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  {t("library.empty_desc", "Explorez qoe.fi et sauvegardez les articles qui méritent d'être lus à tête reposée.")}
                </p>
                <motion.a
                  href="/home"
                  whileTap={{ scale: 0.98 }}
                  className="bg-primary text-primary-foreground px-5 py-2 rounded-xl text-xs font-semibold hover:opacity-90 transition-colors mt-2"
                >
                  {t("library.discover_articles", "Découvrir des articles")}
                </motion.a>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bookmarks.map((b) => {
                  const isProd =
                    typeof window !== "undefined"
                      ? window.location.hostname.endsWith("qoe.fi")
                      : process.env.NODE_ENV === "production"
                  const suffix = isProd ? "qoe.fi" : "localhost"
                  const protocol = isProd ? "https:" : "http:"
                  const host =
                    b.article.author.customDomain ||
                    (b.article.author.subdomain ? `${b.article.author.subdomain}.${suffix}` : "")
                  const url = host ? `${protocol}//${host}/article/${b.article.slug}` : "#"

                  return (
                    <div
                      key={b.id}
                      className="bg-card rounded-xl p-5 border border-border/60 shadow-xs flex flex-col justify-between gap-4 group hover:border-primary/40 transition-all duration-300"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <a
                            href={b.article.author.username ? routes.feed.profile(b.article.author.username) : "#"}
                            className="flex items-center gap-2 group/auth"
                          >
                            {b.article.author.logoUrl ? (
                              <img
                                src={b.article.author.logoUrl}
                                className="w-6 h-6 rounded-md object-cover border border-border/60"
                                alt=""
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                {b.article.author.name?.charAt(0)}
                              </div>
                            )}
                            <span className="text-xs font-semibold text-muted-foreground group-hover/auth:text-primary transition-colors">
                              {b.article.author.name}
                            </span>
                          </a>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                            <Clock className="w-3 h-3" />
                            {b.article.readingTime} min
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-foreground tracking-tight leading-snug group-hover:text-primary transition-colors mb-2">
                          {b.article.title}
                        </h3>

                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {b.article.content.replace(/<[^>]*>?/gm, "").substring(0, 120)}...
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-border/40">
                        <div className="flex items-center gap-2">
                          {b.article.category && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-muted border border-border/40 rounded-md text-muted-foreground">
                              {b.article.category.name}
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {new Date(b.createdAt).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <motion.a
                          href={url}
                          target="_blank"
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleReadClick(b.article.id, b.article.slug)}
                          className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline"
                        >
                          {t("library.read", "Lire")} <ExternalLink className="w-3 h-3" />
                        </motion.a>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ReaderPageLayout>
  )
}
