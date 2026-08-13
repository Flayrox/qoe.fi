'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { t } from '@lingui/core/macro';
import { CheckCircle, Users, FileText } from 'lucide-react';

interface TrustedCreatorsProps {
  config: Record<string, string>;
}

export const TrustedCreators = ({ config }: TrustedCreatorsProps) => {
  const title = config['creators_title'] || t`Ils écrivent sur qoe.fi`;
  const tagline = config['creators_tagline'] || t`Des voix libres et indépendantes`;

  const mediaLogos = [
    { name: 'Mediapart', desc: "Média d'investigation" },
    { name: 'Basta!', desc: 'Média écologiste' },
    { name: 'StreetPress', desc: 'Journalisme de terrain' },
    { name: "L'Humanité", desc: 'Quotidien engagé' },
  ];

  const creators = [
    {
      name: 'Maxime Vivas',
      role: "Journaliste d'enquête",
      subscribers: '12.4k',
      articles: 184,
      desc: "Ancien reporter, spécialisé dans l'impact écologique des infrastructures numériques.",
    },
    {
      name: 'Chloé Dufour',
      role: 'Sociologue & Écrivaine',
      subscribers: '8.1k',
      articles: 92,
      desc: "Chroniqueuse sur la décroissance attentionnelle et l'auto-suffisance technologique.",
    },
    {
      name: 'David Graber',
      role: 'Philosophe indépendant',
      subscribers: '24.9k',
      articles: 301,
      desc: "Auteur d'essais sur la réappropriation du temps de cerveau disponible.",
    },
  ];

  return (
    <section
      className="py-32 px-6 bg-muted/20 border-y border-border/30 relative overflow-hidden"
      id="creators"
    >
      {/* Glow decorations removed */}

      <div className="max-w-6xl mx-auto relative z-10 space-y-24">
        {/* Header Title */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase font-semibold block">
            {tagline}
          </span>
          <h2 className="text-4xl md:text-6xl text-foreground font-medium tracking-tight">
            {title}
          </h2>
        </div>

        {/* Media Logos Marquee/List */}
        <div className="space-y-8">
          <div className="text-center">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
              {t`Inspiré et supporté par les rédactions libres`}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {mediaLogos.map((media, i) => (
              <motion.div
                key={media.name}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center justify-center p-6 bg-card border border-border/50 rounded-xl shadow-sm text-center"
              >
                <span className="text-xl font-bold tracking-tight text-foreground/80">
                  {media.name}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider mt-1">
                  {media.desc}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Creator Profiles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {creators.map((creator, i) => (
            <motion.div
              key={creator.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              whileHover={{ y: -6 }}
              className="group bg-card border border-border/40 hover:border-primary/30 rounded-xl p-8 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all duration-500 overflow-hidden relative"
            >
              {/* Subtle hover gradient shifts removed */}

              <div className="relative z-10 space-y-6">
                {/* Profile Header */}
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl bg-muted border border-border/50 flex items-center justify-center text-xl font-bold text-foreground overflow-hidden">
                    {creator.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-xl text-foreground font-semibold flex items-center gap-1.5">
                      {creator.name}{' '}
                      <CheckCircle className="w-4 h-4 text-primary fill-primary/10 flex-shrink-0" />
                    </h4>
                    <span className="text-xs text-muted-foreground">{creator.role}</span>
                  </div>
                </div>

                {/* Description */}
                <p className="font-sans text-sm text-muted-foreground leading-relaxed">
                  {creator.desc}
                </p>
              </div>

              {/* Creator stats */}
              <div className="relative z-10 mt-8 pt-6 border-t border-border/40 flex justify-between text-xs font-medium">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="w-3.5 h-3.5 text-primary" />
                  <span>{t`${creator.subscribers} abonnés`}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  <span>{t`${creator.articles} articles`}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
