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
  const [hoveredArticleId, setHoveredArticleId] = useState<string | null>(null)

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
    <div className="space-y-16 max-w-3xl mx-auto pb-24 text-zinc-900 dark:text-zinc-50 font-sans">
      {/* Header - Apple-esque minimalist, huge spacing, crisp dark title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pb-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Écrits & Pensées
          </h1>
          <p className="text-zinc-400 dark:text-zinc-500 text-xs tracking-normal font-sans">
            Un espace souverain pour cultiver le silence et l'écriture profonde.
          </p>
        </div>

        <a
          href="/dashboard/articles/new"
          className="inline-flex items-center gap-1.5 h-8 px-4 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 font-sans font-semibold text-xs rounded-lg transition-all cursor-pointer shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          Rédiger
        </a>
      </div>

      {/* Tabs Menu - pure text based, spacious, no heavy borders */}
      <div className="border-b border-zinc-100 dark:border-zinc-900 flex items-center gap-8 text-xs font-semibold uppercase tracking-wider">
        <button
          onClick={() => setActiveTab("articles")}
          className={cn(
            "relative pb-4 cursor-pointer transition-colors",
            activeTab === "articles" ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300"
          )}
        >
          Articles ({articles.length})
          {activeTab === "articles" && (
            <motion.div
              layoutId="tabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full"
            />
          )}
        </button>

        <button
          onClick={() => setActiveTab("categories")}
          className={cn(
            "relative pb-4 cursor-pointer transition-colors",
            activeTab === "categories" ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300"
          )}
        >
          Thèmes ({categories.length})
          {activeTab === "categories" && (
            <motion.div
              layoutId="tabUnderline"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900 dark:bg-zinc-100 rounded-full"
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
            <div className="flex flex-col sm:flex-row items-center gap-4 py-2 border-b border-zinc-100 dark:border-zinc-900">
              {/* Search */}
              <div className="relative flex-1 w-full">
                <Search className="absolute left-1 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-600" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher par mot-clé..."
                  className="w-full bg-transparent border-0 py-1.5 pl-7 pr-4 text-xs text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 focus:outline-none focus:ring-0 font-sans"
                />
              </div>

              <div className="flex items-center gap-4 w-full sm:w-auto">
                {/* Status */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">État</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-transparent border-0 p-0 text-xs text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-0 font-sans font-semibold cursor-pointer"
                  >
                    <option value="all">Tous</option>
                    <option value="published">Publiés</option>
                    <option value="draft">Brouillons</option>
                  </select>
                </div>

                {/* Premium */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider">Accès</span>
                  <select
                    value={premiumFilter}
                    onChange={(e) => setPremiumFilter(e.target.value as any)}
                    className="bg-transparent border-0 p-0 text-xs text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-0 font-sans font-semibold cursor-pointer"
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
                <BookOpen className="h-6 w-6 text-zinc-300 stroke-[1.5]" />
                <div className="space-y-0.5">
                  <h3 className="text-zinc-800 font-semibold text-xs">Aucun écrit trouvé</h3>
                  <p className="text-[11px] text-zinc-400 max-w-xs font-sans">
                    Prenez la plume pour donner corps à vos pensées.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredArticles.map((art) => (
                  <div
                    key={art.id}
                    onMouseEnter={() => setHoveredArticleId(art.id)}
                    onMouseLeave={() => setHoveredArticleId(null)}
                    className="relative group border-b border-zinc-100/60 dark:border-zinc-900/40 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all -mx-4 px-4 rounded-xl"
                  >
                    {/* Sliding Hover Highlight Background */}
                    {hoveredArticleId === art.id && (
                      <motion.div
                        layoutId="hoverHighlight"
                        className="absolute inset-0 bg-zinc-100/45 dark:bg-zinc-900/35 rounded-xl -z-10"
                        transition={{ type: "spring", stiffness: 350, damping: 32 }}
                      />
                    )}

                    {/* Left: Text & minimal status */}
                    <div className="space-y-1.5 flex-1 min-w-0 z-10">
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500 font-sans">
                        {/* Clean minimal date */}
                        <span className="flex items-center gap-1 font-mono text-[10px]">
                          {new Date(art.createdAt).toLocaleDateString("fr-FR", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>

                        <span className="text-zinc-200 dark:text-zinc-800">•</span>

                        {/* Quiet Status Dot */}
                        <span className="flex items-center gap-1">
                          <span className={cn("h-1.5 w-1.5 rounded-full", art.published ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700")} />
                          {art.published ? "Publié" : "Brouillon"}
                        </span>

                        {/* Quiet Premium Label */}
                        {art.isPremium && (
                          <>
                            <span className="text-zinc-200 dark:text-zinc-800">•</span>
                            <span className="font-semibold text-zinc-600 dark:text-zinc-400">Premium</span>
                          </>
                        )}

                        {/* Category Label */}
                        {art.category && (
                          <>
                            <span className="text-zinc-200 dark:text-zinc-800">•</span>
                            <span className="text-zinc-500 dark:text-zinc-400">{art.category.name}</span>
                          </>
                        )}
                      </div>

                      {/* Title - large, sans-serif or crisp, spacious layout */}
                      <h3 className="text-base font-medium text-zinc-900 dark:text-zinc-50 group-hover:text-primary transition-colors font-sans tracking-tight">
                        {art.title}
                      </h3>
                      
                      {/* URL Slug preview */}
                      <p className="text-xs text-zinc-400 dark:text-zinc-600 font-mono">
                        /{art.slug}
                      </p>
                    </div>

                    {/* Right: minimal quiet controls (only visible on hover or mobile) */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center opacity-70 group-hover:opacity-100 transition-opacity z-10">
                      <a
                        href={`/dashboard/articles/${art.id}`}
                        className="inline-flex items-center justify-center h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-50 hover:bg-zinc-50 dark:hover:bg-zinc-800 font-sans text-xs font-semibold transition-colors"
                        title="Éditer"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span className="ml-1.5 hidden sm:inline">Écrire</span>
                      </a>

                      <button
                        onClick={() => handleDeleteArticle(art.id, art.title)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors cursor-pointer"
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
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-sans">
                Thèmes existants
              </h2>

              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-2 font-sans">
                  <Tag className="h-6 w-6 text-zinc-300 stroke-[1.5]" />
                  <p className="text-xs text-zinc-400 max-w-xs font-sans">
                    Aucun thème créé pour le moment.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {categories.map((cat) => (
                    <div
                      key={cat.id}
                      className="py-5 flex items-center justify-between gap-6 transition-all hover:bg-zinc-50/50 -mx-4 px-4 rounded-xl"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 font-sans">{cat.name}</h3>
                          <span className="text-[10px] text-zinc-400 font-sans font-medium">
                            ({cat._count.articles} {cat._count.articles > 1 ? "articles" : "article"})
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 font-sans leading-relaxed">
                          {cat.description || "Aucune description."}
                        </p>
                        <div className="text-[10px] font-mono text-zinc-400">
                          /{cat.slug}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-transparent hover:border-zinc-200 text-zinc-400 hover:text-red-500 hover:bg-zinc-50 transition-colors cursor-pointer"
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
                  <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-wider font-sans">
                    Nouveau Thème
                  </h2>
                  <p className="text-zinc-400 text-xs leading-normal">
                    Regroupez vos articles autour de concepts clés.
                  </p>
                </div>

                <form onSubmit={handleCreateCategory} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                      Nom du thème
                    </label>
                    <input
                      type="text"
                      value={newCatName}
                      onChange={handleCategoryNameChange}
                      placeholder="Ex: Poésie, Réflexions..."
                      required
                      className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs text-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                      Identifiant URL (Slug)
                    </label>
                    <input
                      type="text"
                      value={newCatSlug}
                      onChange={(e) => setNewCatSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))}
                      placeholder="Ex: poesie"
                      required
                      className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs font-mono text-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-sans font-semibold">
                      Description
                    </label>
                    <textarea
                      rows={3}
                      value={newCatDesc}
                      onChange={(e) => setNewCatDesc(e.target.value)}
                      placeholder="Écrivez une courte description..."
                      className="w-full bg-white border border-zinc-200 rounded-lg p-2 text-xs text-zinc-700 focus:outline-none focus:border-zinc-400 transition-colors font-sans resize-none"
                    />
                  </div>

                  {categoryError && (
                    <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-lg text-[11px] leading-relaxed flex gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{categoryError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isCreatingCategory || !newCatName.trim()}
                    className="w-full h-8 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-sans font-semibold text-xs rounded-lg transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
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
