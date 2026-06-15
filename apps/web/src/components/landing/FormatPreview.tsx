"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { FileText, Mail, Volume2, BarChart2, Zap, LayoutGrid, Circle, Maximize2, Terminal } from "lucide-react";

interface FormatPreviewProps {
  config: Record<string, string>;
}

export const FormatPreview = ({ config }: FormatPreviewProps) => {
  const { t } = useTranslate();
  const [activeFormat, setActiveFormat] = useState("essay");

  const title = config["format_title"] || t("format_preview_title", "Cinq Formats de Récits");
  const tagline = config["format_tagline"] || t("format_preview_tagline", "Au-delà du simple mur de texte");

  const formats = [
    {
      id: "essay",
      label: "Essais Profonds",
      icon: FileText,
      color: "text-primary",
      bg: "bg-primary/10",
      content: {
        title: "Éloge de la lenteur attentionnelle",
        badge: "ESSAI RECHERCHE",
        preview: "L'essai sur qoe.fi privilégie la structure monastique : de grands espaces de respiration, une typographie classique Serif hautement lisible, et l'exclusion de tout distraction pour plonger le lecteur dans un état de flow intellectuel.",
        meta: "12 min read • Publié dans Philosophie"
      }
    },
    {
      id: "newsletter",
      label: "Newsletters",
      icon: Mail,
      color: "text-primary",
      bg: "bg-primary/10",
      content: {
        title: "Le Courrier de la Souveraineté",
        badge: "NEWSLETTER HEBDOMADAIRE",
        preview: "Envoyez directement vos travaux à vos abonnés par e-mail en un clic via notre API Brevo intégrée. Les e-mails reprennent fidèlement votre style, votre logo, et vos couleurs d'accentuation, sans publicité additionnelle.",
        meta: "Lu par 14,000 abonnés"
      }
    },
    {
      id: "audio",
      label: "Audio Lectures",
      icon: Volume2,
      color: "text-primary",
      bg: "bg-primary/10",
      content: {
        title: "Version Vocale Synthétisée",
        badge: "PODCAST / LECTURE AUDIO",
        preview: "Permettez à vos lecteurs d'écouter vos articles lors de leurs déplacements. Intégration d'un lecteur audio flottant et épuré avec des voix synthétiques naturelles respectant le rythme éditorial.",
        meta: "Lecteur audio HTML5 natif"
      }
    },
    {
      id: "data",
      label: "Data Stories",
      icon: BarChart2,
      color: "text-primary",
      bg: "bg-primary/10",
      content: {
        title: "La souveraineté cloud en chiffres",
        badge: "INFOGRAPHIES & DATA",
        preview: "Intégrez des graphiques réactifs (Recharts) directement au fil de l'article pour étayer vos thèses. Idéal pour les journalistes de données et les rapports d'investigation complexes.",
        meta: "Interactive charts support"
      }
    }
  ];

  const current = formats.find(f => f.id === activeFormat) || formats[0];

  return (
    <section className="py-32 px-6 bg-background relative overflow-hidden" id="formats">
      {/* Decorative halos removed */}

      <div className="max-w-6xl mx-auto relative z-10 space-y-20">
        
        {/* Title block */}
        <div className="text-center space-y-4">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase font-semibold block">
            {tagline}
          </span>
          <h2 className="text-4xl md:text-6xl text-foreground font-medium tracking-tight">
            {title}
          </h2>
        </div>

        {/* Cursor IDE Layout Showcase */}
        <div className="bg-card border border-border/50 rounded-xl shadow-2xl overflow-hidden flex flex-col md:flex-row h-[560px]">
          
          {/* Left panel: Format selectors (IDE sidebar) */}
          <div className="w-full md:w-64 border-r border-border/40 bg-muted/20 flex flex-col">
            
            {/* Header window controls */}
            <div className="px-6 py-4 border-b border-border/40 flex items-center gap-2">
              <Circle className="w-3.5 h-3.5 fill-red-500/80 text-transparent" />
              <Circle className="w-3.5 h-3.5 fill-yellow-500/80 text-transparent" />
              <Circle className="w-3.5 h-3.5 fill-green-500/80 text-transparent" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-4">
                IDE FORMATS
              </span>
            </div>

            {/* Selection list */}
            <div className="flex-1 p-4 space-y-2 overflow-y-auto">
              {formats.map((f) => {
                const Icon = f.icon;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFormat(f.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-left text-xs font-medium tracking-wide transition-all duration-300 cursor-pointer ${
                      activeFormat === f.id
                        ? "bg-card border border-border/40 text-foreground font-bold shadow-md"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${f.color}`} />
                    <span>{f.label}</span>
                  </button>
                );
              })}
            </div>
            
            {/* Sidebar Footer */}
            <div className="p-4 border-t border-border/40 bg-muted/40 text-[10px] text-muted-foreground flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span>v1.0.2 ready</span>
            </div>
          </div>

          {/* Right panel: Editor Workspace view */}
          <div className="flex-1 flex flex-col bg-card relative">
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between bg-muted/10">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span>src</span>
                <span>/</span>
                <span>formats</span>
                <span>/</span>
                <span className="text-foreground font-bold">{current.id}.md</span>
              </div>
              <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
            </div>

            {/* Display Pane with animation */}
            <div className="flex-1 p-8 md:p-12 overflow-y-auto custom-scrollbar flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, x: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -20, filter: "blur(10px)" }}
                  transition={{ duration: 0.4 }}
                  className="w-full max-w-lg space-y-6"
                >
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${current.color} ${current.bg}`}>
                    {current.content.badge}
                  </span>
                  
                  <h3 className="font-sans text-3xl md:text-4xl text-foreground font-semibold leading-tight">
                    {current.content.title}
                  </h3>

                  <p className="font-sans text-lg text-foreground/80 leading-relaxed border-l-2 border-border/80 pl-4 py-1">
                    {current.content.preview}
                  </p>

                  <div className="pt-4 flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider border-t border-border/40">
                    <span>{current.content.meta}</span>
                    <span className="flex items-center gap-1 text-primary animate-pulse">
                      <Zap className="w-3.5 h-3.5" /> LIVE
                    </span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};
