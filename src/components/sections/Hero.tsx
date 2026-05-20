"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslate } from "@tolgee/react";

interface HeroProps {
  config: Record<string, string>;
}

export const Hero = ({ config }: HeroProps) => {
  const { t } = useTranslate();
  const [mode, setMode] = useState<"read" | "publish">("read");

  const pitchRead = config["hero_pitch_read"] || "Une lecture monastique, libérée du bruit.";
  const pitchPublish = config["hero_pitch_publish"] || "Devenez le souverain de votre propre média.";

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center pt-32 pb-20 px-6 overflow-hidden bg-black transition-colors duration-1000">
      {/* Dynamic Halos */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: mode === "read" ? "-10%" : "10%",
            y: mode === "read" ? "-5%" : "5%",
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[150px] opacity-40 mix-blend-screen transition-colors duration-1000 ${
            mode === "read" ? "bg-emerald-600/20" : "bg-amber-600/20"
          }`}
        />
        <motion.div
          animate={{
            x: mode === "read" ? "10%" : "-10%",
            y: mode === "read" ? "5%" : "-5%",
            scale: [1.1, 1, 1.1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute bottom-1/4 right-1/4 w-[700px] h-[700px] rounded-full blur-[150px] opacity-30 mix-blend-screen transition-colors duration-1000 ${
            mode === "read" ? "bg-blue-600/10" : "bg-violet-600/10"
          }`}
        />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto text-center">
        {/* Magnetic Switcher */}
        <div className="inline-flex mb-16 p-1.5 bg-neutral-900/40 backdrop-blur-2xl border border-white/5 rounded-full shadow-2xl">
          <button
            onClick={() => setMode("read")}
            className={`relative px-8 py-3 rounded-full text-xs font-mono uppercase tracking-[0.2em] transition-all duration-500 ${
              mode === "read" ? "text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            {mode === "read" && (
              <motion.div
                layoutId="switcher-bg"
                className="absolute inset-0 bg-white/10 rounded-full border border-white/10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{t("hero_mode_read", "Je veux lire")}</span>
          </button>
          <button
            onClick={() => setMode("publish")}
            className={`relative px-8 py-3 rounded-full text-xs font-mono uppercase tracking-[0.2em] transition-all duration-500 ${
              mode === "publish" ? "text-white" : "text-white/40 hover:text-white/60"
            }`}
          >
            {mode === "publish" && (
              <motion.div
                layoutId="switcher-bg"
                className="absolute inset-0 bg-white/10 rounded-full border border-white/10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{t("hero_mode_publish", "Je veux publier")}</span>
          </button>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, filter: "blur(20px)", y: 20 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(20px)", y: -20 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="font-classical text-6xl md:text-8xl lg:text-9xl text-white leading-[0.9] tracking-tighter mb-12">
              {mode === "read" ? (
                <>
                  <span className="block italic opacity-40">{t("hero_read_title_1", "Le silence")}</span>
                  <span className="block font-medium">{t("hero_read_title_2", "est un luxe.")}</span>
                </>
              ) : (
                <>
                  <span className="block italic opacity-40">{t("hero_publish_title_1", "Votre voix,")}</span>
                  <span className="block font-medium">{t("hero_publish_title_2", "votre royaume.")}</span>
                </>
              )}
            </h1>

            <p className="font-sans text-lg md:text-2xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-16">
              {mode === "read" ? pitchRead : pitchPublish}
            </p>

            <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
              <button className="group relative px-10 py-5 bg-white text-black rounded-full font-semibold overflow-hidden transition-transform active:scale-95">
                <span className="relative z-10">{t("hero_cta_primary", "Commencer l'expérience")}</span>
                <div className="absolute inset-0 bg-neutral-200 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
              <button className="px-10 py-5 border border-white/10 hover:border-white/20 text-white rounded-full font-semibold backdrop-blur-sm transition-all">
                {t("hero_cta_secondary", "En savoir plus")}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Subtle Bottom Fade */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  );
};
