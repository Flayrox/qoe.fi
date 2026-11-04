'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, TrendingUp, Megaphone, Trash2, Search } from 'lucide-react';
import { ImageUploader } from '@qoe/ui/ui/ImageUploader';
import { uploadImageToRoute, IMAGE_FOLDERS } from '@qoe/supabase/storage';
import {
  toggleFeaturedArticle,
  addTrend,
  deleteTrend,
  updateTrendCount,
  savePromo,
  deletePromo,
  togglePromoActive,
} from '@/lib/admin-aux-actions';
import { cn } from '@qoe/utils';
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from '@qoe/ui/table';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, InputGroup, Textarea } from '@qoe/ui/input';
import { Switch } from '@qoe/ui/switch';

interface Article {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  isEditorPick: boolean;
  createdAt: Date;
  author: {
    name: string | null;
    email: string;
  };
}

interface Trend {
  id: string;
  hashtag: string;
  count: number;
}

interface PartnerPromo {
  id: string;
  title: string;
  description: string;
  ctaText: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

interface WidgetsCMSProps {
  articles: Article[];
  trends: Trend[];
  promos: PartnerPromo[];
}

const springs = {
  tab: { type: 'spring' as const, stiffness: 400, damping: 30 },
  card: { type: 'spring' as const, stiffness: 350, damping: 28 },
};

export function WidgetsCMS({
  articles,
  trends: initialTrends,
  promos: initialPromos,
}: WidgetsCMSProps) {
  const [activeTab, setActiveTab] = useState<'featured' | 'trends' | 'promos'>('featured');

  // Local state for instant feedback
  const [searchQuery, setSearchQuery] = useState('');
  const [trends, setTrends] = useState<Trend[]>(initialTrends);
  const [promos, setPromos] = useState<PartnerPromo[]>(initialPromos);
  const [featuredArticles, setFeaturedArticles] = useState<Article[]>(articles);

  // Trend Form States
  const [newHashtag, setNewHashtag] = useState('');
  const [newCount, setNewCount] = useState(100);

  // Promo Form States
  const [promoTitle, setPromoTitle] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [promoCtaText, setPromoCtaText] = useState('');
  const [promoCtaUrl, setPromoCtaUrl] = useState('');
  const [promoImageUrl, setPromoImageUrl] = useState<string | null>(null);

  // Filtered articles
  const filteredArticles = featuredArticles.filter(
    (art) =>
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (art.author.name && art.author.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Handlers
  const handleToggleFeatured = async (id: string) => {
    // Optimistic toggle
    setFeaturedArticles((prev) =>
      prev.map((art) => {
        if (art.id === id) {
          return { ...art, isEditorPick: !art.isEditorPick };
        }
        return { ...art, isEditorPick: false }; // Only one featured article at a time
      })
    );

    const res = await toggleFeaturedArticle(id);
    if (!res.success) {
      // Revert on error
      setFeaturedArticles(articles);
      alert(res.error || 'Erreur de mise à jour');
    }
  };

  const handleAddTrend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHashtag) return;

    const res = await addTrend(newHashtag, newCount);
    if (res.success) {
      setNewHashtag('');
      setNewCount(100);
      window.location.reload(); // Reload to fetch fresh server data
    } else {
      alert(res.error);
    }
  };

  const handleDeleteTrend = async (id: string) => {
    if (!confirm('Supprimer cette tendance ?')) return;
    setTrends((prev) => prev.filter((t) => t.id !== id));
    const res = await deleteTrend(id);
    if (!res.success) {
      setTrends(initialTrends);
    }
  };

  const handleUpdateTrend = async (id: string, count: number) => {
    const res = await updateTrendCount(id, count);
    if (res.success) {
      alert('Tendance mise à jour !');
    } else {
      alert(res.error);
    }
  };

  const handleAddPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoTitle || !promoDesc) return;

    const res = await savePromo(
      null,
      promoTitle,
      promoDesc,
      promoCtaText || null,
      promoCtaUrl || null,
      true,
      promoImageUrl
    );
    if (res.success) {
      setPromoTitle('');
      setPromoDesc('');
      setPromoCtaText('');
      setPromoCtaUrl('');
      setPromoImageUrl(null);
      window.location.reload();
    } else {
      alert(res.error);
    }
  };

  const handleTogglePromo = async (id: string, currentActive: boolean) => {
    setPromos((prev) => prev.map((p) => (p.id === id ? { ...p, isActive: !currentActive } : p)));
    const res = await togglePromoActive(id, !currentActive);
    if (!res.success) {
      setPromos(initialPromos);
    }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm('Supprimer cette promotion ?')) return;
    setPromos((prev) => prev.filter((p) => p.id !== id));
    const res = await deletePromo(id);
    if (!res.success) {
      setPromos(initialPromos);
    }
  };

  return (
    <div className="space-y-8">
      {/* Tabs Menu */}
      <div className="flex border-b border-border gap-6">
        {[
          { id: 'featured', label: 'Article à la une', icon: Star },
          { id: 'trends', label: 'Tendances', icon: TrendingUp },
          { id: 'promos', label: 'Publicités & Partenaires', icon: Megaphone },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'featured' | 'trends' | 'promos')}
              className={cn(
                'relative pb-3 flex items-center gap-2 text-sm font-semibold transition-colors outline-none cursor-pointer',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}

              {isActive && (
                <motion.div
                  layoutId="activeAdminTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={springs.tab}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="py-2">
        <AnimatePresence mode="wait">
          {activeTab === 'featured' && (
            <motion.div
              key="featured-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="max-w-sm w-full">
                <InputGroup size="sm" left={<Search className="w-4 h-4 text-muted-foreground" />}>
                  <Input
                    type="text"
                    placeholder="Rechercher un article ou un auteur..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </InputGroup>
              </div>

              <div className="overflow-x-auto">
                <Table aria-label="Articles à la une" size="sm">
                  <TableHeader>
                    <TableColumn isRowHeader>Titre</TableColumn>
                    <TableColumn>Auteur</TableColumn>
                    <TableColumn>Statut</TableColumn>
                    <TableColumn>Mise en avant</TableColumn>
                  </TableHeader>
                  <TableBody
                    items={filteredArticles}
                    renderEmptyState={() => (
                      <div className="py-12 text-center text-muted-foreground text-sm">
                        Aucun article trouvé.
                      </div>
                    )}
                  >
                    {(art) => (
                      <TableRow id={art.id}>
                        <TableCell className="align-middle">
                          <span className="text-sm font-semibold text-foreground block truncate max-w-md">
                            {art.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground block mt-0.5">
                            Publié le {new Date(art.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground align-middle">
                          {art.author.name || art.author.email}
                        </TableCell>
                        <TableCell className="align-middle">
                          <Badge
                            variant="soft"
                            tone={art.published ? 'success' : 'neutral'}
                            size="xs"
                          >
                            {art.published ? 'Publié' : 'Brouillon'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <Button
                            size="xs"
                            variant={art.isEditorPick ? 'solid' : 'soft'}
                            tone={art.isEditorPick ? 'brand' : 'neutral'}
                            onClick={() => handleToggleFeatured(art.id)}
                          >
                            {art.isEditorPick ? '★ À la une' : 'Mettre à la une'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          )}

          {activeTab === 'trends' && (
            <motion.div
              key="trends-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Form Add Trend */}
              <form
                onSubmit={handleAddTrend}
                className="flex flex-col md:flex-row items-end gap-4 border-b border-border pb-6"
              >
                <div className="flex-1 w-full space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Hashtag
                  </label>
                  <Input
                    type="text"
                    value={newHashtag}
                    onChange={(e) => setNewHashtag(e.target.value)}
                    placeholder="#attention"
                    size="sm"
                    required
                  />
                </div>

                <div className="w-full md:w-48 space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Volume (lectures)
                  </label>
                  <Input
                    type="number"
                    value={newCount}
                    onChange={(e) => setNewCount(parseInt(e.target.value) || 0)}
                    placeholder="1200"
                    size="sm"
                    required
                  />
                </div>

                <Button type="submit" variant="solid" tone="brand" size="sm">
                  Ajouter la tendance
                </Button>
              </form>

              {/* Trends List Table */}
              <div className="overflow-x-auto">
                <Table aria-label="Tendances" size="sm">
                  <TableHeader>
                    <TableColumn isRowHeader>Hashtag</TableColumn>
                    <TableColumn>Volume lectures</TableColumn>
                    <TableColumn>Actions</TableColumn>
                  </TableHeader>
                  <TableBody
                    items={trends}
                    renderEmptyState={() => (
                      <div className="py-12 text-center text-muted-foreground text-sm">
                        Aucune tendance enregistrée.
                      </div>
                    )}
                  >
                    {(t) => (
                      <TableRow id={t.id}>
                        <TableCell className="text-sm font-bold text-foreground align-middle">
                          {t.hashtag}
                        </TableCell>
                        <TableCell className="align-middle">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              defaultValue={t.count}
                              onBlur={(e) => handleUpdateTrend(t.id, parseInt(e.target.value) || 0)}
                              size="xs"
                              className="w-24 font-mono"
                            />
                            <span className="text-[10px] text-muted-foreground">
                              (Sortir du champ pour enregistrer)
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-middle">
                          <Button
                            variant="ghost"
                            size="xs"
                            shape="icon"
                            onClick={() => handleDeleteTrend(t.id)}
                            aria-label="Supprimer"
                            className="hover:text-destructive-text"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
          )}

          {activeTab === 'promos' && (
            <motion.div
              key="promos-tab"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="space-y-8"
            >
              {/* Form Add Promo */}
              <form onSubmit={handleAddPromo} className="space-y-4 border-b border-border pb-8">
                <h3 className="text-sm font-bold text-foreground">
                  Ajouter une Publicité / Partenariat
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Titre du widget
                    </label>
                    <Input
                      type="text"
                      value={promoTitle}
                      onChange={(e) => setPromoTitle(e.target.value)}
                      placeholder="qoe.premium"
                      size="sm"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Texte du bouton (CTA)
                    </label>
                    <Input
                      type="text"
                      value={promoCtaText}
                      onChange={(e) => setPromoCtaText(e.target.value)}
                      placeholder="Découvrir l'offre"
                      size="sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Description
                  </label>
                  <Textarea
                    value={promoDesc}
                    onChange={(e) => setPromoDesc(e.target.value)}
                    placeholder="Soutenez le journalisme libre et sans bruit..."
                    rows={3}
                    size="sm"
                    className="resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Lien de destination (CTA URL)
                    </label>
                    <Input
                      type="text"
                      value={promoCtaUrl}
                      onChange={(e) => setPromoCtaUrl(e.target.value)}
                      placeholder="/billing"
                      size="sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Image (facultatif)
                    </label>
                    <ImageUploader
                      value={promoImageUrl}
                      onChange={setPromoImageUrl}
                      upload={(file) =>
                        uploadImageToRoute(file, '/api/articles/upload', IMAGE_FOLDERS.articles)
                      }
                      shape="banner"
                      aspect={16 / 9}
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    type="submit"
                    variant="solid"
                    tone="brand"
                    size="md"
                    className="w-full md:w-auto"
                  >
                    Créer le widget publicitaire
                  </Button>
                </div>
              </form>

              {/* Promo List */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-foreground">Widgets Publicitaires Actifs</h3>

                {promos.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8 bg-muted/50 rounded-xl border border-border/30">
                    Aucune publicité configurée.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {promos.map((p) => (
                      <div
                        key={p.id}
                        className={cn(
                          'bg-card border border-border/50 rounded-xl p-5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col justify-between relative',
                          p.isActive ? 'ring-1 ring-success/20' : 'opacity-75'
                        )}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                              Ad Widget
                            </span>

                            <div className="flex items-center gap-3">
                              {/* Active toggle */}
                              <Switch
                                isSelected={p.isActive}
                                onChange={() => handleTogglePromo(p.id, p.isActive)}
                                aria-label={p.isActive ? 'Désactiver' : 'Activer'}
                                size="sm"
                              />

                              {/* Delete button */}
                              <Button
                                variant="ghost"
                                size="xs"
                                shape="icon"
                                onClick={() => handleDeletePromo(p.id)}
                                aria-label="Supprimer"
                                className="hover:text-destructive-text"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <h4 className="text-sm font-bold text-foreground">{p.title}</h4>
                          {p.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imageUrl}
                              alt={p.title}
                              className="w-full h-28 object-cover rounded-lg border border-border/50"
                              loading="lazy"
                            />
                          )}
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {p.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-border mt-4 text-[10px] text-muted-foreground">
                          <span>
                            CTA Link:{' '}
                            <code className="bg-muted px-1 py-0.5 rounded font-mono">
                              {p.ctaUrl || 'Aucun'}
                            </code>
                          </span>
                          {p.ctaText && <span className="font-bold text-primary">{p.ctaText}</span>}
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
  );
}
