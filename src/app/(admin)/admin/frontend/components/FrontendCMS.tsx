"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Save, AlertCircle, RefreshCw, Eye, EyeOff, LayoutGrid } from "lucide-react";
import { saveMultipleFrontendConfigs } from "../actions";

// Default Presets
const PRESETS = {
  hero_reader_items_fr: [
    { type: "label", text: "Clara Lambert · Essai · 8 min" },
    { type: "title", text: "Le silence comme infrastructure" },
    { type: "body", text: "Il y a des architectures invisibles. Non pas des bâtiments, mais des espaces mentaux — des structures que l'on construit délibérément pour penser mieux." },
    { type: "body", text: "Le silence est l'une d'entre elles. Non pas l'absence de son, mais l'absence de sollicitations qui se déguisent en urgences." },
    { type: "quote", text: "« On ne pense vraiment que dans les intervalles. »" },
    { type: "divider" },
    { type: "label", text: "Julien Roche · Technologie · 5 min" },
    { type: "title", text: "Sortir du cloud des géants" },
    { type: "body", text: "L'hébergement de nos médias indépendants ne peut plus reposer sur les serveurs des GAFAM. Ce n'est pas une question technique. C'est une question de souveraineté." }
  ],
  hero_reader_items_en: [
    { type: "label", text: "Clara Lambert · Essay · 8 min" },
    { type: "title", text: "Silence as an infrastructure" },
    { type: "body", text: "There are invisible architectures. Not buildings, but mental spaces — structures we build deliberately to think better." },
    { type: "body", text: "Silence is one of them. Not the absence of sound, but the absence of prompts disguised as emergencies." },
    { type: "quote", text: "“We only truly think in the intervals.”" },
    { type: "divider" },
    { type: "label", text: "Julien Roche · Technology · 5 min" },
    { type: "title", text: "Stepping out of the giants' cloud" },
    { type: "body", text: "Hosting our independent media can no longer rely on GAFAM servers. It is not a technical question. It is a matter of sovereignty." }
  ],
  creator_hub_tabs_fr: [
    {
      tab: "Créateurs",
      eyebrow: "Journalistes, essayistes, collectifs",
      headline: "Votre média en 3 minutes.",
      body: "Pas de code. Pas de serveur. Pas de comptable. Vous avez une voix — nous vous donnons l'infrastructure. Sous-domaine personnalisé, SSL automatique, éditeur riche, newsletter intégrée, paiement direct.",
      features: [
        "Sous-domaine media.qoe.fi ou votre propre domaine",
        "Éditeur WYSIWYG + Markdown — auto-sauvegarde",
        "Paywall & abonnements via Stripe Connect",
        "Newsletter via Brevo (API française)",
        "Analytics éthiques, sans cookies (Umami)",
        "Hébergement zéro coût jusqu'à 1 000 abonnés"
      ],
      cta: "Créer mon média",
      ctaHref: "/login"
    },
    {
      tab: "Médias & CMS",
      eyebrow: "Rédactions, titres indépendants",
      headline: "Votre CMS. Votre audience. Votre ligne.",
      body: "Synchronisation bidirectionnelle avec vos bases existantes. Importez vos archives, continuez à publier où vous êtes, diffusez ici en temps réel. Votre audience grandit — nos serveurs absorbent.",
      features: [
        "API REST + webhooks pour sync CMS existants",
        "Import d'archives (RSS, JSON, CSV)",
        "Multi-auteurs et rôles éditoriaux",
        "Mise en avant croisée inter-médias sur qoe.fi",
        "Certification officielle (badge vérifié)",
        "Dashboard éditorial centralisé"
      ],
      cta: "Rejoindre l'écosystème",
      ctaHref: "/login"
    },
    {
      tab: "API",
      eyebrow: "Développeurs, intégrateurs",
      headline: "Headless. Ouvert. Souverain.",
      body: "Accédez à l'intégralité de notre infrastructure via une API REST sémantique. Construisez votre front, votre app mobile, votre propre CMS. Nos données, votre interface.",
      features: [
        "API REST documentée (OpenAPI 3.0)",
        "Authentification via Supabase JWT",
        "Webhooks temps réel (publication, abonnement)",
        "SDK TypeScript open-source",
        "Sandbox de test gratuit",
        "SLA 99.9% — hébergement Hetzner (Allemagne)"
      ],
      cta: "Lire la documentation",
      ctaHref: "/docs"
    }
  ],
  creator_hub_tabs_en: [
    {
      tab: "Creators",
      eyebrow: "Journalists, essayists, collectives",
      headline: "Your media in 3 minutes.",
      body: "No code. No servers. No accountants. You have a voice — we give you the infrastructure. Custom subdomain, automatic SSL, rich editor, integrated newsletter, direct checkout.",
      features: [
        "Subdomain media.qoe.fi or your own custom domain",
        "WYSIWYG + Markdown editor — auto-save",
        "Paywall & subscriptions via Stripe Connect",
        "Newsletter via Brevo (European API)",
        "Ethical, cookie-less analytics (Umami)",
        "Zero-cost hosting up to 1,000 subscribers"
      ],
      cta: "Create my media",
      ctaHref: "/login"
    },
    {
      tab: "Media & CMS",
      eyebrow: "Newsrooms, independent titles",
      headline: "Your CMS. Your audience. Your rules.",
      body: "Two-way sync with your existing systems. Import your archives, keep publishing where you are, broadcast here in real time. Your audience grows — our servers scale.",
      features: [
        "REST API + webhooks to sync existing CMSs",
        "Archive import (RSS, JSON, CSV)",
        "Multi-author and editorial roles",
        "Cross-promotion between creators on qoe.fi",
        "Official certification (verified badge)",
        "Centralized editorial dashboard"
      ],
      cta: "Join the ecosystem",
      ctaHref: "/login"
    },
    {
      tab: "API",
      eyebrow: "Developers, integrators",
      headline: "Headless. Open. Sovereign.",
      body: "Access our entire infrastructure via a clean semantic REST API. Build your own frontend, mobile app, or CMS. Our data, your interface.",
      features: [
        "Documented REST API (OpenAPI 3.0)",
        "Auth via Supabase JWT",
        "Real-time webhooks (publish, subscribe)",
        "Open-source TypeScript SDK",
        "Free testing sandbox",
        "99.9% SLA — German Hetzner green hosting"
      ],
      cta: "Read the docs",
      ctaHref: "/docs"
    }
  ],
  footer_sections_fr: [
    {
      title: "Légal",
      links: [
        { label: "Conformité RGPD", href: "#" },
        { label: "Politique de confidentialité", href: "#" },
        { label: "Conditions d'utilisation", href: "#" }
      ]
    },
    {
      title: "Plateforme",
      links: [
        { label: "Studio Créateur", href: "#" },
        { label: "Espace Lecteur", href: "#" },
        { label: "Docs API", href: "#" }
      ]
    },
    {
      title: "Réseaux",
      links: [
        { label: "Twitter", href: "#" },
        { label: "Substack", href: "#" },
        { label: "LinkedIn", href: "#" }
      ]
    }
  ],
  footer_sections_en: [
    {
      title: "Legal",
      links: [
        { label: "GDPR Compliance", href: "#" },
        { label: "Privacy Policy", href: "#" },
        { label: "Terms of Service", href: "#" }
      ]
    },
    {
      title: "Platform",
      links: [
        { label: "Creator Studio", href: "#" },
        { label: "Reader Experience", href: "#" },
        { label: "API Docs", href: "#" }
      ]
    },
    {
      title: "Connect",
      links: [
        { label: "Twitter", href: "#" },
        { label: "Substack", href: "#" },
        { label: "LinkedIn", href: "#" }
      ]
    }
  ]
};

interface FrontendCMSProps {
  initialConfigs: Record<string, string>;
}

type TabKey = "banner" | "hero" | "featured" | "creator" | "cta" | "footer";

export function FrontendCMS({ initialConfigs }: FrontendCMSProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<TabKey>("banner");
  // Language toggles for each tab's localized fields
  const [activeLang, setActiveLang] = useState<"fr" | "en">("fr");

  // State values
  const [formValues, setFormValues] = useState<Record<string, string>>(initialConfigs);
  // Track JSON validation errors
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  // Loading & status
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const updateValue = (key: string, val: string) => {
    setFormValues((prev) => ({ ...prev, [key]: val }));
    setSaveStatus("idle");

    // Live validation for JSON keys
    if (key.includes("hero_reader_items") || key.includes("creator_hub_tabs") || key.includes("footer_sections")) {
      if (!val.trim()) {
        setJsonErrors((errs) => {
          const c = { ...errs };
          delete c[key];
          return c;
        });
        return;
      }
      try {
        JSON.parse(val);
        setJsonErrors((errs) => {
          const c = { ...errs };
          delete c[key];
          return c;
        });
      } catch (e) {
        setJsonErrors((errs) => ({ ...errs, [key]: (e as Error).message }));
      }
    }
  };

  const loadPreset = (key: keyof typeof PRESETS) => {
    const val = JSON.stringify(PRESETS[key], null, 2);
    updateValue(key, val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(jsonErrors).length > 0) {
      setSaveStatus("error");
      setErrorMessage("Veuillez corriger les erreurs de syntaxe JSON avant d'enregistrer.");
      return;
    }

    setIsSaving(true);
    setSaveStatus("idle");
    setErrorMessage("");

    try {
      // Build batch payload
      const payload: Record<string, { value: string; description: string }> = {};

      // Filter based on active tab to only save configurations related to the current tab
      const getKeysForTab = (tab: TabKey): string[] => {
        switch (tab) {
          case "banner":
            return ["GLOBAL_BANNER_ENABLED", "GLOBAL_BANNER_TEXT", "GLOBAL_BANNER_LINK"];
          case "hero":
            return [
              "hero_editor_title_fr", "hero_editor_title_en",
              "hero_editor_body_fr", "hero_editor_body_en",
              "hero_reader_items_fr", "hero_reader_items_en"
            ];
          case "featured":
            return [
              "featured_title_fr", "featured_title_en",
              "featured_tagline_fr", "featured_tagline_en",
              "featured_background_words"
            ];
          case "creator":
            return [
              "creator_hub_title_fr", "creator_hub_title_en",
              "creator_hub_tagline_fr", "creator_hub_tagline_en",
              "creator_hub_conviction_fr", "creator_hub_conviction_en",
              "creator_hub_conviction_sub_fr", "creator_hub_conviction_sub_en",
              "creator_hub_manifesto_fr", "creator_hub_manifesto_en",
              "creator_hub_tabs_fr", "creator_hub_tabs_en"
            ];
          case "cta":
            return [
              "cta_eyebrow_fr", "cta_eyebrow_en",
              "cta_headline_fr", "cta_headline_en",
              "cta_subline_fr", "cta_subline_en",
              "cta_btn_primary_fr", "cta_btn_primary_en",
              "cta_btn_secondary_fr", "cta_btn_secondary_en",
              "cta_social_proof_fr", "cta_social_proof_en"
            ];
          case "footer":
            return [
              "footer_copyright",
              "footer_sections_fr", "footer_sections_en"
            ];
        }
      };

      const keys = getKeysForTab(activeTab);
      keys.forEach((k) => {
        payload[k] = {
          value: formValues[k] || "",
          description: `CMS configuration for ${k}`
        };
      });

      const res = await saveMultipleFrontendConfigs(payload);
      if (res.success) {
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (err) {
      setSaveStatus("error");
      setErrorMessage((err as Error).message || "Une erreur est survenue lors de la sauvegarde.");
    } finally {
      setIsSaving(false);
    }
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "banner", label: "Bannière & Global" },
    { key: "hero", label: "Hero & Simulateur" },
    { key: "featured", label: "Publications phares" },
    { key: "creator", label: "Espace Créateurs" },
    { key: "cta", label: "Appel à l'action (CTA)" },
    { key: "footer", label: "Pied de page (Footer)" },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full max-w-6xl mx-auto">
      {/* Left Navigation: Vertical premium tab switcher */}
      <aside className="w-full lg:w-64 flex flex-row lg:flex-col gap-1.5 overflow-x-auto pb-4 lg:pb-0 shrink-0 border-b lg:border-b-0 lg:border-r border-neutral-100 lg:pr-8">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key);
                setSaveStatus("idle");
              }}
              className={`flex-shrink-0 text-left px-4 py-2.5 rounded-lg text-sm font-medium transition-all relative ${
                isActive
                  ? "text-neutral-900 bg-neutral-100/80"
                  : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50/50"
              }`}
            >
              {tab.label}
              {isActive && (
                <motion.div
                  layoutId="active-frontend-tab"
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[#EE4B2B] rounded-full hidden lg:block"
                  transition={{ type: "spring", stiffness: 350, damping: 30 }}
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
          <div className="flex items-center justify-between border-b border-neutral-100 pb-5">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-neutral-900">
                {tabs.find((t) => t.key === activeTab)?.label}
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                Configurez le contenu en base de données de cette section.
              </p>
            </div>

            {/* Language toggle for translatable fields */}
            {activeTab !== "banner" && (
              <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-1 text-xs shrink-0 select-none">
                <button
                  type="button"
                  onClick={() => setActiveLang("fr")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeLang === "fr" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  Français
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLang("en")}
                  className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                    activeLang === "en" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  English
                </button>
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
                {activeTab === "banner" && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between bg-neutral-50 border border-neutral-100 p-4 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">Activer la bannière globale</p>
                        <p className="text-xs text-neutral-400 mt-0.5">Elle s'affiche tout en haut de l'écran sur le site public.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={formValues["GLOBAL_BANNER_ENABLED"] === "true"}
                          onChange={(e) => updateValue("GLOBAL_BANNER_ENABLED", e.target.checked ? "true" : "false")}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#EE4B2B]"></div>
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Texte de l'annonce</label>
                      <textarea
                        value={formValues["GLOBAL_BANNER_TEXT"] || ""}
                        onChange={(e) => updateValue("GLOBAL_BANNER_TEXT", e.target.value)}
                        placeholder="qoe.fi est en ligne ! Rejoignez-nous."
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 resize-none transition-colors"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Lien optionnel</label>
                      <input
                        type="text"
                        value={formValues["GLOBAL_BANNER_LINK"] || ""}
                        onChange={(e) => updateValue("GLOBAL_BANNER_LINK", e.target.value)}
                        placeholder="https://qoe.fi/changelog"
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: HERO ────────────────────────────────────────────── */}
                {activeTab === "hero" && (
                  <div className="space-y-6">
                    {/* Localized inputs */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Titre de l'éditeur simulé ({activeLang.toUpperCase()})</label>
                      <input
                        type="text"
                        value={formValues[`hero_editor_title_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`hero_editor_title_${activeLang}`, e.target.value)}
                        placeholder="L'architecture du silence"
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Contenu rédigé de l'éditeur ({activeLang.toUpperCase()})</label>
                      <textarea
                        value={formValues[`hero_editor_body_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`hero_editor_body_${activeLang}`, e.target.value)}
                        placeholder="Écrire, c'est d'abord creuser..."
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        rows={6}
                      />
                    </div>

                    <div className="space-y-3 pt-4 border-t border-neutral-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Articles simulés du Lecteur (JSON) ({activeLang.toUpperCase()})</label>
                          <p className="text-[11px] text-neutral-400 mt-0.5">Structure d'éléments (label, title, body, quote, divider) défilant en boucle.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => loadPreset(`hero_reader_items_${activeLang}` as any)}
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Charger le modèle
                        </button>
                      </div>

                      <div className="relative">
                        <textarea
                          value={formValues[`hero_reader_items_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`hero_reader_items_${activeLang}`, e.target.value)}
                          placeholder="[ ... ]"
                          className="w-full bg-neutral-950 font-mono text-xs text-neutral-300 p-4 rounded-xl border border-neutral-800 focus:border-neutral-700 focus:ring-0 leading-relaxed"
                          rows={12}
                        />
                        {jsonErrors[`hero_reader_items_${activeLang}`] && (
                          <div className="flex items-start gap-1.5 text-red-500 text-xs mt-1.5 font-medium">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Syntaxe JSON invalide : {jsonErrors[`hero_reader_items_${activeLang}`]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── TAB: FEATURED ────────────────────────────────────────── */}
                {activeTab === "featured" && (
                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Titre principal ({activeLang.toUpperCase()})</label>
                      <input
                        type="text"
                        value={formValues[`featured_title_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`featured_title_${activeLang}`, e.target.value)}
                        placeholder="Publications récentes"
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Surtitre / Tagline ({activeLang.toUpperCase()})</label>
                      <input
                        type="text"
                        value={formValues[`featured_tagline_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`featured_tagline_${activeLang}`, e.target.value)}
                        placeholder="Écrits sélectionnés"
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-base font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                      />
                    </div>

                    {/* Shared field for all languages: Background floating words */}
                    <div className="space-y-1.5 pt-4 border-t border-neutral-100">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Mots philosophiques d'arrière-plan (Séparés par des virgules)</label>
                      <p className="text-[11px] text-neutral-400 mb-2">Ces concepts défilent horizontalement en arrière-plan de la section.</p>
                      <textarea
                        value={formValues["featured_background_words"] || ""}
                        onChange={(e) => updateValue("featured_background_words", e.target.value)}
                        placeholder="Phénoménologie, Dialectique, Épistémologie, Herméneutique, Ontologie..."
                        className="w-full bg-transparent border border-neutral-200 rounded-xl p-3 text-sm text-neutral-800 focus:border-neutral-900 focus:ring-0 transition-colors"
                        rows={5}
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: CREATOR HUB ─────────────────────────────────────── */}
                {activeTab === "creator" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Titre principal ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_title_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`creator_hub_title_${activeLang}`, e.target.value)}
                          placeholder="Une infrastructure pour ceux qui pensent."
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Tagline / Surtitre ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_tagline_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`creator_hub_tagline_${activeLang}`, e.target.value)}
                          placeholder="Rejoignez l'écosystème"
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-neutral-100">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Titre de conviction bas de page ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_conviction_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`creator_hub_conviction_${activeLang}`, e.target.value)}
                          placeholder="Zéro VC. Zéro GAFAM. Zéro compromis."
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Label du bouton manifeste ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`creator_hub_manifesto_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`creator_hub_manifesto_${activeLang}`, e.target.value)}
                          placeholder="Lire le manifeste"
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Texte de conviction ({activeLang.toUpperCase()})</label>
                      <textarea
                        value={formValues[`creator_hub_conviction_sub_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`creator_hub_conviction_sub_${activeLang}`, e.target.value)}
                        placeholder="Bootstrapé par conviction. Hébergé en Allemagne..."
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-3 pt-4 border-t border-neutral-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Onglets & Fonctionnalités (JSON) ({activeLang.toUpperCase()})</label>
                          <p className="text-[11px] text-neutral-400 mt-0.5">Configuration des trois colonnes d'onboarding (Créateurs, Médias, API) avec features.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => loadPreset(`creator_hub_tabs_${activeLang}` as any)}
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Charger le modèle
                        </button>
                      </div>

                      <div className="relative">
                        <textarea
                          value={formValues[`creator_hub_tabs_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`creator_hub_tabs_${activeLang}`, e.target.value)}
                          placeholder="[ ... ]"
                          className="w-full bg-neutral-950 font-mono text-xs text-neutral-300 p-4 rounded-xl border border-neutral-800 focus:border-neutral-700 focus:ring-0 leading-relaxed"
                          rows={12}
                        />
                        {jsonErrors[`creator_hub_tabs_${activeLang}`] && (
                          <div className="flex items-start gap-1.5 text-red-500 text-xs mt-1.5 font-medium">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Syntaxe JSON invalide : {jsonErrors[`creator_hub_tabs_${activeLang}`]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── TAB: CTA ─────────────────────────────────────────────── */}
                {activeTab === "cta" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Surtitre Eyebrow ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`cta_eyebrow_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`cta_eyebrow_${activeLang}`, e.target.value)}
                          placeholder="Pour ceux qui veulent se cultiver"
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Titre H2 ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`cta_headline_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`cta_headline_${activeLang}`, e.target.value)}
                          placeholder="Du temps bien dépensé."
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Description / Paragraphe ({activeLang.toUpperCase()})</label>
                      <textarea
                        value={formValues[`cta_subline_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`cta_subline_${activeLang}`, e.target.value)}
                        placeholder="Pas de scroll toxique. Pas d'algorithme marchand..."
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-neutral-100">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bouton Principal ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`cta_btn_primary_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`cta_btn_primary_${activeLang}`, e.target.value)}
                          placeholder="Commencer à lire"
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Bouton Secondaire ({activeLang.toUpperCase()})</label>
                        <input
                          type="text"
                          value={formValues[`cta_btn_secondary_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`cta_btn_secondary_${activeLang}`, e.target.value)}
                          placeholder="Se cultiver, gratuitement"
                          className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Mentions de rassurance en bas de page ({activeLang.toUpperCase()})</label>
                      <input
                        type="text"
                        value={formValues[`cta_social_proof_${activeLang}`] || ""}
                        onChange={(e) => updateValue(`cta_social_proof_${activeLang}`, e.target.value)}
                        placeholder="Gratuit · Aucune carte bancaire requise · Données hébergées en Europe"
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* ─── TAB: FOOTER ──────────────────────────────────────────── */}
                {activeTab === "footer" && (
                  <div className="space-y-6">
                    {/* Copyright is shared/global or can support translation. We keep a single input for copyright but customizable */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Texte de Copyright global</label>
                      <textarea
                        value={formValues["footer_copyright"] || ""}
                        onChange={(e) => updateValue("footer_copyright", e.target.value)}
                        placeholder="© 2024 QOE.FI. Crafted for the curious minds in the European creator economy."
                        className="w-full bg-transparent border-b border-neutral-200 px-0 py-2 text-sm font-medium text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-900 focus:ring-0 transition-colors"
                        rows={2}
                      />
                    </div>

                    <div className="space-y-3 pt-4 border-t border-neutral-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Colonnes et liens du Footer (JSON) ({activeLang.toUpperCase()})</label>
                          <p className="text-[11px] text-neutral-400 mt-0.5">Définissez les groupes (titres de colonnes) et leurs liens.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => loadPreset(`footer_sections_${activeLang}` as any)}
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 transition-colors"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Charger le modèle
                        </button>
                      </div>

                      <div className="relative">
                        <textarea
                          value={formValues[`footer_sections_${activeLang}`] || ""}
                          onChange={(e) => updateValue(`footer_sections_${activeLang}`, e.target.value)}
                          placeholder="[ ... ]"
                          className="w-full bg-neutral-950 font-mono text-xs text-neutral-300 p-4 rounded-xl border border-neutral-800 focus:border-neutral-700 focus:ring-0 leading-relaxed"
                          rows={12}
                        />
                        {jsonErrors[`footer_sections_${activeLang}`] && (
                          <div className="flex items-start gap-1.5 text-red-500 text-xs mt-1.5 font-medium">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>Syntaxe JSON invalide : {jsonErrors[`footer_sections_${activeLang}`]}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Action buttons footer */}
          <div className="pt-6 border-t border-neutral-100 flex items-center justify-between gap-4">
            {/* Status alerts */}
            <div className="flex-1">
              <AnimatePresence>
                {saveStatus === "success" && (
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5"
                  >
                    ✓ Changements enregistrés et cache régénéré instantanément !
                  </motion.p>
                )}
                {saveStatus === "error" && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs font-medium text-red-500 flex items-start gap-1.5"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              type="submit"
              disabled={isSaving || Object.keys(jsonErrors).length > 0}
              className={`inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all shadow-md ${
                isSaving || Object.keys(jsonErrors).length > 0
                  ? "bg-neutral-300 cursor-not-allowed shadow-none"
                  : "bg-neutral-900 hover:bg-neutral-800 hover:shadow-lg"
              }`}
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Enregistrement...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> Enregistrer la section
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
