"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { Wallet, Compass, BookOpen, ShieldCheck, Zap } from "lucide-react";

interface BentoFeaturesProps {
  config: Record<string, string>;
}

export const BentoFeatures = ({ config }: BentoFeaturesProps) => {
  const { t } = useTranslate();

  const features = [
    {
      id: "wallet",
      icon: Wallet,
      title: t("feature_wallet_title", "Économie Circulaire"),
      description: config["feature_wallet_desc"] || "Un portefeuille virtuel intégré permettant de soutenir vos auteurs préférés via WalletTransaction sans intermédiaire.",
      size: "md:col-span-2",
      gradient: "from-emerald-500/20 to-teal-500/20"
    },
    {
      id: "pgvector",
      icon: Compass,
      title: t("feature_vector_title", "Mode Hors-Piste"),
      description: config["feature_vector_desc"] || "Grâce à pgvector, notre IA brise votre bulle idéologique en injectant des perspectives radicalement différentes.",
      size: "md:col-span-1",
      gradient: "from-blue-500/20 to-indigo-500/20"
    },
    {
      id: "monastic",
      icon: BookOpen,
      title: t("feature_monastic_title", "Lecteur Monastique"),
      description: config["feature_monastic_desc"] || "Un carnet personnel numérique où vos Highlights deviennent la matière première de votre propre pensée.",
      size: "md:col-span-1",
      gradient: "from-amber-500/20 to-orange-500/20"
    },
    {
      id: "sovereign",
      icon: ShieldCheck,
      title: t("feature_sovereign_title", "Souveraineté Totale"),
      description: config["feature_sovereign_desc"] || "Aucun algorithme caché. Vous contrôlez chaque octet de votre expérience de lecture.",
      size: "md:col-span-2",
      gradient: "from-violet-500/20 to-purple-500/20"
    }
  ];

  return (
    <section className="py-32 px-6 bg-black">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-24">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="font-mono text-[10px] tracking-[0.4em] text-white/40 uppercase font-semibold mb-6 block"
          >
            {t("features_tagline", "L'infrastructure de l'esprit")}
          </motion.span>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="font-classical text-4xl md:text-6xl text-white font-medium tracking-tight"
          >
            {t("features_title", "Une ingénierie de la conscience.")}
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
              className={`group relative overflow-hidden rounded-[2.5rem] p-8 md:p-12 bg-neutral-900/40 backdrop-blur-2xl border border-white/5 ${feature.size}`}
            >
              {/* Feature Gradient Background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-700`} />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-8 group-hover:scale-110 group-hover:bg-white group-hover:text-black transition-all duration-500">
                  <feature.icon className="w-6 h-6" />
                </div>
                
                <h3 className="font-classical text-2xl md:text-3xl text-white mb-6 group-hover:translate-x-2 transition-transform duration-500">
                  {feature.title}
                </h3>
                
                <p className="font-sans text-white/40 group-hover:text-white/70 leading-relaxed transition-colors duration-500">
                  {feature.description}
                </p>

                <div className="mt-auto pt-12">
                  <div className="h-px w-full bg-white/5 group-hover:bg-white/10 transition-colors" />
                  <div className="flex items-center justify-between mt-6">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">{feature.id}</span>
                    <Zap className="w-4 h-4 text-white/10 group-hover:text-white/40 group-hover:rotate-12 transition-all" />
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
