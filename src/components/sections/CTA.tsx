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
    <section className="py-24 px-6 bg-background overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative bg-[#EE4B2B] rounded-[3rem] p-12 md:p-24 overflow-hidden text-center shadow-xl"
        >
          <div className="relative z-10 max-w-2xl mx-auto">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="font-mono text-[10px] tracking-[0.4em] text-white/70 uppercase font-semibold mb-8 block"
            >
              {t("cta_tagline", "L'appel de la souveraineté")}
            </motion.span>
            
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl md:text-6xl font-bold text-white mb-10 tracking-tight leading-tight"
            >
              {config["cta_title"] || t("cta_main_title", "Prêt à habiter votre esprit ?")}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-white/80 text-base md:text-lg mb-12 leading-relaxed"
            >
              {config["cta_description"] || t("cta_desc", "Rejoignez un réseau où la qualité prime sur la quantité, et où votre attention est le bien le plus précieux.")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 items-center justify-center"
            >
              <button className="w-full sm:w-auto px-8 py-3.5 bg-white text-[#EE4B2B] rounded-xl font-semibold hover:bg-neutral-100 transition-colors shadow-md text-sm active:scale-97 duration-200 cursor-pointer">
                {t("cta_button_primary", "Ouvrir un compte")}
              </button>
              <button className="w-full sm:w-auto px-8 py-3.5 border border-white/25 text-white rounded-xl font-semibold hover:bg-white/10 transition-colors text-sm active:scale-97 duration-200 cursor-pointer">
                {t("cta_button_secondary", "Explorer le manifeste")}
              </button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-xs text-white/60 mt-12"
            >
              {t("cta_footer", "Sans publicité. Sans algorithme de capture. Sans compromis.")}
            </motion.p>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
