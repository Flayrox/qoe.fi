"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslate } from "@tolgee/react";

interface CTAProps {
  config: Record<string, string>;
}

export const CTA = ({ config }: CTAProps) => {
  const { t } = useTranslate();

  return (
    <section className="py-32 px-6 bg-black overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative bg-neutral-900/40 backdrop-blur-3xl border border-white/5 rounded-[4rem] p-16 md:p-32 overflow-hidden text-center"
        >
          {/* Halos */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[150px] translate-x-1/4 -translate-y-1/4 pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/10 rounded-full blur-[120px] -translate-x-1/4 translate-y-1/4 pointer-events-none" />

          <div className="relative z-10 max-w-2xl mx-auto">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="font-mono text-[10px] tracking-[0.4em] text-white/40 uppercase font-semibold mb-8 block"
            >
              {t("cta_tagline", "L'appel de la souveraineté")}
            </motion.span>
            
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="font-classical text-5xl md:text-7xl text-white mb-10 tracking-tight leading-[0.9]"
            >
              {config["cta_title"] || t("cta_main_title", "Prêt à habiter votre esprit ?")}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="font-sans text-white/40 text-lg mb-16 leading-relaxed"
            >
              {config["cta_description"] || t("cta_desc", "Rejoignez un réseau où la qualité prime sur la quantité, et où votre attention est le bien le plus précieux.")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 items-center justify-center"
            >
              <button className="w-full sm:w-auto px-12 py-5 bg-white text-black rounded-full font-bold hover:bg-neutral-200 transition-colors shadow-2xl">
                {t("cta_button_primary", "Ouvrir un compte")}
              </button>
              <button className="w-full sm:w-auto px-12 py-5 border border-white/10 text-white rounded-full font-bold hover:bg-white/5 transition-colors">
                {t("cta_button_secondary", "Explorer le manifeste")}
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="font-mono text-[10px] text-white/20 uppercase tracking-[0.3em] mt-16"
            >
              {t("cta_footer", "Sans publicité. Sans algorithme de capture. Sans compromis.")}
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
