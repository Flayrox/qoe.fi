"use client";

import React from "react";
import { motion } from "framer-motion";
import { useTranslate, useTolgee } from "@qoe/i18n";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

interface CTAProps {
  config: Record<string, string>;
}

export const CTA = ({ config }: CTAProps) => {
  const { t } = useTranslate();
  const tolgee = useTolgee();
  const locale = tolgee.getLanguage() || "fr";

  const eyebrow = config[`cta_eyebrow_${locale}`] || config["cta_eyebrow"] || t("cta_eyebrow", "Pour ceux qui veulent se cultiver");
  const headline = config[`cta_headline_${locale}`] || config["cta_headline"] || t("cta_headline", "Du temps bien dépensé.");
  const subline = config[`cta_subline_${locale}`] || config["cta_subline"] || t("cta_subline", "Pas de scroll toxique. Pas d'algorithme marchand. Juste du fond, du temps long, et un espace qui respecte votre intelligence.");
  const btnPrimary = config[`cta_btn_primary_${locale}`] || config["cta_btn_primary"] || t("cta_btn_primary", "Commencer à lire");
  const btnSecondary = config[`cta_btn_secondary_${locale}`] || config["cta_btn_secondary"] || t("cta_btn_secondary", "Se cultiver, gratuitement");
  const socialProof = config[`cta_social_proof_${locale}`] || config["cta_social_proof"] || t("cta_social_proof", "Gratuit · Aucune carte bancaire requise · Données hébergées en Europe");

  return (
    <section
      className="relative overflow-hidden py-32 px-6 flex flex-col items-center text-center"
      style={{ background: "#F97316" }}
    >
      {/* Grain texture overlay */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }} />

      <div className="relative z-10 max-w-2xl mx-auto">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-[10px] tracking-[0.3em] text-white/60 uppercase font-semibold mb-8"
        >
          {eyebrow}
        </motion.p>

        {/* Headline — very large, typographic */}
        <motion.h2
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl md:text-6xl font-bold text-white tracking-tight leading-tight mb-6"
        >
          {headline}
        </motion.h2>

        {/* Subline */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-white/70 text-base md:text-lg leading-relaxed mb-12 max-w-xl mx-auto"
        >
          {subline}
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col sm:flex-row gap-3 justify-center items-center"
        >
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-[#EE4B2B] font-semibold px-7 py-3.5 rounded-xl hover:bg-neutral-50 transition-colors shadow-lg text-sm"
          >
            {btnPrimary}
            <ArrowUpRight className="w-4 h-4" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white font-medium px-7 py-3.5 rounded-xl border border-white/20 hover:border-white/40 transition-all text-sm"
          >
            {btnSecondary}
          </Link>
        </motion.div>

        {/* Social proof micro-line */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-[11px] text-white/40"
        >
          {socialProof}
        </motion.p>
      </div>
    </section>
  );
};
