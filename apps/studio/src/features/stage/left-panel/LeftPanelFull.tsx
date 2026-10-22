// =====================================================================
// LeftPanelFull.tsx — rail 2 niveaux
// Porté d'Onlook left-panel/design-panel (layers-tree, brand, pages,
// images, windows, zoom-controls, help). DOM direct, pas d'iframe.
// =====================================================================

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Layers,
  PlusCircle,
  Palette,
  FileText,
  Image as ImageIcon,
  Monitor,
  Eye,
  EyeOff,
  Trash2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  Newspaper,
  RectangleHorizontal,
  Mail,
  PanelBottom,
  HelpCircle,
  X,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Search,
  Copy,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStageEngine, StageEditorMode } from '../context/StageEngineContext';
import { ARTICLE_VARIANTS, type BlockType, type TemplateBlock } from '@qoe/ui/templates';

const BLOCK_CATALOG: {
  type: BlockType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    type: 'article-content',
    label: "Contenu de l'article",
    description: 'Titre, méta, couverture et corps.',
    icon: FileText,
  },
  {
    type: 'hero',
    label: 'Bannière',
    description: 'Titre et image large.',
    icon: RectangleHorizontal,
  },
  {
    type: 'lead-story',
    label: 'Article vedette',
    description: 'Image large et extrait.',
    icon: Newspaper,
  },
  {
    type: 'bento-grid',
    label: 'Grille',
    description: '2 à 3 cartes.',
    icon: LayoutGrid,
  },
  {
    type: 'article-stream',
    label: "Flux d'articles",
    description: 'Liste des publications.',
    icon: Newspaper,
  },
  {
    type: 'category-spotlight',
    label: 'Encadré rubrique',
    description: 'Sélection par rubrique.',
    icon: LayoutGrid,
  },
  {
    type: 'newsletter-wall',
    label: "Mur d'abonnement",
    description: 'Formulaire email.',
    icon: Mail,
  },
  {
    type: 'footer',
    label: 'Pied de Page',
    description: 'Liens et mentions.',
    icon: PanelBottom,
  },
];

const ACCENT_PRESETS = ['#111111', '#EE4B2B'];
const ACCENT_PRESETS_ADVANCED = ['#2563EB', '#16A34A', '#7C3AED', '#F59E0B'];
const FONT_OPTIONS = ['Inter', 'Georgia', 'Times New Roman', 'Menlo', 'System UI'];

type TabId = 'layers' | 'blocks' | 'brand' | 'pages' | 'images' | 'windows';

function getBlockName(block: TemplateBlock) {
  switch (block.type) {
    case 'navbar':
      return 'En-tête & Navigation';
    case 'hero':
      return 'Bannière';
    case 'lead-story':
      return 'Article vedette';
    case 'bento-grid':
      return 'Grille';
    case 'article-stream':
      return "Flux d'articles";
    case 'newsletter-wall':
      return "Mur d'abonnement";
    case 'article-content':
      return "Contenu de l'article";
    case 'category-spotlight':
      return 'Encadré rubrique';
    case 'article-content':
      return "Contenu de l'article";
    case 'footer':
      return 'Pied de Page';
    default:
      return block.type;
  }
}

function LayersTab() {
  const engine = useStageEngine();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const blocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return engine.layout.blocks;
    return engine.layout.blocks.filter((b) => getBlockName(b).toLowerCase().includes(q));
  }, [engine.layout.blocks, query]);

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2 py-1.5">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrer les calques"
          className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/60"
        />
      </label>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span>Page · Accueil ({engine.layout.blocks.length})</span>
      </button>
      {!collapsed && (
        <div className="space-y-0.5">
          {blocks.map((block: TemplateBlock, index: number) => {
            const isSelected = engine.selectedBlockId === block.id;
            const isFrame = block.type === 'navbar' || block.type === 'footer';
            return (
              <div
                key={block.id}
                draggable
                onDragStart={(e) => {
                  setDragId(block.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== block.id) {
                    const to = engine.layout.blocks.findIndex((b) => b.id === block.id);
                    engine.moveBlockTo(dragId, to);
                  }
                  setDragId(null);
                }}
                onClick={() => engine.selectBlock(block.id)}
                className={`group flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 transition-all ${
                  dragId === block.id ? 'opacity-50' : ''
                } ${
                  isSelected
                    ? 'bg-primary/10 font-medium text-foreground ring-1 ring-primary/40'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                } ${!block.visible ? 'opacity-45' : ''}`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="font-mono text-[11px] text-muted-foreground/60">
                    {isFrame ? '#' : '◇'}
                  </span>
                  <span className="truncate text-[11px]">{getBlockName(block)}</span>
                  <span className="hidden font-mono text-[9px] text-muted-foreground/60 group-hover:inline">
                    {(block.oid ?? block.id).slice(0, 6)}
                  </span>
                  {block.locked && <Lock className="h-2.5 w-2.5 text-muted-foreground" />}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title={block.visible ? 'Masquer' : 'Afficher'}
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.toggleVisibility(block.id);
                    }}
                    className="rounded p-1 hover:text-foreground"
                  >
                    {block.visible ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3 text-destructive" />
                    )}
                  </button>
                  <button
                    type="button"
                    title={block.locked ? 'Déverrouiller' : 'Verrouiller'}
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.toggleLock(block.id);
                    }}
                    className="rounded p-1 hover:text-foreground"
                  >
                    {block.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  </button>
                  <button
                    type="button"
                    disabled={index === 0 || !!block.locked}
                    title="Monter"
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.moveBlock(block.id, 'up');
                    }}
                    className="rounded p-1 hover:text-foreground disabled:opacity-20"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={index === engine.layout.blocks.length - 1 || !!block.locked}
                    title="Descendre"
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.moveBlock(block.id, 'down');
                    }}
                    className="rounded p-1 hover:text-foreground disabled:opacity-20"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={!!block.locked}
                    title="Supprimer"
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.deleteBlock(block.id);
                    }}
                    className="rounded p-1 hover:text-destructive disabled:opacity-20"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {blocks.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              Aucun calque ne correspond.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function BrandTab() {
  const engine = useStageEngine();
  const accent = engine.layout.tokens.accentColor || '#EE4B2B';
  const font = engine.layout.tokens.fontFamily || 'Inter';
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Couleur d&apos;accent
        </div>
        <div className="flex items-center gap-1.5">
          <label
            className="h-7 w-7 cursor-pointer rounded-lg border border-border shadow-sm"
            style={{ backgroundColor: accent }}
            title="Pipette"
          >
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#EE4B2B'}
              onChange={(e) => engine.updateTokens({ accentColor: e.target.value })}
              className="h-0 w-0 opacity-0"
            />
          </label>
          <input
            value={accent}
            onChange={(e) => engine.updateTokens({ accentColor: e.target.value })}
            className="w-24 rounded-lg border border-border/60 bg-muted/50 px-2 py-1 font-mono text-[11px] uppercase"
          />
          <div className="flex gap-1">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => engine.updateTokens({ accentColor: c })}
                className="h-5 w-5 rounded border border-border/60"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Plus de couleurs</summary>
            <div className="mt-1.5 flex gap-1">
              {ACCENT_PRESETS_ADVANCED.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => engine.updateTokens({ accentColor: c })}
                  className="h-5 w-5 rounded border border-border/60"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </details>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Typographie globale
        </div>
        <select
          value={font}
          onChange={(e) => engine.updateTokens({ fontFamily: e.target.value })}
          className="w-full rounded-lg border border-border/60 bg-muted/50 px-2 py-1.5 text-xs"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Silhouette des cartes
        </span>
        <div className="grid grid-cols-3 gap-1">
          {(['rounded-none', 'rounded-xl', 'rounded-3xl'] as const).map((shape) => (
            <button
              key={shape}
              type="button"
              onClick={() => engine.updateTokens({ cardShape: shape })}
              className={`rounded-lg px-2 py-1.5 text-center font-medium transition-all ${engine.layout.tokens.cardShape === shape ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >
              {shape === 'rounded-none' ? 'Carré' : shape === 'rounded-xl' ? 'Arrondi' : 'Large'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Densité
        </span>
        <div className="grid grid-cols-3 gap-1">
          {(['compact', 'standard', 'spacious'] as const).map((dens) => (
            <button
              key={dens}
              type="button"
              onClick={() => engine.updateTokens({ density: dens })}
              className={`rounded-lg px-1 py-1.5 text-center text-[10px] font-medium capitalize transition-all ${engine.layout.tokens.density === dens ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >
              {dens === 'compact' ? 'Compact' : dens === 'standard' ? 'Standard' : 'Aéré'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Surface
        </span>
        <div className="grid grid-cols-3 gap-1">
          {(['flat', 'bordered', 'glassmorphic'] as const).map((surf) => (
            <button
              key={surf}
              type="button"
              onClick={() => engine.updateTokens({ surface: surf })}
              className={`rounded-lg px-1 py-1.5 text-center text-[10px] font-medium capitalize transition-all ${engine.layout.tokens.surface === surf ? 'bg-primary text-primary-foreground shadow-xs' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
            >
              {surf === 'flat' ? 'Plat' : surf === 'bordered' ? 'Bordé' : 'Verre'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PagesTab() {
  const engine = useStageEngine();
  const [query, setQuery] = useState('');
  useEffect(() => {
    void engine.loadSnapshots();
  }, [engine.loadSnapshots]);
  const nav = engine.publication.navigation || [];
  const childrenOf = (parentId: string | null) =>
    nav.filter((n) => (n.parentId ?? null) === parentId);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();
  const filtered = q ? nav.filter((n) => n.label.toLowerCase().includes(q)) : null;

  const renderTree = (parentId: string | null, depth: number): React.ReactNode =>
    childrenOf(parentId).map((n) => {
      const kids = childrenOf(n.id);
      const isOpen = open[n.id] ?? true;
      return (
        <div key={n.id}>
          <div
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            {kids.length > 0 ? (
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [n.id]: !isOpen }))}
                className="p-0.5"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <span className="w-4 text-center font-mono text-[10px] text-primary/70">#</span>
            )}
            <span className="truncate text-[11px] font-medium text-foreground">{n.label}</span>
            {n.isExternal && <span className="rounded bg-muted px-1 font-mono text-[9px]">↗</span>}
          </div>
          {kids.length > 0 && isOpen && renderTree(n.id, depth + 1)}
        </div>
      );
    });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/50 bg-muted/40 p-1">
        {(['home', 'article'] as const).map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => engine.setStagePage(page)}
            className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
              engine.stagePage === page
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {page === 'home' ? 'Accueil' : 'Article'}
          </button>
        ))}
      </div>

      {engine.stagePage === 'article' && (
        <div className="space-y-1.5 rounded-lg border border-border/50 p-2">
          <div className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
            Rubrique
          </div>
          <select
            value={engine.articleCategory ?? ''}
            onChange={(e) => engine.setArticleCategory(e.target.value || null)}
            className="w-full rounded-lg border border-border/60 bg-muted/50 px-2 py-1.5 text-xs"
          >
            <option value="">Toutes les rubriques</option>
            {(engine.publication.categories || []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
            Type de vue article
          </div>
          {ARTICLE_VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => engine.applyArticleVariant(v.id)}
              className="w-full rounded-lg border border-border/40 p-2 text-left hover:border-border"
            >
              <div className="text-[12px] font-medium text-foreground">{v.name}</div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{v.description}</p>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5 rounded-lg border border-border/50 p-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
            Versions publiées
          </span>
          <button
            type="button"
            onClick={() => engine.loadSnapshots()}
            className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium hover:text-foreground"
          >
            Actualiser
          </button>
        </div>
        {engine.snapshotsLoading && (
          <p className="px-1 text-[10px] text-muted-foreground">Chargement…</p>
        )}
        {!engine.snapshotsLoading && engine.snapshots.length === 0 && (
          <p className="px-1 text-[10px] text-muted-foreground">
            Chaque publication archive ici l&apos;ancienne version.
          </p>
        )}
        {engine.snapshots.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-1 rounded-md bg-muted/40 px-2 py-1.5"
          >
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium">{s.label || 'Version'}</p>
              <p className="font-mono text-[9px] text-muted-foreground">
                {new Date(s.createdAt).toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => engine.restoreSnapshot(s.id)}
                className="rounded p-1 text-[11px] font-medium text-primary hover:bg-muted"
                title="Restaurer vers le brouillon"
              >
                Restaurer
              </button>
            </div>
          </div>
        ))}
      </div>
      <label className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2 py-1.5">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une page"
          className="w-full bg-transparent text-[11px] outline-none"
        />
      </label>
      {filtered ? (
        <div className="space-y-0.5">
          {filtered.map((n) => (
            <div key={n.id} className="flex items-center gap-2 px-2 py-1.5 text-foreground">
              <span className="font-mono text-[10px] text-primary">#</span>
              <span className="text-[11px] font-medium">{n.label}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">Aucune page.</p>
          )}
        </div>
      ) : (
        <div>
          {renderTree(null, 0)}
          {nav.length === 0 && (
            <p className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground">
              Aucune page pour le moment.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ImagesTab() {
  const engine = useStageEngine();
  const [query, setQuery] = useState('');
  const assets = useMemo(() => {
    const out: { url: string; label: string }[] = [];
    if (engine.publication.logoUrl) out.push({ url: engine.publication.logoUrl, label: 'Logo' });
    if (engine.publication.headerImageUrl)
      out.push({ url: engine.publication.headerImageUrl, label: 'Couverture' });
    for (const a of engine.articles) {
      if (a.imageUrl) out.push({ url: a.imageUrl, label: a.title });
    }
    const seen = new Set<string>();
    return out.filter((a) => (seen.has(a.url) ? false : (seen.add(a.url), true)));
  }, [engine.publication, engine.articles]);
  const q = query.trim().toLowerCase();
  const list = q ? assets.filter((a) => a.label.toLowerCase().includes(q)) : assets;
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2 py-1.5">
        <Search className="h-3 w-3 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un visuel"
          className="w-full bg-transparent text-[11px] outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        {list.map((a) => (
          <div key={a.url} className="group overflow-hidden rounded-xl border border-border/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.url}
              alt={a.label}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
            <div className="flex items-center justify-between gap-1 p-1.5">
              <span className="truncate text-[10px] text-muted-foreground" title={a.label}>
                {a.label}
              </span>
              <button
                type="button"
                title="Copier l'URL"
                onClick={() => void navigator.clipboard?.writeText(a.url).catch(() => null)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {list.length === 0 && (
        <p className="px-2 py-2 text-[11px] text-muted-foreground">
          Aucun visuel : publiez un article avec image.
        </p>
      )}
    </div>
  );
}

function WindowsTab() {
  const engine = useStageEngine();
  const widths = [
    { id: 'desktop' as const, label: 'Desktop', w: 1280 },
    { id: 'tablet' as const, label: 'Tablette', w: 768 },
    { id: 'mobile' as const, label: 'Mobile', w: 390 },
  ];
  return (
    <div className="space-y-3">
      <div className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
        Cadre & appareil
      </div>
      {widths.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => engine.setDevice(d.id)}
          className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left ${engine.device === d.id ? 'border-primary bg-primary/10' : 'border-border/40 hover:border-border'}`}
        >
          <span className="flex items-center gap-2 text-[12px] font-medium">
            <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
            {d.label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">{d.w}px</span>
        </button>
      ))}
      <div className="space-y-1.5 border-t border-border/40 pt-2">
        <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
          Zoom précis
        </span>
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: '50%', v: 0.5 },
            { label: '100%', v: 1 },
            { label: '200%', v: 2 },
            { label: 'Fit', v: 0.95 },
          ].map((z) => (
            <button
              key={z.label}
              type="button"
              onClick={() => engine.setScale(z.v)}
              className="rounded-lg bg-muted/50 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              {z.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={engine.resetZoom}
          className="w-full rounded-lg border border-border/50 py-1.5 text-[11px] hover:bg-muted/50"
        >
          Recentrer (⇧0)
        </button>
      </div>
    </div>
  );
}

export function LeftPanelFull() {
  const engine = useStageEngine();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isZoomMenuOpen, setIsZoomMenuOpen] = useState(false);

  if (engine.editorMode === StageEditorMode.PREVIEW) {
    return null;
  }

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'layers', label: 'Calques', icon: Layers },
    { id: 'blocks', label: 'Blocs', icon: PlusCircle },
    { id: 'brand', label: 'Style', icon: Palette },
    { id: 'pages', label: 'Pages', icon: FileText },
    { id: 'images', label: 'Visuels', icon: ImageIcon },
    { id: 'windows', label: 'Cadre', icon: Monitor },
  ];

  const handleTabClick = (tabId: TabId) => {
    if (engine.leftPanelTab === tabId && engine.leftPanelLocked) {
      engine.setLeftPanelTab(null);
      engine.setLeftPanelLocked(false);
    } else {
      engine.setLeftPanelTab(tabId);
      engine.setLeftPanelLocked(true);
    }
  };

  const titles: Record<TabId, string> = {
    layers: 'Arborescence des calques',
    blocks: 'Bibliothèque de blocs',
    brand: 'Marque & tokens',
    pages: 'Pages & navigation',
    images: 'Visuels & médias',
    windows: 'Cadre & zoom',
  };

  return (
    <div className="absolute top-4 left-4 z-40 flex items-stretch gap-2 text-xs select-none">
      <div className="flex w-16 flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-background/90 py-2 shadow-sm backdrop-blur-md">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = engine.leftPanelTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-xl transition-all ${
                isSelected
                  ? 'bg-primary font-medium text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[8px] leading-none font-medium">{tab.label}</span>
            </button>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-1.5 border-t border-border/40 pt-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsZoomMenuOpen((p) => !p)}
              title="Contrôles de zoom"
              className="flex h-8 w-10 items-center justify-center rounded-lg font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              {Math.round(engine.scale * 100)}%
            </button>
            {isZoomMenuOpen && (
              <div className="absolute bottom-0 left-12 z-50 w-40 space-y-1 rounded-lg border border-border bg-background/95 p-1.5 shadow-md">
                {[
                  { label: 'Zoom avant', hint: '⌘+', fn: engine.zoomIn },
                  { label: 'Zoom arrière', hint: '⌘-', fn: engine.zoomOut },
                  { label: 'Recentrer', hint: '⇧0', fn: engine.resetZoom },
                  { label: '50%', hint: '', fn: () => engine.setScale(0.5) },
                  { label: '100%', hint: '', fn: () => engine.setScale(1) },
                  { label: '200%', hint: '', fn: () => engine.setScale(2) },
                ].map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => {
                      b.fn();
                      setIsZoomMenuOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-[11px] hover:bg-muted"
                  >
                    <span>{b.label}</span>
                    <span className="font-mono text-muted-foreground">{b.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            title="Raccourcis & Aide"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {engine.leftPanelTab && (
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ type: 'spring', bounce: 0.1, duration: 0.3 }}
            className="flex max-h-[calc(100vh-140px)] w-72 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-sm backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 p-3">
              <span className="font-semibold text-foreground">
                {titles[engine.leftPanelTab as TabId]}
              </span>
              <button
                type="button"
                onClick={() => engine.setLeftPanelTab(null)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {engine.leftPanelTab === 'layers' && <LayersTab />}
              {engine.leftPanelTab === 'blocks' && (
                <div className="space-y-2">
                  <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                    Ajouter une section
                  </div>
                  {BLOCK_CATALOG.filter((cat) =>
                    engine.stagePage === 'article'
                      ? cat.type === 'article-content' ||
                        cat.type === 'category-spotlight' ||
                        cat.type === 'newsletter-wall' ||
                        cat.type === 'footer'
                      : cat.type !== 'article-content'
                  ).map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <div
                        key={cat.type}
                        onClick={() => {
                          engine.addBlock(cat.type, cat.label);
                          engine.setLeftPanelTab('layers');
                        }}
                        className="group cursor-pointer space-y-1 rounded-xl border border-border/40 bg-card p-2.5 transition-all hover:border-primary/50 hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-2 font-medium text-foreground transition-colors group-hover:text-primary">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{cat.label}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {cat.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              {engine.leftPanelTab === 'brand' && <BrandTab />}
              {engine.leftPanelTab === 'pages' && <PagesTab />}
              {engine.leftPanelTab === 'images' && <ImagesTab />}
              {engine.leftPanelTab === 'windows' && <WindowsTab />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[360px] space-y-4 rounded-xl border border-border bg-background p-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-border/40 pb-2">
              <span className="text-sm font-bold text-foreground">Raccourcis clavier</span>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ['Sélection', 'V'],
                ['Outil main / Pan', 'H'],
                ['Déplacement libre', 'Espace + Glisser'],
                ['Mesurer les distances', 'Alt + Survol'],
                ['Zoom', '⌘ + Molette'],
                ['Recentrer', '⇧ + 0'],
                ['Dupliquer le bloc', '⌘ + D'],
                ['Supprimer le bloc', '⌫ / Suppr'],
                ['Annuler / Rétablir', '⌘Z / ⌘⇧Z'],
              ].map(([label, key]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-border/30 py-1 last:border-0"
                >
                  <span className="text-muted-foreground">{label}</span>
                  <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono font-bold">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
