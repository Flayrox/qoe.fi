"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Star, TrendingUp, Megaphone, Trash2, Plus, Save, Search, ToggleLeft, ToggleRight } from "lucide-react"
import { toggleFeaturedArticle, addTrend, deleteTrend, updateTrendCount, savePromo, deletePromo, togglePromoActive } from "../actions"
import { cn } from "@qoe/utils"

interface Article {
  id: string
  title: string
  slug: string
  published: boolean
  isEditorPick: boolean
  createdAt: any
  author: {
    name: string | null
    email: string
  }
}

interface Trend {
  id: string
  hashtag: string
  count: number
}

interface PartnerPromo {
  id: string
  title: string
  description: string
  ctaText: string | null
  ctaUrl: string | null
  imageUrl: string | null
  isActive: boolean
}

interface WidgetsCMSProps {
  articles: Article[]
  trends: Trend[]
  promos: PartnerPromo[]
}

const springs = {
  tab: { type: "spring" as const, stiffness: 400, damping: 30 },
  card: { type: "spring" as const, stiffness: 350, damping: 28 },
}

export function WidgetsCMS({ articles, trends: initialTrends, promos: initialPromos }: WidgetsCMSProps) {
  const [activeTab, setActiveTab] = useState<"featured" | "trends" | "promos">("featured")
  
  // Local state for instant feedback
  const [searchQuery, setSearchQuery] = useState("")
  const [trends, setTrends] = useState<Trend[]>(initialTrends)
  const [promos, setPromos] = useState<PartnerPromo[]>(initialPromos)
  const [featuredArticles, setFeaturedArticles] = useState<Article[]>(articles)
  
  // Trend Form States
  const [newHashtag, setNewHashtag] = useState("")
  const [newCount, setNewCount] = useState(100)
  
  // Promo Form States
  const [promoTitle, setPromoTitle] = useState("")
  const [promoDesc, setPromoDesc] = useState("")
  const [promoCtaText, setPromoCtaText] = useState("")
  const [promoCtaUrl, setPromoCtaUrl] = useState("")

  // Filtered articles
  const filteredArticles = featuredArticles.filter(art => 
    art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (art.author.name && art.author.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // Handlers
  const handleToggleFeatured = async (id: string) => {
    // Optimistic toggle
    setFeaturedArticles(prev => prev.map(art => {
      if (art.id === id) {
        return { ...art, isEditorPick: !art.isEditorPick }
      }
      return { ...art, isEditorPick: false } // Only one featured article at a time
    }))

    const res = await toggleFeaturedArticle(id)
    if (!res.success) {
      // Revert on error
      setFeaturedArticles(articles)
      alert(res.error || "Erreur de mise à jour")
    }
  };

  const handleAddTrend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHashtag) return

    const res = await addTrend(newHashtag, newCount)
    if (res.success) {
      setNewHashtag("")
      setNewCount(100)
      window.location.reload() // Reload to fetch fresh server data
    } else {
      alert(res.error)
    }
  };

  const handleDeleteTrend = async (id: string) => {
    if (!confirm("Supprimer cette tendance ?")) return
    setTrends(prev => prev.filter(t => t.id !== id))
    const res = await deleteTrend(id)
    if (!res.success) {
      setTrends(initialTrends)
    }
  };

  const handleUpdateTrend = async (id: string, count: number) => {
    const res = await updateTrendCount(id, count)
    if (res.success) {
      alert("Tendance mise à jour !")
    } else {
      alert(res.error)
    }
  };

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!promoTitle || !promoDesc) return

    const res = await savePromo(null, promoTitle, promoDesc, promoCtaText || null, promoCtaUrl || null, true)
    if (res.success) {
      setPromoTitle("")
      setPromoDesc("")
      setPromoCtaText("")
      setPromoCtaUrl("")
      window.location.reload()
    } else {
      alert(res.error)
    }
  };

  const handleTogglePromo = async (id: string, currentActive: boolean) => {
    setPromos(prev => prev.map(p => p.id === id ? { ...p, isActive: !currentActive } : p))
    const res = await togglePromoActive(id, !currentActive)
    if (!res.success) {
      setPromos(initialPromos)
    }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm("Supprimer cette promotion ?")) return
    setPromos(prev => prev.filter(p => p.id !== id))
    const res = await deletePromo(id)
    if (!res.success) {
      setPromos(initialPromos)
    }
  };

  return (
    <div className="space-y-8">
      {/* Tabs Menu */}
      <div className="flex border-b border-neutral-200 gap-6">
        {[
          { id: "featured", label: "Article à la une", icon: Star },
          { id: "trends", label: "Tendances", icon: TrendingUp },
          { id: "promos", label: "Publicités & Partenaires", icon: Megaphone },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "relative pb-3 flex items-center gap-2 text-sm font-semibold transition-colors outline-none cursor-pointer",
                isActive ? "text-[var(--qoe-vermillion)]" : "text-neutral-450 hover:text-neutral-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}

              {isActive && (
                <motion.div
                  layoutId="activeAdminTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--qoe-vermillion)]"
                  transition={springs.tab}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Contents */}
      <div className="py-2">
        <AnimatePresence mode="wait">
          {activeTab === "featured" && (
            <motion.div
              key="featured-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-3 bg-neutral-50 px-3 py-2 rounded-lg border border-neutral-200/50 w-full max-w-sm">
                <Search className="w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Rechercher un article ou un auteur..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent border-none p-0 text-sm focus:ring-0 w-full outline-none"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="py-2 text-neutral-500 font-semibold text-xs w-1/2">Titre</th>
                      <th className="py-2 text-neutral-500 font-semibold text-xs w-1/4">Auteur</th>
                      <th className="py-2 text-neutral-500 font-semibold text-xs w-1/8">Statut</th>
                      <th className="py-2 text-neutral-500 font-semibold text-xs text-right w-1/8">Mise en avant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredArticles.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-neutral-500 text-sm">
                          Aucun article trouvé.
                        </td>
                      </tr>
                    ) : (
                      filteredArticles.map(art => (
                        <tr key={art.id} className="border-b border-neutral-100/50 hover:bg-neutral-50/30 transition-colors">
                          <td className="py-3 pr-4 align-middle">
                            <span className="text-sm font-semibold text-neutral-900 block truncate max-w-md">
                              {art.title}
                            </span>
                            <span className="text-[10px] text-neutral-400 block mt-0.5">
                              Publié le {new Date(art.createdAt).toLocaleDateString("fr-FR")}
                            </span>
                          </td>
                          <td className="py-3 text-sm text-neutral-600 align-middle">
                            {art.author.name || art.author.email}
                          </td>
                          <td className="py-3 align-middle">
                            <span className={cn(
                              "inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                              art.published ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                            )}>
                              {art.published ? "Publié" : "Brouillon"}
                            </span>
                          </td>
                          <td className="py-3 text-right align-middle">
                            <button
                              onClick={() => handleToggleFeatured(art.id)}
                              className={cn(
                                "text-xs font-bold px-3 py-1.5 rounded transition-all cursor-pointer",
                                art.isEditorPick
                                  ? "bg-[var(--qoe-vermillion)] text-white shadow-sm"
                                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                              )}
                            >
                              {art.isEditorPick ? "★ À la une" : "Mettre à la une"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "trends" && (
            <motion.div
              key="trends-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Form Add Trend */}
              <form onSubmit={handleAddTrend} className="flex flex-col md:flex-row items-end gap-4 border-b border-neutral-200 pb-6">
                <div className="flex-1 w-full space-y-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Hashtag</label>
                  <input
                    type="text"
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    placeholder="#attention"
                    className="w-full bg-transparent border-none px-0 py-1 text-sm font-semibold text-neutral-900 placeholder:text-neutral-300 focus:ring-0 outline-none"
                    required
                  />
                </div>
                
                <div className="w-full md:w-48 space-y-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Volume (lectures)</label>
                  <input
                    type="number"
                    value={newCount}
                    onChange={(e) => setNewCount(parseInt(e.target.value) || 0)}
                    placeholder="1200"
                    className="w-full bg-transparent border-none px-0 py-1 text-sm font-semibold text-neutral-900 placeholder:text-neutral-300 focus:ring-0 outline-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="text-sm font-bold text-white bg-[var(--qoe-vermillion)] hover:bg-[var(--qoe-vermillion)]/90 px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Ajouter la tendance
                </button>
              </form>

              {/* Trends List Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="py-2 text-neutral-500 font-semibold text-xs w-1/2">Hashtag</th>
                      <th className="py-2 text-neutral-500 font-semibold text-xs w-1/3">Volume lectures</th>
                      <th className="py-2 text-neutral-500 font-semibold text-xs text-right w-1/6">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trends.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-12 text-center text-neutral-500 text-sm">
                          Aucune tendance enregistrée.
                        </td>
                      </tr>
                    ) : (
                      trends.map(t => (
                        <tr key={t.id} className="border-b border-neutral-100/50 hover:bg-neutral-50/30 transition-colors group">
                          <td className="py-3 align-middle text-sm font-bold text-neutral-900">
                            {t.hashtag}
                          </td>
                          <td className="py-3 align-middle">
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                defaultValue={t.count}
                                onBlur={(e) => handleUpdateTrend(t.id, parseInt(e.target.value) || 0)}
                                className="w-24 bg-transparent border border-transparent hover:border-neutral-200 focus:border-neutral-300 px-1 py-0.5 rounded text-sm text-neutral-700 outline-none font-mono"
                              />
                              <span className="text-[10px] text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                (Sortir du champ pour enregistrer)
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-right align-middle">
                            <button
                              onClick={() => handleDeleteTrend(t.id)}
                              className="text-xs font-bold text-neutral-400 hover:text-red-500 p-1.5 rounded transition-colors cursor-pointer"
                              title="Supprimer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "promos" && (
            <motion.div
              key="promos-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Form Add Promo */}
              <form onSubmit={handleAddPromo} className="space-y-4 border-b border-neutral-200 pb-8">
                <h3 className="text-sm font-bold text-neutral-850">Ajouter une Publicité / Partenariat</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Titre du widget</label>
                    <input
                      type="text"
                      value={promoTitle}
                      onChange={(e) => setPromoTitle(e.target.value)}
                      placeholder="qoe.premium"
                      className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg text-sm font-semibold outline-none focus:border-neutral-300"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Texte du bouton (CTA)</label>
                    <input
                      type="text"
                      value={promoCtaText}
                      onChange={(e) => setPromoCtaText(e.target.value)}
                      placeholder="Découvrir l'offre"
                      className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg text-sm font-semibold outline-none focus:border-neutral-300"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Description</label>
                  <textarea
                    value={promoDesc}
                    onChange={(e) => setPromoDesc(e.target.value)}
                    placeholder="Soutenez le journalisme libre et sans bruit..."
                    rows={3}
                    className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg text-sm font-semibold outline-none focus:border-neutral-300 resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Lien de destination (CTA URL)</label>
                    <input
                      type="text"
                      value={promoCtaUrl}
                      onChange={(e) => setPromoCtaUrl(e.target.value)}
                      placeholder="/billing"
                      className="w-full bg-neutral-50 border border-neutral-200 px-3 py-2 rounded-lg text-sm font-semibold outline-none focus:border-neutral-300"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="text-sm font-bold text-white bg-[var(--qoe-vermillion)] hover:bg-[var(--qoe-vermillion)]/90 px-5 py-2.5 rounded-lg transition-colors cursor-pointer w-full md:w-auto"
                    >
                      Créer le widget publicitaire
                    </button>
                  </div>
                </div>
              </form>

              {/* Promo List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-neutral-850">Widgets Publicitaires Actifs</h3>
                
                {promos.length === 0 ? (
                  <p className="text-neutral-500 text-sm text-center py-8 bg-neutral-50/50 rounded-xl border border-neutral-200/30">
                    Aucune publicité configurée.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {promos.map(p => (
                      <div
                        key={p.id}
                        className={cn(
                          "bg-white border border-neutral-200/50 rounded-xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col justify-between relative",
                          p.isActive ? "ring-1 ring-emerald-500/20" : "opacity-75"
                        )}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                              Ad Widget
                            </span>
                            
                            <div className="flex items-center gap-3">
                              {/* Active toggle */}
                              <button
                                onClick={() => handleTogglePromo(p.id, p.isActive)}
                                className="text-neutral-450 hover:text-neutral-900 transition-colors cursor-pointer"
                                title={p.isActive ? "Désactiver" : "Activer"}
                              >
                                {p.isActive ? (
                                  <ToggleRight className="w-6 h-6 text-emerald-500" />
                                ) : (
                                  <ToggleLeft className="w-6 h-6 text-neutral-400" />
                                )}
                              </button>

                              {/* Delete button */}
                              <button
                                onClick={() => handleDeletePromo(p.id)}
                                className="text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <h4 className="text-sm font-bold text-neutral-900">{p.title}</h4>
                          <p className="text-xs text-neutral-600 leading-relaxed">{p.description}</p>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-neutral-100 mt-4 text-[10px] text-neutral-450">
                          <span>CTA Link: <code className="bg-neutral-50 px-1 py-0.5 rounded font-mono">{p.ctaUrl || "Aucun"}</code></span>
                          {p.ctaText && <span className="font-bold text-[var(--qoe-vermillion)]">{p.ctaText}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
