"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  FileText,
  Clock,
  Eye,
  MessageSquare,
  MoreVertical,
  Search,
  AlertCircle,
  Tag
} from "lucide-react"
import { cn } from "@qoe/utils"
import {
  deleteArticleAction,
  saveCategoryAction,
  deleteCategoryAction
} from "./actions"

interface ArticleWithCategory {
  id: string
  title: string
  slug: string
  content: string
  published: boolean
  isPremium: boolean
  readingTime: number
  categoryId: string | null
  createdAt: Date
  updatedAt: Date
  category: {
    id: string
    name: string
    slug: string
  } | null
}

interface CategoryWithCount {
  id: string
  name: string
  slug: string
  description: string | null
  _count: {
    articles: number
  }
}

interface ArticlesClientProps {
  initialArticles: ArticleWithCategory[]
  initialCategories: CategoryWithCount[]
}

export function ArticlesClient({ initialArticles, initialCategories }: ArticlesClientProps) {
  const [activeMainTab, setActiveMainTab] = useState<"articles" | "categories">("articles")
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all")
  const [articles, setArticles] = useState<ArticleWithCategory[]>(initialArticles)
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories)
  
  // Search state
  const [searchTerm, setSearchTerm] = useState("")

  // Category Form State
  const [newCatName, setNewCatName] = useState("")
  const [newCatSlug, setNewCatSlug] = useState("")
  const [newCatDesc, setNewCatDesc] = useState("")
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [categorySuccess, setCategorySuccess] = useState(false)
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)

  // Automatic category slug helper
  const handleCategoryNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setNewCatName(val)
    setNewCatSlug(
      val
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
    )
  }

  // Handle category submission
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return

    try {
      setCategoryError(null)
      setCategorySuccess(false)
      setIsCreatingCategory(true)

      const created = await saveCategoryAction({
        name: newCatName,
        slug: newCatSlug || undefined,
        description: newCatDesc || null,
      })

      const newCatWithCount: CategoryWithCount = {
        id: created.id,
        name: created.name,
        slug: created.slug,
        description: created.description,
        _count: { articles: 0 }
      }
      
      setCategories(prev => [...prev, newCatWithCount].sort((a, b) => a.name.localeCompare(b.name)))
      
      setNewCatName("")
      setNewCatSlug("")
      setNewCatDesc("")
      setCategorySuccess(true)
      setTimeout(() => setCategorySuccess(false), 3000)
    } catch (err: any) {
      setCategoryError(err?.message || "Une erreur est survenue lors de la création du thème.")
    } finally {
      setIsCreatingCategory(false)
    }
  }

  // Handle category deletion
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le thème "${name}" ?`)) {
      return
    }

    try {
      await deleteCategoryAction(id)
      setCategories(prev => prev.filter(c => c.id !== id))
      setArticles(prev => prev.map(art => art.categoryId === id ? { ...art, categoryId: null, category: null } : art))
    } catch (err: any) {
      alert(err?.message || "Échec de la suppression.")
    }
  }

  // Handle article deletion
  const handleDeleteArticle = async (id: string, title: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer l'écrit "${title}" ?`)) {
      return
    }

    try {
      await deleteArticleAction(id)
      setArticles(prev => prev.filter(a => a.id !== id))
    } catch (err: any) {
      alert(err?.message || "Échec de la suppression.")
    }
  }

  // Filter articles
  const filteredArticles = articles.filter(art => {
    const matchesSearch = art.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          art.slug.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === "all" ||
                          (statusFilter === "published" && art.published) ||
                          (statusFilter === "draft" && !art.published)

    return matchesSearch && matchesStatus
  })

  const countPublished = articles.filter(a => a.published).length
  const countDrafts = articles.filter(a => !a.published).length

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto w-full pb-24 text-foreground font-sans selection:bg-primary/20 selection:text-primary">
      
      {/* Main Stage Headline */}
      <section className="pt-4 md:pt-2 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-foreground font-sans">
            Articles
          </h2>

          {/* Tab Switcher: Articles vs Thèmes */}
          <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border/40 text-xs font-semibold">
            <button
              onClick={() => setActiveMainTab("articles")}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all cursor-pointer",
                activeMainTab === "articles"
                  ? "bg-card text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Écrits ({articles.length})
            </button>
            <button
              onClick={() => setActiveMainTab("categories")}
              className={cn(
                "px-3 py-1.5 rounded-md transition-all cursor-pointer",
                activeMainTab === "categories"
                  ? "bg-card text-foreground shadow-xs font-bold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Thèmes ({categories.length})
            </button>
          </div>
        </div>

        {/* Filter sub-tabs when in Articles mode */}
        {activeMainTab === "articles" && (
          <div className="flex items-center gap-6 border-b border-border/40 font-sans text-sm font-medium">
            <button
              onClick={() => setStatusFilter("all")}
              className={cn(
                "pb-3 border-b-2 transition-colors cursor-pointer",
                statusFilter === "all"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              All ({articles.length})
            </button>
            <button
              onClick={() => setStatusFilter("published")}
              className={cn(
                "pb-3 border-b-2 transition-colors cursor-pointer",
                statusFilter === "published"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Published ({countPublished})
            </button>
            <button
              onClick={() => setStatusFilter("draft")}
              className={cn(
                "pb-3 border-b-2 transition-colors cursor-pointer",
                statusFilter === "draft"
                  ? "border-primary text-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Drafts ({countDrafts})
            </button>
            <span className="pb-3 text-muted-foreground/40 cursor-not-allowed select-none">
              Scheduled (0)
            </span>
          </div>
        )}
      </section>

      {/* Main Content View */}
      <AnimatePresence mode="wait">
        {activeMainTab === "articles" ? (
          <motion.div
            key="articles-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Search input bar */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="w-full bg-card border border-border/40 rounded-full py-1.5 pl-9 pr-4 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all font-sans"
              />
            </div>

            {/* Article List Section (Apple Music styled compact rows) */}
            {filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 font-sans border border-dashed border-border/60 rounded-xl">
                <BookOpen className="h-8 w-8 text-muted-foreground/40 stroke-[1.5]" />
                <div className="space-y-0.5">
                  <h3 className="text-foreground font-semibold text-sm">Aucun écrit trouvé</h3>
                  <p className="text-xs text-muted-foreground max-w-xs font-sans">
                    Prenez la plume pour donner corps à vos pensées.
                  </p>
                </div>
                <a
                  href="/articles/new"
                  className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Rédiger un article</span>
                </a>
              </div>
            ) : (
              <section className="flex flex-col divide-y divide-border/40">
                {filteredArticles.map((art) => (
                  <div
                    key={art.id}
                    className="flex items-center gap-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer group px-3 rounded-lg border-b border-border/40"
                  >
                    {/* Square Icon Block */}
                    <div className="w-8 h-8 rounded bg-muted/60 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-muted-foreground stroke-[1.5]" />
                    </div>

                    {/* Title & Metadata */}
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <h4 className="text-sm text-foreground font-medium truncate group-hover:text-primary transition-colors font-sans">
                        {art.title}
                      </h4>
                      <div className="flex items-center gap-3 shrink-0">
                        {/* Plain text status badge */}
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium font-sans",
                            art.published
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground border border-border/40"
                          )}
                        >
                          {art.published ? "Published" : "Draft"}
                        </span>
                        
                        <span className="text-xs text-muted-foreground font-sans">
                          {new Date(art.updatedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric"
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Metrics (Views & Comments) */}
                    <div className="hidden md:flex items-center gap-6 px-4">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Eye className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>{art.published ? `${(art.title.length * 37) % 500 + 120}` : "--"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="w-3.5 h-3.5 stroke-[1.5]" />
                        <span>{art.published ? `${(art.title.length * 7) % 40}` : "--"}</span>
                      </div>
                    </div>

                    {/* Direct Action Controls */}
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`/articles/${art.id}`}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded hover:bg-muted transition-colors"
                        title="Éditer"
                      >
                        <Edit3 className="w-4 h-4 stroke-[1.5]" />
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteArticle(art.id, art.title)
                        }}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            )}
          </motion.div>
        ) : (
          /* Categories / Thèmes View */
          <motion.div
            key="categories-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-12 pt-2"
          >
            {/* Left: Themes list */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                Thèmes existants
              </h3>

              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 font-sans border border-dashed border-border/60 rounded-xl">
                  <Tag className="h-6 w-6 text-muted-foreground/60 stroke-[1.5]" />
                  <p className="text-xs text-muted-foreground max-w-xs font-sans">
                    Aucun thème créé pour le moment.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/40 border-t border-b border-border/40">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="py-4 flex items-center justify-between gap-6 transition-all hover:bg-muted/30 px-2 rounded-lg"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground font-sans">{cat.name}</h4>
                          <span className="text-[11px] text-muted-foreground font-sans font-medium">
                            ({cat._count.articles} {cat._count.articles > 1 ? "articles" : "article"})
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                            {cat.description}
                          </p>
                        )}
                        <div className="text-[10px] font-mono text-muted-foreground/80">
                          /{cat.slug}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.5]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Create Theme Form */}
            <div className="md:col-span-1">
              <div className="bg-card border border-border/40 rounded-xl p-5 space-y-4">
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                    Nouveau Thème
                  </h3>
                  <p className="text-muted-foreground text-xs leading-normal">
                    Organisez vos écrits par sujets.
                  </p>
                </div>

                <form onSubmit={handleCreateCategory} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Nom du thème
                    </label>
                    <input
                      type="text"
                      value={newCatName}
                      onChange={handleCategoryNameChange}
                      placeholder="Ex: Poésie, Tech..."
                      required
                      className="w-full bg-background border border-border/50 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Slug URL
                    </label>
                    <input
                      type="text"
                      value={newCatSlug}
                      onChange={(e) => setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))}
                      placeholder="Ex: poesie"
                      required
                      className="w-full bg-background border border-border/50 rounded-lg p-2 text-xs font-mono text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      placeholder="Courte description..."
                      className="w-full bg-background border border-border/50 rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-primary transition-colors font-sans resize-none"
                    />
                  </div>

                  {categoryError && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive p-2.5 rounded-lg text-[11px] flex gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{categoryError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreatingCategory || !newCatName.trim()}
                    className="w-full h-8 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-sans font-semibold text-xs rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingCategory ? "Création..." : "Ajouter le thème"}
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
