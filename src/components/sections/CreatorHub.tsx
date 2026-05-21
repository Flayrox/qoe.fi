"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";

interface CreatorHubProps {
  config: Record<string, string>;
}

const TABS = ["Créateurs", "Médias & CMS", "API"] as const;
type Tab = (typeof TABS)[number];

const TAB_CONTENT: Record<Tab, { eyebrow: string; headline: string; body: string; features: string[]; cta: string; ctaHref: string }> = {
  "Créateurs": {
    eyebrow: "Journalistes, essayistes, collectifs",
    headline: "Votre média en 3 minutes.",
    body: "Pas de code. Pas de serveur. Pas de comptable. Vous avez une voix — nous vous donnons l'infrastructure. Sous-domaine personnalisé, SSL automatique, éditeur riche, newsletter intégrée, paiement direct.",
    features: [
      "Sous-domaine media.qoe.fi ou votre propre domaine",
      "Éditeur WYSIWYG + Markdown — auto-sauvegarde",
      "Paywall & abonnements via Stripe Connect",
      "Newsletter via Brevo (API française)",
      "Analytics éthiques, sans cookies (Umami)",
      "Hébergement zéro coût jusqu'à 1 000 abonnés",
    ],
    cta: "Créer mon média",
    ctaHref: "/login",
  },
  "Médias & CMS": {
    eyebrow: "Rédactions, titres indépendants",
    headline: "Votre CMS. Votre audience. Votre ligne.",
    body: "Synchronisation bidirectionnelle avec vos bases existantes. Importez vos archives, continuez à publier où vous êtes, diffusez ici en temps réel. Votre audience grandit — nos serveurs absorbent.",
    features: [
      "API REST + webhooks pour sync CMS existants",
      "Import d'archives (RSS, JSON, CSV)",
      "Multi-auteurs et rôles éditoriaux",
      "Mise en avant croisée inter-médias sur qoe.fi",
      "Certification officielle (badge vérifié)",
      "Dashboard éditorial centralisé",
    ],
    cta: "Rejoindre l'écosystème",
    ctaHref: "/login",
  },
  "API": {
    eyebrow: "Développeurs, intégrateurs",
    headline: "Headless. Ouvert. Souverain.",
    body: "Accédez à l'intégralité de notre infrastructure via une API REST sémantique. Construisez votre front, votre app mobile, votre propre CMS. Nos données, votre interface.",
    features: [
      "API REST documentée (OpenAPI 3.0)",
      "Authentification via Supabase JWT",
      "Webhooks temps réel (publication, abonnement)",
      "SDK TypeScript open-source",
      "Sandbox de test gratuit",
      "SLA 99.9% — hébergement Hetzner (Allemagne)",
    ],
    cta: "Lire la documentation",
    ctaHref: "/docs",
  },
};

// Terminal-style code snippet for API tab
const API_SNIPPET = `// Récupérer les articles d'un média
const res = await fetch(
  'https://api.qoe.fi/v1/articles',
  {
    headers: {
      Authorization: \`Bearer \${token}\`,
      'Content-Type': 'application/json',
    },
  }
);

const { data } = await res.json();
// → [{ id, title, content, author, ... }]`;

export const CreatorHub = ({ config }: CreatorHubProps) => {
  const { t } = useTranslate();
  const [activeTab, setActiveTab] = useState<Tab>("Créateurs");

  const sectionTitle = config["creator_hub_title"] || t("creator_hub_title", "Une infrastructure pour ceux qui pensent.");
  const sectionTagline = config["creator_hub_tagline"] || t("creator_hub_tagline", "Rejoignez l'écosystème");

  const content = TAB_CONTENT[activeTab];

  return (
    <section className="bg-background py-28 px-6 border-t border-neutral-100" id="creators">
      <div className="max-w-6xl mx-auto">

        {/* Section header */}
        <div className="max-w-2xl mb-16">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[10px] tracking-[0.3em] text-neutral-400 uppercase font-semibold mb-4"
          >
            {sectionTagline}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl md:text-5xl font-bold text-neutral-900 tracking-tight leading-tight"
          >
            {sectionTitle}
          </motion.h2>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-12 bg-neutral-100 rounded-lg p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                activeTab === tab
                  ? "bg-white text-neutral-900 shadow-sm"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start"
          >
            {/* Left: text content */}
            <div>
              <p className="text-[10px] tracking-[0.2em] text-[#EE4B2B] uppercase font-semibold mb-4">
                {content.eyebrow}
              </p>
              <h3 className="text-3xl font-bold text-neutral-900 tracking-tight leading-tight mb-5">
                {content.headline}
              </h3>
              <p className="text-neutral-600 leading-relaxed mb-8 text-base">
                {content.body}
              </p>

              {/* Feature list */}
              <ul className="space-y-3 mb-10">
                {content.features.map((f, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-start gap-3"
                  >
                    <Check className="w-4 h-4 text-[#EE4B2B] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-neutral-700">{f}</span>
                  </motion.li>
                ))}
              </ul>

              <Link
                href={content.ctaHref}
                className="inline-flex items-center gap-2 bg-neutral-900 text-white font-semibold px-6 py-3 rounded-xl hover:bg-neutral-800 transition-colors text-sm"
              >
                {content.cta}
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Right: visual panel */}
            <div className="rounded-2xl border border-neutral-200 overflow-hidden bg-white shadow-sm">
              {activeTab === "API" ? (
                /* Code block for API tab */
                <div className="bg-neutral-950 h-full min-h-[380px] flex flex-col">
                  <div className="flex items-center gap-1.5 px-5 py-4 border-b border-neutral-800">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#EE4B2B]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <span className="ml-3 text-[10px] text-neutral-500 font-mono">api.qoe.fi</span>
                  </div>
                  <pre className="flex-1 p-6 text-[11px] font-mono leading-relaxed text-neutral-300 overflow-auto">
                    <code>{API_SNIPPET}</code>
                  </pre>
                </div>
              ) : activeTab === "Médias & CMS" ? (
                /* Dashboard mockup for Media tab */
                <div className="p-8 min-h-[380px] flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Dashboard éditorial</span>
                    <span className="text-[9px] text-[#EE4B2B] font-semibold">● En direct</span>
                  </div>
                  {[
                    { title: "Vers une presse souveraine", stat: "4.2k lecteurs", prog: 82 },
                    { title: "Le numérique militant", stat: "2.9k lecteurs", prog: 65 },
                    { title: "Décroissance et liberté", stat: "1.7k lecteurs", prog: 41 },
                  ].map((row, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-neutral-800 line-clamp-1">{row.title}</span>
                        <span className="text-[11px] text-neutral-500 flex-shrink-0 ml-4">{row.stat}</span>
                      </div>
                      <div className="h-1 bg-neutral-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.prog}%` }}
                          transition={{ delay: i * 0.1 + 0.3, duration: 0.7 }}
                          className="h-full rounded-full bg-[#EE4B2B]"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="mt-auto pt-4 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-[10px] text-neutral-400">Abonnés ce mois</span>
                    <span className="text-lg font-bold text-neutral-900">+248</span>
                  </div>
                </div>
              ) : (
                /* Creator setup mockup */
                <div className="p-8 min-h-[380px] flex flex-col gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EE4B2B] flex items-center justify-center text-white font-bold text-sm">M</div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Mon Média</p>
                      <p className="text-[10px] text-neutral-400">monmedia.qoe.fi</p>
                    </div>
                    <span className="ml-auto text-[9px] text-emerald-600 font-semibold border border-emerald-200 bg-emerald-50 px-2 py-0.5 rounded-full">Actif</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[{ n: "12", l: "Articles" }, { n: "340", l: "Abonnés" }, { n: "2.4k€", l: "Ce mois" }].map((s) => (
                      <div key={s.l} className="bg-neutral-50 rounded-xl p-3 text-center">
                        <p className="text-lg font-bold text-neutral-900">{s.n}</p>
                        <p className="text-[9px] text-neutral-400 mt-0.5">{s.l}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex-1 bg-neutral-50 rounded-xl p-4 flex flex-col gap-2">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Dernier brouillon</span>
                    <p className="text-sm font-semibold text-neutral-800 line-clamp-2">L'architecture du silence — pourquoi la lenteur est un acte politique</p>
                    <span className="text-[10px] text-neutral-400">642 mots · Auto-sauvegardé il y a 2 min</span>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Bottom conviction line */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mt-20 pt-12 border-t border-neutral-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
        >
          <div className="max-w-lg">
            <p className="text-lg font-semibold text-neutral-900 leading-snug mb-2">
              {t("creator_hub_conviction", "Zéro VC. Zéro GAFAM. Zéro compromis.")}
            </p>
            <p className="text-sm text-neutral-500">
              {t("creator_hub_conviction_sub", "Bootstrapé par conviction. Hébergé en Allemagne (Hetzner, énergie verte). Données souveraines. RGPD by design.")}
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 border border-neutral-300 text-neutral-700 font-medium px-5 py-2.5 rounded-lg hover:border-neutral-400 transition-colors text-sm flex-shrink-0"
          >
            {t("creator_hub_manifesto", "Lire le manifeste")}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
};
