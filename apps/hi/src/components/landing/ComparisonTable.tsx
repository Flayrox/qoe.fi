'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { t } from '@lingui/core/macro';
import { Check, X, Shield, Sparkles, HelpCircle } from 'lucide-react';

interface ComparisonRow {
  feature: string;
  substack: string;
  qoefi: string;
  highlighted?: boolean;
}

interface ComparisonTableProps {
  config: Record<string, string>;
}

export const ComparisonTable = ({ config }: ComparisonTableProps) => {
  const title = config['comparison_title'] || t`Souveraineté ou Intermédiation ?`;
  const tagline =
    config['comparison_tagline'] || t`Pourquoi qoe.fi redéfinit l'édition indépendante`;

  // Load custom rows from config if present, or use premium defaults
  let rows: ComparisonRow[] = [];
  if (config['comparison_rows']) {
    try {
      rows = JSON.parse(config['comparison_rows']);
    } catch (e) {
      console.error('Failed to parse comparison_rows config JSON, falling back to defaults', e);
    }
  }

  if (rows.length === 0) {
    rows = [
      {
        feature: t`Commission sur vos revenus`,
        substack: t`10% de frais de plateforme directs + frais Stripe`,
        qoefi: t`Près de 0% (Soutien direct via Wallet, frais de réseau uniquement)`,
        highlighted: true,
      },
      {
        feature: t`Curation algorithmique`,
        substack: t`Boîte noire centralisée et recommandations forcées`,
        qoefi: t`Contrôle souverain (Algorithme personnalisable, Muted Words)`,
        highlighted: false,
      },
      {
        feature: t`Diversité des Formats`,
        substack: t`Texte simple / Newsletter standard uniquement`,
        qoefi: t`5 formats de récits (Essais, Briefings, Podcasts, Stories de données, Stories)`,
        highlighted: false,
      },
      {
        feature: t`Expérience de lecture`,
        substack: t`Flux encombré de recommandations d'autres auteurs, popups`,
        qoefi: t`Lecture monastique (Sanctuaire silencieux sans distraction)`,
        highlighted: true,
      },
      {
        feature: t`Souveraineté des données`,
        substack: t`Partiellement captive (relation abonné détenue par Substack)`,
        qoefi: t`Absolue (Données 100% exportables, protocoles décentralisés)`,
        highlighted: false,
      },
      {
        feature: t`Hébergement & Juridiction`,
        substack: t`Hébergement US centralisé (Cloud Act / Non souverain)`,
        qoefi: t`Infrastructure européenne souveraine & Option auto-hébergée`,
        highlighted: false,
      },
    ];
  }

  return (
    <section className="py-32 px-6 bg-background relative overflow-hidden" id="comparison">
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Title Block */}
        <div className="mb-20 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="font-sans text-[11px] tracking-[0.4em] text-muted-foreground uppercase font-semibold mb-4 block"
          >
            {tagline}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="font-classical text-4xl md:text-6xl text-foreground font-medium tracking-tight"
          >
            {title}
          </motion.h2>
        </div>

        {/* Comparison Grid (Responsive Card/Table hybrid) */}
        <div className="mt-12 bg-card/40 backdrop-blur-md border border-border/40 rounded-[2.5rem] overflow-hidden shadow-2xl">
          {/* Header Row (Hidden on small screens) */}
          <div className="hidden md:grid grid-cols-12 border-b border-border/40 bg-muted/30 px-8 py-6 font-sans text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            <div className="col-span-4 flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>{t`Dimension`}</span>
            </div>
            <div className="col-span-4 text-center">{t`Substack`}</div>
            <div className="col-span-4 text-center text-foreground flex items-center justify-center gap-1.5 bg-primary/5 border-x border-border/20 py-2 rounded-t-xl -my-8">
              <Sparkles className="w-3 h-3 text-primary" />
              <span>{t`qoe.fi (Souverain)`}</span>
            </div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-border/40">
            {rows.map((row, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className={`grid grid-cols-1 md:grid-cols-12 items-center px-8 py-8 md:py-6 gap-4 md:gap-0 transition-colors duration-300 ${
                  row.highlighted ? 'bg-primary/[0.02]' : ''
                }`}
              >
                {/* Feature Dimension */}
                <div className="col-span-1 md:col-span-4">
                  <h4 className="font-classical text-lg md:text-base font-medium text-foreground">
                    {row.feature}
                  </h4>
                </div>

                {/* Substack Column */}
                <div className="col-span-1 md:col-span-4 md:text-center flex items-start md:justify-center gap-3 text-muted-foreground text-sm font-sans md:px-4">
                  <span className="md:hidden font-sans text-[10px] uppercase font-semibold tracking-wider text-muted-foreground/60 mt-1">
                    {t`Substack:`}
                  </span>
                  <X className="w-4 h-4 text-destructive/60 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{row.substack}</span>
                </div>

                {/* qoe.fi Column */}
                <div className="col-span-1 md:col-span-4 md:text-center flex items-start md:justify-center gap-3 text-foreground text-sm font-sans font-medium md:px-4 md:border-x md:border-border/10 md:-my-6 md:py-6 bg-primary/[0.02]">
                  <span className="md:hidden font-sans text-[10px] uppercase font-semibold tracking-wider text-primary mt-1">
                    {t`qoe.fi:`}
                  </span>
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{row.qoefi}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer Guarantee */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          className="mt-12 text-center max-w-2xl mx-auto px-4"
        >
          <p className="text-xs text-muted-foreground leading-relaxed flex items-center justify-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary flex-shrink-0" />
            <span>
              {t`qoe.fi est conçu pour les créateurs qui refusent le compromis de la centralisation algorithmique et de l'intermédiation financière.`}
            </span>
          </p>
        </motion.div>
      </div>
    </section>
  );
};
