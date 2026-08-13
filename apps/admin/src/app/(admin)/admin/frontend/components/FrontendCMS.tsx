'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Save,
  AlertCircle,
  RefreshCw,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Sparkles,
  Link as LinkIcon,
} from 'lucide-react';
import { saveMultipleFrontendConfigs } from '../actions';
import { ALL_LANGUAGES, type Language } from '@qoe/i18n';
import { t } from '@lingui/core/macro';

// Default presets for fallback and reset buttons
const PRESETS = {
  hero_reader_items_fr: [
    { type: 'label', text: 'Clara Lambert · Essai · 8 min' },
    { type: 'title', text: 'Le silence comme infrastructure' },
    {
      type: 'body',
      text: "Il y a des architectures invisibles. Non pas des bâtiments, mais des espaces mentaux — des structures que l'on construit délibérément pour penser mieux.",
    },
    {
      type: 'body',
      text: "Le silence est l'une d'entre elles. Non pas l'absence de son, mais l'absence de sollicitations qui se déguisent en urgences.",
    },
    { type: 'quote', text: '« On ne pense vraiment que dans les intervalles. »' },
    { type: 'divider', text: '' },
    { type: 'label', text: 'Julien Roche · Technologie · 5 min' },
    { type: 'title', text: 'Sortir du cloud des géants' },
    {
      type: 'body',
      text: "L'hébergement de nos médias indépendants ne peut plus reposer sur les serveurs des GAFAM. Ce n'est pas une question technique. C'est une question de souveraineté.",
    },
  ],
  hero_reader_items_en: [
    { type: 'label', text: 'Clara Lambert · Essay · 8 min' },
    { type: 'title', text: 'Silence as an infrastructure' },
    {
      type: 'body',
      text: 'There are invisible architectures. Not buildings, but mental spaces — structures we build deliberately to think better.',
    },
    {
      type: 'body',
      text: 'Silence is one of them. Not the absence of sound, but the absence of prompts disguised as emergencies.',
    },
    { type: 'quote', text: '“We only truly think in the intervals.”' },
    { type: 'divider', text: '' },
    { type: 'label', text: 'Julien Roche · Technology · 5 min' },
    { type: 'title', text: "Stepping out of the giants' cloud" },
    {
      type: 'body',
      text: 'Hosting our independent media can no longer rely on GAFAM servers. It is not a technical question. It is a matter of sovereignty.',
    },
  ],
  creator_hub_tabs_fr: [
    {
      tab: 'Créateurs',
      eyebrow: 'Journalistes, essayistes, collectifs',
      headline: 'Votre média en 3 minutes.',
      body: "Pas de code. Pas de serveur. Pas de comptable. Vous avez une voix — nous vous donnons l'infrastructure. Sous-domaine personnalisé, SSL automatique, éditeur riche, newsletter intégrée, paiement direct.",
      features: [
        'Sous-domaine media.qoe.fi ou votre propre domaine',
        'Éditeur WYSIWYG + Markdown — auto-sauvegarde',
        'Paywall & abonnements via Stripe Connect',
        'Newsletter via Brevo (API française)',
        'Analytics éthiques, sans cookies (Umami)',
        "Hébergement zéro coût jusqu'à 1 000 abonnés",
      ],
      cta: 'Créer mon média',
      ctaHref: '/login',
    },
    {
      tab: 'Médias & CMS',
      eyebrow: 'Rédactions, titres indépendants',
      headline: 'Votre CMS. Votre audience. Votre ligne.',
      body: 'Synchronisation bidirectionnelle avec vos bases existantes. Importez vos archives, continuez à publier où vous êtes, diffusez ici en temps réel. Votre audience grandit — nos serveurs absorbent.',
      features: [
        'API REST + webhooks pour sync CMS existants',
        "Import d'archives (RSS, JSON, CSV)",
        'Multi-auteurs et rôles éditoriaux',
        'Mise en avant croisée inter-médias sur qoe.fi',
        'Certification officielle (badge vérifié)',
        'Dashboard éditorial centralisé',
      ],
      cta: "Rejoindre l'écosystème",
      ctaHref: '/login',
    },
    {
      tab: 'API',
      eyebrow: 'Développeurs, intégrateurs',
      headline: 'Headless. Ouvert. Souverain.',
      body: "Accédez à l'intégralité de notre infrastructure via une API REST sémantique. Construisez votre front, votre app mobile, votre propre CMS. Nos données, votre interface.",
      features: [
        'API REST documentée (OpenAPI 3.0)',
        'Authentification via Supabase JWT',
        'Webhooks temps réel (publication, abonnement)',
        'SDK TypeScript open-source',
        'Sandbox de test gratuit',
        'SLA 99.9% — hébergement Hetzner (Allemagne)',
      ],
      cta: 'Lire la documentation',
      ctaHref: '/docs',
    },
  ],
  creator_hub_tabs_en: [
    {
      tab: 'Creators',
      eyebrow: 'Journalists, essayists, collectives',
      headline: 'Your media in 3 minutes.',
      body: 'No code. No servers. No accountants. You have a voice — we give you the infrastructure. Custom subdomain, automatic SSL, rich editor, integrated newsletter, direct checkout.',
      features: [
        'Subdomain media.qoe.fi or your own custom domain',
        'WYSIWYG + Markdown editor — auto-save',
        'Paywall & subscriptions via Stripe Connect',
        'Newsletter via Brevo (European API)',
        'Ethical, cookie-less analytics (Umami)',
        'Zero-cost hosting up to 1,000 subscribers',
      ],
      cta: 'Create my media',
      ctaHref: '/login',
    },
    {
      tab: 'Media & CMS',
      eyebrow: 'Newsrooms, independent titles',
      headline: 'Your CMS. Your audience. Your rules.',
      body: 'Two-way sync with your existing systems. Import your archives, keep publishing where you are, broadcast here in real time. Your audience grows — our servers scale.',
      features: [
        'REST API + webhooks to sync existing CMSs',
        'Archive import (RSS, JSON, CSV)',
        'Multi-author and editorial roles',
        'Cross-promotion between creators on qoe.fi',
        'Official certification (verified badge)',
        'Centralized editorial dashboard',
      ],
      cta: 'Join the ecosystem',
      ctaHref: '/login',
    },
    {
      tab: 'API',
      eyebrow: 'Developers, integrators',
      headline: 'Headless. Open. Sovereign.',
      body: 'Access our entire infrastructure via a clean REST API. Build your own frontend, mobile app, or CMS. Our data, your interface.',
      features: [
        'Documented REST API (OpenAPI 3.0)',
        'Auth via Supabase JWT',
        'Real-time webhooks (publish, subscribe)',
        'Open-source TypeScript SDK',
        'Free testing sandbox',
        '99.9% SLA — German Hetzner green hosting',
      ],
      cta: 'Read the docs',
      ctaHref: '/docs',
    },
  ],
  footer_sections_fr: [
    {
      title: 'Légal',
      links: [
        { label: 'Conformité RGPD', href: '#', isExternal: false },
        { label: 'Politique de confidentialité', href: '#', isExternal: false },
        { label: "Conditions d'utilisation", href: '#', isExternal: false },
      ],
    },
    {
      title: 'Plateforme',
      links: [
        { label: 'Studio Créateur', href: '#', isExternal: false },
        { label: 'Espace Lecteur', href: '#', isExternal: false },
        { label: 'Docs API', href: '#', isExternal: false },
      ],
    },
    {
      title: 'Réseaux',
      links: [
        { label: 'Twitter', href: '#', isExternal: true },
        { label: 'Substack', href: '#', isExternal: true },
        { label: 'LinkedIn', href: '#', isExternal: true },
      ],
    },
  ],
  footer_sections_en: [
    {
      title: 'Legal',
      links: [
        { label: 'GDPR Compliance', href: '#', isExternal: false },
        { label: 'Privacy Policy', href: '#', isExternal: false },
        { label: 'Terms of Service', href: '#', isExternal: false },
      ],
    },
    {
      title: 'Platform',
      links: [
        { label: 'Creator Studio', href: '#', isExternal: false },
        { label: 'Reader Experience', href: '#', isExternal: false },
        { label: 'API Docs', href: '#', isExternal: false },
      ],
    },
    {
      title: 'Connect',
      links: [
        { label: 'Twitter', href: '#', isExternal: true },
        { label: 'Substack', href: '#', isExternal: true },
        { label: 'LinkedIn', href: '#', isExternal: true },
      ],
    },
  ],
};

// ─── READER SIMULATION BUILDER ────────────────────────────────────────────────
interface ReaderItem {
  type: string;
  text: string;
}

function ReaderSimulationBuilder({
  value,
  onChange,
  activeLang,
}: {
  value: string;
  onChange: (val: string) => void;
  activeLang: 'fr' | 'en';
}) {
  const [items, setItems] = useState<ReaderItem[]>([]);

  useEffect(() => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) {
        setItems(parsed);
      } else {
        setItems([]);
      }
    } catch {
      // If value is invalid JSON, use preset fallback
      const fallback =
        activeLang === 'en' ? PRESETS.hero_reader_items_en : PRESETS.hero_reader_items_fr;
      setItems(fallback);
    }
  }, [value, activeLang]);

  const updateItems = (newItems: ReaderItem[]) => {
    setItems(newItems);
    onChange(JSON.stringify(newItems, null, 2));
  };

  const addItem = () => {
    const newItem: ReaderItem = { type: 'body', text: 'Nouveau paragraphe' };
    updateItems([...items, newItem]);
  };

  const deleteItem = (idx: number) => {
    const filtered = items.filter((_, i) => i !== idx);
    updateItems(filtered);
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const reordered = [...items];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;
    updateItems(reordered);
  };

  const updateItemField = (idx: number, field: keyof ReaderItem, val: string) => {
    const updated = items.map((item, i) => (i === idx ? { ...item, [field]: val } : item));
    updateItems(updated);
  };

  const handleReset = () => {
    const preset =
      activeLang === 'en' ? PRESETS.hero_reader_items_en : PRESETS.hero_reader_items_fr;
    updateItems(preset);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t`Structure de la timeline de lecture`}
        </span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded-md bg-muted hover:bg-secondary transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> {t`Restaurer le modèle`}
        </button>
      </div>

      <div className="border border-border/60 rounded-xl divide-y divide-border overflow-hidden bg-muted/30">
        {items.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {t`Aucun élément de lecture configuré.`}
          </div>
        ) : (
          items.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start p-3 gap-3 hover:bg-white/60 transition-colors group"
            >
              {/* Type Select */}
              <select
                value={item.type}
                onChange={(e) => updateItemField(idx, 'type', e.target.value)}
                className="bg-white border border-border rounded-lg py-1 px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-[#EE4B2B]/40 focus:border-[#EE4B2B] shrink-0"
              >
                <option value="label">{t`Surtitre / Label`}</option>
                <option value="title">{t`Titre`}</option>
                <option value="section">{t`Section`}</option>
                <option value="body">{t`Paragraphe`}</option>
                <option value="quote">{t`Citation`}</option>
                <option value="divider">{t`Séparateur`}</option>
              </select>

              {/* Text Input (hidden if divider) */}
              {item.type !== 'divider' ? (
                <textarea
                  value={item.text || ''}
                  onChange={(e) => updateItemField(idx, 'text', e.target.value)}
                  placeholder={t`Saisissez le texte...`}
                  className="flex-1 min-w-0 bg-transparent border-none p-0 text-sm font-medium text-foreground focus:ring-0 focus:outline-none resize-none"
                  rows={item.text?.length > 100 ? 2 : 1}
                />
              ) : (
                <div className="flex-1 border-t border-dashed border-border mt-2.5" />
              )}

              {/* Action buttons (arrows, delete) */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveItem(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => deleteItem(idx)}
                  className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={addItem}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold py-2.5 rounded-xl bg-white hover:bg-muted transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" /> {t`Ajouter un bloc de lecture`}
      </button>
    </div>
  );
}

// ─── CREATOR HUB TABS BUILDER ─────────────────────────────────────────────────
interface CreatorHubTab {
  tab: string;
  eyebrow: string;
  headline: string;
  body: string;
  features: string[];
  cta: string;
  ctaHref: string;
}

function CreatorHubTabsBuilder({
  value,
  onChange,
  activeLang,
}: {
  value: string;
  onChange: (val: string) => void;
  activeLang: 'fr' | 'en';
}) {
  const [tabsData, setTabsData] = useState<CreatorHubTab[]>([]);
  const [activeTabIdx, setActiveTabIdx] = useState<number>(0);

  useEffect(() => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed) && parsed.length === 3) {
        setTabsData(parsed);
      } else {
        setTabsData([]);
      }
    } catch {
      const fallback =
        activeLang === 'en' ? PRESETS.creator_hub_tabs_en : PRESETS.creator_hub_tabs_fr;
      setTabsData(fallback);
    }
  }, [value, activeLang]);

  const updateTabs = (updated: CreatorHubTab[]) => {
    setTabsData(updated);
    onChange(JSON.stringify(updated, null, 2));
  };

  const updateTabField = (
    idx: number,
    field: keyof CreatorHubTab,
    val: CreatorHubTab[keyof CreatorHubTab]
  ) => {
    const updated = tabsData.map((tab, i) => (i === idx ? { ...tab, [field]: val } : tab));
    updateTabs(updated);
  };

  const updateFeature = (tabIdx: number, featIdx: number, val: string) => {
    const updatedFeatures = tabsData[tabIdx].features.map((f, i) => (i === featIdx ? val : f));
    updateTabField(tabIdx, 'features', updatedFeatures);
  };

  const addFeature = (tabIdx: number) => {
    const updatedFeatures = [...tabsData[tabIdx].features, 'Nouvelle fonctionnalité'];
    updateTabField(tabIdx, 'features', updatedFeatures);
  };

  const deleteFeature = (tabIdx: number, featIdx: number) => {
    const updatedFeatures = tabsData[tabIdx].features.filter((_, i) => i !== featIdx);
    updateTabField(tabIdx, 'features', updatedFeatures);
  };

  const handleReset = () => {
    const preset = activeLang === 'en' ? PRESETS.creator_hub_tabs_en : PRESETS.creator_hub_tabs_fr;
    updateTabs(preset);
  };

  if (tabsData.length < 3) return null;

  const currentTab = tabsData[activeTabIdx];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-border pb-3">
        {/* Tab Subselector */}
        <div className="flex items-center gap-1.5">
          {tabsData.map((t, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTabIdx(idx)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTabIdx === idx
                  ? 'bg-foreground text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {t.tab}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded-md bg-muted hover:bg-secondary transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> {t`Restaurer le modèle`}
        </button>
      </div>

      {/* Inputs for selected tab */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t`Nom de l'onglet`}
            </label>
            <input
              type="text"
              value={currentTab.tab || ''}
              onChange={(e) => updateTabField(activeTabIdx, 'tab', e.target.value)}
              className="w-full bg-white border border-border rounded-lg p-2.5 text-sm font-medium text-foreground focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t`Surtitre / Cible`}
            </label>
            <input
              type="text"
              value={currentTab.eyebrow || ''}
              onChange={(e) => updateTabField(activeTabIdx, 'eyebrow', e.target.value)}
              className="w-full bg-white border border-border rounded-lg p-2.5 text-sm font-medium text-foreground focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t`Accroche / Titre`}
          </label>
          <input
            type="text"
            value={currentTab.headline || ''}
            onChange={(e) => updateTabField(activeTabIdx, 'headline', e.target.value)}
            className="w-full bg-white border border-border rounded-lg p-2.5 text-sm font-medium text-foreground focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t`Description`}
          </label>
          <textarea
            value={currentTab.body || ''}
            onChange={(e) => updateTabField(activeTabIdx, 'body', e.target.value)}
            className="w-full bg-white border border-border rounded-lg p-2.5 text-sm font-medium text-foreground focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
            rows={3}
          />
        </div>

        {/* Feature Checklist List Editor */}
        <div className="space-y-2.5 pt-3 border-t border-border">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t`Liste des fonctionnalités (Puces)`}
          </label>
          <div className="space-y-2">
            {currentTab.features?.map((feat, featIdx) => (
              <div key={featIdx} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B] shrink-0" />
                <input
                  type="text"
                  value={feat}
                  onChange={(e) => updateFeature(activeTabIdx, featIdx, e.target.value)}
                  className="flex-1 bg-white border border-border rounded-lg py-1.5 px-2.5 text-xs font-medium text-foreground focus:ring-1 focus:ring-[#EE4B2B]/40 focus:border-[#EE4B2B] outline-none"
                />
                <button
                  type="button"
                  onClick={() => deleteFeature(activeTabIdx, featIdx)}
                  className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => addFeature(activeTabIdx)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> {t`Ajouter une fonctionnalité`}
          </button>
        </div>

        {/* Buttons / Actions */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t`Texte du CTA`}
            </label>
            <input
              type="text"
              value={currentTab.cta || ''}
              onChange={(e) => updateTabField(activeTabIdx, 'cta', e.target.value)}
              className="w-full bg-white border border-border rounded-lg p-2.5 text-xs font-semibold text-foreground focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t`Redirection du CTA (URL)`}
            </label>
            <input
              type="text"
              value={currentTab.ctaHref || ''}
              onChange={(e) => updateTabField(activeTabIdx, 'ctaHref', e.target.value)}
              className="w-full bg-white border border-border rounded-lg p-2.5 text-xs font-semibold text-foreground focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FOOTER COLUMNS BUILDER ───────────────────────────────────────────────────
interface FooterLinkItem {
  label: string;
  href: string;
  isExternal?: boolean;
}

interface FooterColumn {
  title: string;
  links: FooterLinkItem[];
}

function FooterColumnsBuilder({
  value,
  onChange,
  activeLang,
}: {
  value: string;
  onChange: (val: string) => void;
  activeLang: Language;
}) {
  const [columns, setColumns] = useState<FooterColumn[]>([]);

  useEffect(() => {
    try {
      const parsed = value ? JSON.parse(value) : [];
      if (Array.isArray(parsed)) {
        setColumns(parsed);
      } else {
        setColumns([]);
      }
    } catch {
      const fallback =
        activeLang === 'en' ? PRESETS.footer_sections_en : PRESETS.footer_sections_fr;
      setColumns(fallback);
    }
  }, [value, activeLang]);

  const updateColumns = (newCols: FooterColumn[]) => {
    setColumns(newCols);
    onChange(JSON.stringify(newCols, null, 2));
  };

  const addColumn = () => {
    const newCol: FooterColumn = { title: 'Nouveau Groupe', links: [] };
    updateColumns([...columns, newCol]);
  };

  const deleteColumn = (colIdx: number) => {
    updateColumns(columns.filter((_, i) => i !== colIdx));
  };

  const updateColumnTitle = (colIdx: number, val: string) => {
    const updated = columns.map((col, i) => (i === colIdx ? { ...col, title: val } : col));
    updateColumns(updated);
  };

  const addLinkToCol = (colIdx: number) => {
    const updatedLinks = [
      ...columns[colIdx].links,
      { label: 'Nouveau Lien', href: '#', isExternal: false },
    ];
    const updated = columns.map((col, i) => (i === colIdx ? { ...col, links: updatedLinks } : col));
    updateColumns(updated);
  };

  const deleteLinkFromCol = (colIdx: number, linkIdx: number) => {
    const updatedLinks = columns[colIdx].links.filter((_, i) => i !== linkIdx);
    const updated = columns.map((col, i) => (i === colIdx ? { ...col, links: updatedLinks } : col));
    updateColumns(updated);
  };

  const updateLinkField = (
    colIdx: number,
    linkIdx: number,
    field: keyof FooterLinkItem,
    val: FooterLinkItem[keyof FooterLinkItem]
  ) => {
    const updatedLinks = columns[colIdx].links.map((link, i) =>
      i === linkIdx ? { ...link, [field]: val } : link
    );
    const updated = columns.map((col, i) => (i === colIdx ? { ...col, links: updatedLinks } : col));
    updateColumns(updated);
  };

  const handleReset = () => {
    const preset = activeLang === 'en' ? PRESETS.footer_sections_en : PRESETS.footer_sections_fr;
    updateColumns(preset);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t`Groupes de liens (Colonnes)`}
        </span>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded-md bg-muted hover:bg-secondary transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> {t`Restaurer le modèle`}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {columns.map((col, colIdx) => (
          <div
            key={colIdx}
            className="border border-border rounded-xl bg-muted/20 p-5 space-y-4 relative group/column"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between border-b border-border pb-2">
              <input
                type="text"
                value={col.title}
                onChange={(e) => updateColumnTitle(colIdx, e.target.value)}
                placeholder={t`Titre du groupe`}
                className="bg-transparent border-none p-0 text-sm font-bold text-foreground focus:ring-0 outline-none w-3/4"
              />
              <button
                type="button"
                onClick={() => deleteColumn(colIdx)}
                className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover/column:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Links rows */}
            <div className="space-y-3.5">
              {col.links?.map((link, linkIdx) => (
                <div
                  key={linkIdx}
                  className="space-y-2 border-b border-border/50 pb-2.5 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={link.label}
                      onChange={(e) => updateLinkField(colIdx, linkIdx, 'label', e.target.value)}
                      placeholder={t`Libellé du lien`}
                      className="flex-1 bg-white border border-border rounded-lg py-1.5 px-2.5 text-xs font-semibold text-foreground focus:ring-1 focus:ring-[#EE4B2B]/40 focus:border-[#EE4B2B] outline-none"
                    />

                    {/* External link indicator toggle */}
                    <button
                      type="button"
                      title={link.isExternal ? t`Lien externe` : t`Lien interne`}
                      onClick={() =>
                        updateLinkField(colIdx, linkIdx, 'isExternal', !link.isExternal)
                      }
                      className={`p-1.5 rounded-lg border text-xs flex items-center justify-center shrink-0 ${
                        link.isExternal
                          ? 'bg-[#EE4B2B]/10 border-[#EE4B2B]/20 text-[#EE4B2B]'
                          : 'bg-white border-border text-muted-foreground hover:text-muted-foreground'
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteLinkFromCol(colIdx, linkIdx)}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 pl-2.5 text-muted-foreground">
                    <LinkIcon className="w-3.5 h-3.5 shrink-0" />
                    <input
                      type="text"
                      value={link.href}
                      onChange={(e) => updateLinkField(colIdx, linkIdx, 'href', e.target.value)}
                      placeholder={t`URL (ex: /login, https://...)`}
                      className="w-full bg-transparent border-none p-0 text-[11px] font-medium text-muted-foreground focus:ring-0 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addLinkToCol(colIdx)}
              className="w-full flex items-center justify-center gap-1 border border-dashed border-border hover:border-border text-[11px] font-semibold text-muted-foreground hover:text-muted-foreground py-1.5 rounded-lg bg-white/40 hover:bg-white transition-colors"
            >
              <Plus className="w-3 h-3" /> {t`Ajouter un lien`}
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addColumn}
        className="w-full flex items-center justify-center gap-1.5 border border-dashed border-border hover:border-border text-muted-foreground hover:text-foreground text-xs font-semibold py-2.5 rounded-xl bg-white hover:bg-muted transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" /> {t`Ajouter un groupe de liens`}
      </button>
    </div>
  );
}

// ─── ONBOARDING INTERESTS BUILDER ─────────────────────────────────────────────
function OnboardingInterestsBuilder({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const [interests, setInterests] = useState<string[]>([]);
  const [newInterest, setNewInterest] = useState('');

  useEffect(() => {
    const list = value
      ? value
          .split(',')
          .map((i) => i.trim())
          .filter(Boolean)
      : [];
    setInterests(list);
  }, [value]);

  const updateInterests = (newList: string[]) => {
    setInterests(newList);
    onChange(newList.join(', '));
  };

  const handleAdd = (e: React.FormEvent | React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    const clean = newInterest.trim();
    if (clean && !interests.includes(clean)) {
      updateInterests([...interests, clean]);
      setNewInterest('');
    }
  };

  const handleDelete = (index: number) => {
    updateInterests(interests.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t`Centres d'intérêt de l'onboarding (pgvector IA)`}
        </span>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newInterest}
          onChange={(e) => setNewInterest(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd(e);
            }
          }}
          placeholder={t`Ajouter un centre d'intérêt (ex: Technologie, Économie...)`}
          className="flex-1 bg-white border border-border rounded-lg p-2 text-sm focus:ring-1 focus:ring-[#EE4B2B] focus:border-[#EE4B2B] outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="bg-foreground text-background hover:bg-secondary px-4 py-2 rounded-lg text-sm font-semibold transition-colors shrink-0"
        >
          {t`Ajouter`}
        </button>
      </div>

      {interests.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed border-border rounded-xl bg-muted/50">
          {t`Aucun centre d'intérêt défini.`}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 p-4 border border-border/60 rounded-xl bg-muted/20">
          {interests.map((interest, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-full text-xs font-semibold text-foreground shadow-sm transition-all hover:border-[#EE4B2B]/40 group"
            >
              <span>{interest}</span>
              <button
                type="button"
                onClick={() => handleDelete(idx)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FrontendCMSProps {
  initialConfigs: Record<string, string>;
}

type TabKey = 'banner' | 'hero' | 'featured' | 'creator' | 'cta' | 'footer' | 'onboarding';

// ─── MAIN FRONTEND CMS ────────────────────────────────────────────────────────
export function FrontendCMS({ initialConfigs }: FrontendCMSProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<TabKey>('banner');
  // Language toggles for each tab's localized fields
  const [activeLang, setActiveLang] = useState<Language>(ALL_LANGUAGES[0] || 'fr');

  // State values
  const [formValues, setFormValues] = useState<Record<string, string>>(initialConfigs);
  // Loading & status
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const updateValue = (key: string, val: string) => {
    setFormValues((prev) => ({ ...prev, [key]: val }));
    setSaveStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      // Build batch payload
      const payload: Record<string, { value: string; description: string }> = {};

      const getKeysForTab = (tab: TabKey): string[] => {
        switch (tab) {
          case 'banner':
            return ['GLOBAL_BANNER_ENABLED', 'GLOBAL_BANNER_TEXT', 'GLOBAL_BANNER_LINK'];
          case 'hero':
            return [
              'hero_editor_title_fr',
              'hero_editor_title_en',
              'hero_editor_body_fr',
              'hero_editor_body_en',
              'hero_reader_items_fr',
              'hero_reader_items_en',
            ];
          case 'featured':
            return [
              'featured_title_fr',
              'featured_title_en',
              'featured_tagline_fr',
              'featured_tagline_en',
              'featured_background_words',
            ];
          case 'creator':
            return [
              'creator_hub_title_fr',
              'creator_hub_title_en',
              'creator_hub_tagline_fr',
              'creator_hub_tagline_en',
              'creator_hub_conviction_fr',
              'creator_hub_conviction_en',
              'creator_hub_conviction_sub_fr',
              'creator_hub_conviction_sub_en',
              'creator_hub_manifesto_fr',
              'creator_hub_manifesto_en',
              'creator_hub_tabs_fr',
              'creator_hub_tabs_en',
            ];
          case 'cta':
            return [
              'cta_eyebrow_fr',
              'cta_eyebrow_en',
              'cta_headline_fr',
              'cta_headline_en',
              'cta_subline_fr',
              'cta_subline_en',
              'cta_btn_primary_fr',
              'cta_btn_primary_en',
              'cta_btn_secondary_fr',
              'cta_btn_secondary_en',
              'cta_social_proof_fr',
              'cta_social_proof_en',
            ];
          case 'footer':
            return ['footer_copyright', 'footer_sections_fr', 'footer_sections_en'];
          case 'onboarding':
            return ['ONBOARDING_INTERESTS'];
        }
      };

      const keys = getKeysForTab(activeTab);
      keys.forEach((k) => {
        payload[k] = {
          value: formValues[k] || '',
          description: `CMS configuration for ${k}`,
        };
      });

      const res = await saveMultipleFrontendConfigs(payload);
      if (res.success) {
        setSaveStatus('success');
        setTimeout(() => setSaveStatus('idle'), 3000);
      }
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage((err as Error).message || t`Une erreur est survenue lors de la sauvegarde.`);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'banner', label: t`Bannière & Global` },
    { key: 'hero', label: t`Hero & Simulateur` },
    { key: 'featured', label: t`Publications phares` },
    { key: 'creator', label: t`Espace Créateurs` },
    { key: 'cta', label: t`Appel à l'action (CTA)` },
    { key: 'footer', label: t`Pied de page (Footer)` },
    { key: 'onboarding', label: t`Onboarding (Centres d'intérêt)` },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full max-w-6xl mx-auto">
      {/* Left Navigation: Vertical premium tab switcher */}
      <aside className="w-full lg:w-64 flex flex-row lg:flex-col gap-1.5 overflow-x-auto pb-4 lg:pb-0 shrink-0 border-b lg:border-b-0 lg:border-r border-border lg:pr-8">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSaveStatus('idle');
              }}
              className={`flex-shrink-0 text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
                isActive
                  ? 'text-foreground bg-secondary/80'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="active-frontend-tab"
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[#EE4B2B] rounded-full hidden lg:block"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </aside>

      {/* Right Content: Active Form workspace */}
      <div className="flex-1 w-full min-w-0 bg-white">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Header & Lang Toggle */}
          <div className="flex items-center justify-between border-b border-border pb-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-1.5">
                {tabs.find((t) => t.key === activeTab)?.label}
                <Sparkles className="w-4 h-4 text-[#EE4B2B] animate-pulse" />
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {t`Configurez le contenu en base de données de cette section.`}
              </p>
            </div>

            {/* Language toggle for translatable fields */}
            {activeTab !== 'banner' && activeTab !== 'onboarding' && (
              <div className="flex items-center gap-2.5 bg-muted border border-border/60 rounded-xl p-1 text-xs shrink-0 select-none">
                <span className="text-[10px] uppercase font-bold text-muted-foreground pl-1.5">
                  {t`Langue d'édition :`}
                </span>
                <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
                  {ALL_LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setActiveLang(lang)}
                      className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                        activeLang === lang
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {lang === 'fr'
                        ? 'Français'
                        : lang === 'en'
                          ? 'English'
                          : (lang as string).toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Form Content body based on active tab */}
          <div className="space-y-6 min-h-[350px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${activeLang}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* ─── TAB: BANNER ────────────────────────────────────────────── */}
                {activeTab === 'banner' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-muted border border-border p-4 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {t`Activer la bannière globale`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t`Elle s'affiche tout en haut de l'écran sur le site public.`}
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={formValues['GLOBAL_BANNER_ENABLED'] === 'true'}
                          onChange={(e) =>
                            updateValue(
                              'GLOBAL_BANNER_ENABLED',
                              e.target.checked ? 'true' : 'false'
                            )
                          }
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-input peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EE4B2B]"></div>
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Texte de l'annonce`}
                      </label>
                      <textarea
                        value={formValues['GLOBAL_BANNER_TEXT'] || ''}
                        onChange={(e) => updateValue('GLOBAL_BANNER_TEXT', e.target.value)}
                        placeholder={t`qoe.fi est en ligne ! Rejoignez-nous.`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 resize-none transition-colors outline-none"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Lien optionnel`}
                      </label>
                      <input
                        type="text"
                        value={formValues['GLOBAL_BANNER_LINK'] || ''}
                        onChange={(e) => updateValue('GLOBAL_BANNER_LINK', e.target.value)}
                        placeholder="https://qoe.fi/changelog"
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: HERO ────────────────────────────────────────────── */}
                {activeTab === 'hero' && (
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Titre de l'éditeur simulé (${activeLang.toUpperCase()})`}
                      </label>
                      <input
                        type="text"
                        value={formValues[`hero_editor_title_${activeLang}`] || ''}
                        onChange={(e) =>
                          updateValue(`hero_editor_title_${activeLang}`, e.target.value)
                        }
                        placeholder={t`L'architecture du silence`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Contenu rédigé de l'éditeur (${activeLang.toUpperCase()})`}
                      </label>
                      <textarea
                        value={formValues[`hero_editor_body_${activeLang}`] || ''}
                        onChange={(e) =>
                          updateValue(`hero_editor_body_${activeLang}`, e.target.value)
                        }
                        placeholder={t`Écrire, c'est d'abord creuser...`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        rows={5}
                      />
                    </div>

                    {/* Premium Reader visual simulation list builder */}
                    <div className="pt-6 border-t border-border">
                      <ReaderSimulationBuilder
                        value={formValues[`hero_reader_items_${activeLang}`] || ''}
                        onChange={(val) => updateValue(`hero_reader_items_${activeLang}`, val)}
                        activeLang={activeLang}
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: FEATURED ────────────────────────────────────────── */}
                {activeTab === 'featured' && (
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Titre principal (${activeLang.toUpperCase()})`}
                      </label>
                      <input
                        type="text"
                        value={formValues[`featured_title_${activeLang}`] || ''}
                        onChange={(e) =>
                          updateValue(`featured_title_${activeLang}`, e.target.value)
                        }
                        placeholder={t`Publications récentes`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Surtitre / Tagline (${activeLang.toUpperCase()})`}
                      </label>
                      <input
                        type="text"
                        value={formValues[`featured_tagline_${activeLang}`] || ''}
                        onChange={(e) =>
                          updateValue(`featured_tagline_${activeLang}`, e.target.value)
                        }
                        placeholder={t`Écrits sélectionnés`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-base font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                      />
                    </div>

                    <div className="space-y-1.5 pt-4 border-t border-border">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Mots philosophiques d'arrière-plan (Séparés par des virgules)`}
                      </label>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        {t`Ces concepts défilent horizontalement en arrière-plan de la section.`}
                      </p>
                      <textarea
                        value={formValues['featured_background_words'] || ''}
                        onChange={(e) => updateValue('featured_background_words', e.target.value)}
                        placeholder={t`Phénoménologie, Dialectique, Épistémologie, Herméneutique, Ontologie...`}
                        className="w-full bg-white border border-border rounded-xl p-3 text-sm text-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        rows={5}
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: CREATOR HUB ─────────────────────────────────────── */}
                {activeTab === 'creator' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Titre principal ({activeLang.toUpperCase()})
                        </label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_title_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`creator_hub_title_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Une infrastructure pour ceux qui pensent.`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Tagline / Surtitre (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_tagline_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`creator_hub_tagline_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Rejoignez l'écosystème`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Titre de conviction bas de page (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_conviction_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`creator_hub_conviction_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Zéro VC. Zéro GAFAM. Zéro compromis.`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Label du bouton manifeste (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_manifesto_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`creator_hub_manifesto_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Lire le manifeste`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Texte de conviction (${activeLang.toUpperCase()})`}
                      </label>
                      <textarea
                        value={formValues[`creator_hub_conviction_sub_${activeLang}`] || ''}
                        onChange={(e) =>
                          updateValue(`creator_hub_conviction_sub_${activeLang}`, e.target.value)
                        }
                        placeholder={t`Bootstrapé par conviction. Hébergé en Allemagne...`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        rows={2}
                      />
                    </div>

                    {/* Premium visual tabs editor */}
                    <div className="pt-6 border-t border-border">
                      <CreatorHubTabsBuilder
                        value={formValues[`creator_hub_tabs_${activeLang}`] || ''}
                        onChange={(val) => updateValue(`creator_hub_tabs_${activeLang}`, val)}
                        activeLang={activeLang}
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: CTA ─────────────────────────────────────────────── */}
                {activeTab === 'cta' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Surtitre Eyebrow (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`cta_eyebrow_${activeLang}`] || ''}
                          onChange={(e) => updateValue(`cta_eyebrow_${activeLang}`, e.target.value)}
                          placeholder={t`Pour ceux qui veulent se cultiver`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Titre H2 (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`cta_headline_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`cta_headline_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Du temps bien dépensé.`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Description / Paragraphe (${activeLang.toUpperCase()})`}
                      </label>
                      <textarea
                        value={formValues[`cta_subline_${activeLang}`] || ''}
                        onChange={(e) => updateValue(`cta_subline_${activeLang}`, e.target.value)}
                        placeholder={t`Pas de scroll toxique. Pas d'algorithme marchand...`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Bouton Principal (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`cta_btn_primary_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`cta_btn_primary_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Commencer à lire`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t`Bouton Secondaire (${activeLang.toUpperCase()})`}
                        </label>
                        <input
                          type="text"
                          value={formValues[`cta_btn_secondary_${activeLang}`] || ''}
                          onChange={(e) =>
                            updateValue(`cta_btn_secondary_${activeLang}`, e.target.value)
                          }
                          placeholder={t`Se cultiver, gratuitement`}
                          className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Mentions de rassurance en bas de page (${activeLang.toUpperCase()})`}
                      </label>
                      <input
                        type="text"
                        value={formValues[`cta_social_proof_${activeLang}`] || ''}
                        onChange={(e) =>
                          updateValue(`cta_social_proof_${activeLang}`, e.target.value)
                        }
                        placeholder={t`Gratuit · Aucune carte bancaire requise · Données hébergées en Europe`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: FOOTER ──────────────────────────────────────────── */}
                {activeTab === 'footer' && (
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t`Texte de Copyright global`}
                      </label>
                      <textarea
                        value={formValues['footer_copyright'] || ''}
                        onChange={(e) => updateValue('footer_copyright', e.target.value)}
                        placeholder={t`© 2024 QOE.FI. Crafted for the curious minds in the European creator economy.`}
                        className="w-full bg-transparent border-b border-border px-0 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-foreground focus:ring-0 transition-colors outline-none"
                        rows={2}
                      />
                    </div>

                    {/* Premium visual columns/links builder */}
                    <div className="pt-6 border-t border-border">
                      <FooterColumnsBuilder
                        value={formValues[`footer_sections_${activeLang}`] || ''}
                        onChange={(val) => updateValue(`footer_sections_${activeLang}`, val)}
                        activeLang={activeLang}
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: ONBOARDING ────────────────────────────────────────── */}
                {activeTab === 'onboarding' && (
                  <div className="space-y-6">
                    <OnboardingInterestsBuilder
                      value={formValues['ONBOARDING_INTERESTS'] || ''}
                      onChange={(val) => updateValue('ONBOARDING_INTERESTS', val)}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Action buttons footer */}
          <div className="pt-6 border-t border-border flex items-center justify-between gap-4">
            <div className="flex-1">
              <AnimatePresence>
                {saveStatus === 'success' && (
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-semibold text-success flex items-center gap-1.5"
                  >
                    ✓ {t`Changements enregistrés et cache régénéré instantanément !`}
                  </motion.p>
                )}
                {saveStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-medium text-destructive flex items-start gap-1.5"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className={`inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-background transition-all shadow-md ${
                isSaving
                  ? 'bg-border cursor-not-allowed shadow-none'
                  : 'bg-foreground hover:bg-secondary hover:shadow-lg'
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> {t`Enregistrement...`}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> {t`Enregistrer la section`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
