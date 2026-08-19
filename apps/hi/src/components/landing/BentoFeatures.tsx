'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { t } from '@lingui/core/macro';
import { Wallet, Compass, BookOpen, ShieldCheck, Zap } from 'lucide-react';

interface BentoFeaturesProps {
  config: Record<string, string>;
}

export const BentoFeatures = ({ config }: BentoFeaturesProps) => {
  const features = [
    {
      id: 'wallet',
      icon: Wallet,
      title: t`Économie Circulaire`,
      description:
        config['feature_wallet_desc'] ||
        t`Un portefeuille virtuel intégré permettant de soutenir vos auteurs préférés via WalletTransaction sans intermédiaire.`,
      size: 'md:col-span-2',
    },
    {
      id: 'pgvector',
      icon: Compass,
      title: t`Mode Hors-Piste`,
      description:
        config['feature_vector_desc'] ||
        t`Grâce à pgvector, notre IA brise votre bulle idéologique en injectant des perspectives radicalement différentes.`,
      size: 'md:col-span-1',
    },
    {
      id: 'monastic',
      icon: BookOpen,
      title: t`Lecteur Monastique`,
      description:
        config['feature_monastic_desc'] ||
        t`Un carnet personnel numérique où vos Highlights deviennent la matière première de votre propre pensée.`,
      size: 'md:col-span-1',
    },
    {
      id: 'sovereign',
      icon: ShieldCheck,
      title: t`Souveraineté Totale`,
      description:
        config['feature_sovereign_desc'] ||
        t`Aucun algorithme caché. Vous contrôlez chaque octet de votre expérience de lecture.`,
      size: 'md:col-span-2',
    },
  ];

  return (
    <section className="py-32 px-6 bg-background border-y border-border/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-24">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-sans text-[11px] tracking-[0.4em] text-muted-foreground uppercase font-semibold mb-6 block"
          >
            {t`L'infrastructure de l'esprit`}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="font-classical text-4xl md:text-6xl text-foreground font-medium tracking-tight"
          >
            {t`Une ingénierie de la conscience.`}
          </motion.h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              whileInView={{ opacity: 1, scale: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className={`group relative overflow-hidden rounded-[2.5rem] p-8 md:p-12 bg-card/60 backdrop-blur-2xl border border-border/40 hover:border-primary/40 transition-all duration-500 shadow-sm ${feature.size}`}
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-12 h-12 rounded-2xl bg-muted border border-border/40 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-500">
                  <feature.icon className="w-6 h-6" />
                </div>

                <h3 className="font-classical text-2xl md:text-3xl text-foreground mb-6 group-hover:translate-x-2 transition-transform duration-500">
                  {feature.title}
                </h3>

                <p className="font-sans text-muted-foreground group-hover:text-foreground leading-relaxed transition-colors duration-500">
                  {feature.description}
                </p>

                <div className="mt-auto pt-12">
                  <div className="h-px w-full bg-border/20 group-hover:bg-border/40 transition-colors" />
                  <div className="flex items-center justify-between mt-6">
                    <span className="text-[10px] font-sans text-muted-foreground uppercase tracking-widest">
                      {feature.id}
                    </span>
                    <Zap className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground group-hover:rotate-12 transition-all" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
