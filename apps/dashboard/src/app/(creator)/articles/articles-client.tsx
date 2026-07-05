"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookOpen,
  Plus,
  Trash2,
  Edit3,
  FolderPlus,
  Globe,
  Lock,
  Tag,
  Calendar,
  ChevronRight,
  Search,
  Hourglass,
  AlertCircle,
  FolderOpen
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
  const [activeTab, setActiveTab] = useState<"articles" | "categories">("articles")
  const [articles, setArticles] = useState<ArticleWithCategory[]>(initialArticles)
  const [categories, setCategories] = useState<CategoryWithCount[]>(initialCategories)
  
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all")
  const [premiumFilter, setPremiumFilter] = useState<"all" | "free" | "premium">("all")

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
      setCategoryError(err?.message || "Une erreur est survenue lors de la création de la catégorie.")
    } finally {
      setIsCreatingCategory(false)
    }
  }

  // Handle category deletion
  const handleDeleteCategory = async (id: string, name: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer la catégorie "${name}" ? Vos articles associés ne seront pas supprimés, mais n'auront plus de catégorie.`)) {
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
    if (!confirm(`Voulez-vous vraiment supprimer l'article "${title}" ?`)) {
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
    const matchesPremium = premiumFilter === "all" ||
                           (premiumFilter === "premium" && art.isPremium) ||
                           (premiumFilter === "free" && !art.isPremium)

    return matchesSearch && matchesStatus && matchesPremium
  })

  return (
    <div className="space-y-16 max-w-3xl mx-auto pb-24 text-foreground font-sans">
      {/* Header - Apple-esque minimalist, huge spacing, crisp dark title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Écrits & Pensées
          </h1>
          <p className="text-muted-foreground text-xs tracking-normal font-sans">
            Un espace souverain pour cultiver le silence et l'écriture profonde.
          </p>
        </div>

        <a
          href="/articles/new"
          className="inline-flex items-center gap-1.5 h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-sans font-semibold text-xs rounded-lg transition-all cursor-pointer shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Rédiger
        </a>
      </div>

      {/* Tabs Menu - pure text based, spacious, no heavy borders */}
      <div className="border-b border-border flex items-center gap-8 text-xs font-semibold uppercase tracking-wider">
        <button
          onClick={() => setActiveTab("articles")}
          className={cn(
            "relative pb-4 cursor-pointer transition-colors",
            activeTab === "articles" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Articles ({articles.length})
          {activeTab === "articles" && (
            <motion.div
              layoutId="tabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          )}
        </button>

        <button
          onClick={() => setActiveTab("categories")}
          className={cn(
            "relative pb-4 cursor-pointer transition-colors",
            activeTab === "categories" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Thèmes ({categories.length})
          {activeTab === "categories" && (
            <motion.div
              layoutId="tabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full"
            />
          )}
        </button>
      </div>

      {/* Content Area */}
      <AnimatePresence mode="wait">
        {activeTab === "articles" ? (
          <motion.div
            key="articles-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-12"
          >
            {/* Minimal Search & Filters - borderless, light, spacious */}
            <div className="flex flex-col sm:flex-row items-center gap-4 py-2 border-b border-border">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher par mot-clé..."
                  className="w-full bg-transparent border-0 py-1.5 pl-7 pr-4 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-0 font-sans"
                />
              </div>

              <div className="flex items-center gap-4 w-full sm:w-auto">
                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">État</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-transparent border-0 p-0 text-xs text-foreground/80 focus:outline-none focus:ring-0 font-sans font-semibold cursor-pointer"
                  >
                    <option value="all">Tous</option>
                    <option value="published">Publiés</option>
                    <option value="draft">Brouillons</option>
                  </select>
                </div>

                {/* Premium */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Accès</span>
                  <select
                    value={premiumFilter}
                    onChange={(e) => setPremiumFilter(e.target.value as any)}
                    className="bg-transparent border-0 p-0 text-xs text-foreground/80 focus:outline-none focus:ring-0 font-sans font-semibold cursor-pointer"
                  >
                    <option value="all">Tous</option>
                    <option value="free">Gratuits</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Articles List - Spacious, thin minimal design (Ayush/Rauno style) */}
            {filteredArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 font-sans">
                <BookOpen className="h-6 w-6 text-muted-foreground/60 stroke-[1.5]" />
                <div className="space-y-0.5">
                  <h3 className="text-foreground font-semibold text-xs">Aucun écrit trouvé</h3>
                  <p className="text-[11px] text-muted-foreground max-w-xs font-sans">
                    Prenez la plume pour donner corps à vos pensées.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredArticles.map((art) => (
                  <div
                    key={art.id}
                    className="group border-b border-border/60 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-muted/40 -mx-4 px-4 rounded-xl"
                  >
                    {/* Left: Text & minimal status */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground font-sans">
                        {/* Clean minimal date */}
                        <span className="flex items-center gap-1 font-mono text-[10px]">
                          {new Date(art.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>

                        <span className="text-border">•</span>

                        {/* Quiet Status Dot */}
                        <span className="flex items-center gap-1">
                          <span className={cn("h-1.5 w-1.5 rounded-full", art.published ? "bg-emerald-500" : "bg-muted-foreground/45")} />
                          {art.published ? "Publié" : "Brouillon"}
                        </span>

                        {/* Quiet Premium Label */}
                        {art.isPremium && (
                          <>
                            <span className="text-border">•</span>
                            <span className="font-semibold text-foreground/70">Premium</span>
                          </>
                        )}

                        {/* Category Label */}
                        {art.category && (
                          <>
                            <span className="text-border">•</span>
                            <span className="text-muted-foreground">{art.category.name}</span>
                          </>
                        )}
                      </div>

                      {/* Title - large, sans-serif or crisp, spacious layout */}
                      <h3 className="text-base font-medium text-foreground group-hover:text-primary transition-colors font-sans tracking-tight">
                        {art.title}
                      </h3>
                      
                      {/* URL Slug preview */}
                      <p className="text-xs text-muted-foreground font-mono">
                        /{art.slug}
                      </p>
                    </div>

                    {/* Right: minimal quiet controls (only visible on hover or mobile) */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center opacity-70 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`/articles/${art.id}`}
                        className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted font-sans text-xs font-semibold transition-colors"
                        title="Éditer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="ml-1.5 hidden sm:inline">Écrire</span>
                      </a>

                      <button
                        onClick={() => handleDeleteArticle(art.id, art.title)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-transparent hover:border-border text-muted-foreground hover:text-destructive hover:bg-muted transition-colors cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="categories-tab"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-12"
          >
            {/* Left: Themes list */}
            <div className="md:col-span-2 space-y-6">
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                Thèmes existants
              </h2>

              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 font-sans">
                  <Tag className="h-6 w-6 text-muted-foreground/65 stroke-[1.5]" />
                  <p className="text-xs text-muted-foreground max-w-xs font-sans">
                    Aucun thème créé pour le moment.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="py-5 flex items-center justify-between gap-6 transition-all hover:bg-muted/40 -mx-4 px-4 rounded-xl"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-foreground font-sans">{cat.name}</h3>
                          <span className="text-[10px] text-muted-foreground font-sans font-medium">
                            ({cat._count.articles} {cat._count.articles > 1 ? "articles" : "article"})
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-sans leading-relaxed">
                          {cat.description || "Aucune description."}
                        </p>
                        <div className="text-[10px] font-mono text-muted-foreground/80">
                          /{cat.slug}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-transparent hover:border-border text-muted-foreground hover:text-destructive hover:bg-muted transition-colors cursor-pointer"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Create Theme Form */}
            <div className="md:col-span-1">
              <div className="space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-sans">
                    Nouveau Thème
                  </h2>
                  <p className="text-muted-foreground text-xs leading-normal">
                    Regroupez vos articles autour de concepts clés.
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
                      placeholder="Ex: Poésie, Réflexions..."
                      required
                      className="w-full bg-card border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-muted-foreground transition-colors font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-sans font-semibold">
                      Identifiant URL (Slug)
                    </label>
                    <input
                      type="text"
                      value={newCatSlug}
                      onChange={(e) => setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))}
                      placeholder="Ex: poesie"
                      required
                      className="w-full bg-card border border-border rounded-lg p-2 text-xs font-mono text-muted-foreground focus:outline-none focus:border-muted-foreground transition-colors"
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
                      placeholder="Écrivez une courte description..."
                      className="w-full bg-card border border-border rounded-lg p-2 text-xs text-foreground focus:outline-none focus:border-muted-foreground transition-colors font-sans resize-none"
                    />
                  </div>

                  {categoryError && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg text-[11px] leading-relaxed flex gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{categoryError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreatingCategory || !newCatName.trim()}
                    className="w-full h-8 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-sans font-semibold text-xs rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
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
