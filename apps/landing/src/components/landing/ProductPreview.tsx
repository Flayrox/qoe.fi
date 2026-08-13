'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslate } from '@qoe/i18n';
import { Type, Eye, Coffee, Accessibility } from 'lucide-react';

type FontSize = 'text-base' | 'text-lg' | 'text-xl';

interface ProductPreviewProps {
  config: Record<string, string>;
}

export const ProductPreview = ({ config }: ProductPreviewProps) => {
  const { t } = useTranslate();
  const [fontSize, setFontSize] = useState<FontSize>('text-lg');
  const [readingMode, setReadingMode] = useState<'classic' | 'sepia' | 'dyslexia'>('classic');

  const previewTitle = config['preview_title'] || "L'architecture du silence";
  const previewContent =
    config['preview_content'] ||
    "Dans un monde saturé de stimuli, la lecture souveraine n'est pas un acte de consommation, mais une forme de résistance. C'est ici, dans ce Sanctuaire Elfique, que l'esprit retrouve sa trajectoire originelle, loin des algorithmes de capture de l'attention.";

  const getThemeClasses = () => {
    switch (readingMode) {
      case 'sepia':
        return 'bg-[#f4ecd8] text-[#5b4636] border-[#d3c1a5]';
      case 'dyslexia':
        return 'bg-white text-black font-sans leading-relaxed';
      default:
        return 'bg-[#fcfbf9] text-foreground border-border/60';
    }
  };

  return (
    <section className="py-32 px-6 bg-black overflow-hidden">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Side: Controls */}
          <div className="space-y-12">
            <div>
              <motion.span
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                className="font-mono text-[10px] tracking-[0.4em] text-white/40 uppercase font-semibold mb-6 block"
              >
                {t('preview_tagline', "L'expérience sensorielle")}
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="font-classical text-4xl md:text-6xl text-white font-medium tracking-tight mb-8"
              >
                {t('preview_main_title', 'Un confort de lecture absolu.')}
              </motion.h2>
              <p className="font-sans text-white/40 text-lg leading-relaxed">
                {t(
                  'preview_description',
                  "Testez en direct notre interface adaptative. Ajustez la typographie et l'ambiance pour créer votre propre espace de réflexion."
                )}
              </p>
            </div>

            {/* Accessibility Controls */}
            <div className="space-y-8 p-8 rounded-[2rem] bg-foreground/40 backdrop-blur-2xl border border-white/5">
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                  <Type className="w-3 h-3" /> {t('preview_control_size', 'Taille du texte')}
                </label>
                <div className="flex gap-2">
                  {['text-base', 'text-lg', 'text-xl'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setFontSize(size as FontSize)}
                      className={`flex-1 py-3 rounded-xl border text-sm transition-all ${
                        fontSize === size
                          ? 'bg-white text-black border-white'
                          : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'
                      }`}
                    >
                      {size === 'text-base' ? 'A' : size === 'text-lg' ? 'A+' : 'A++'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-widest">
                  <Eye className="w-3 h-3" /> {t('preview_control_mode', "Mode d'affichage")}
                </label>
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => setReadingMode('classic')}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                      readingMode === 'classic'
                        ? 'bg-white/10 border-white/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#fcfbf9] border border-border" />
                    <span className="text-white text-sm font-medium">
                      {t('preview_mode_classic', 'Sanctuaire Elfique (Clair)')}
                    </span>
                  </button>
                  <button
                    onClick={() => setReadingMode('sepia')}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                      readingMode === 'sepia'
                        ? 'bg-[#f4ecd8]/10 border-[#d3c1a5]/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-[#f4ecd8] border border-[#d3c1a5]" />
                    <span className="text-white text-sm font-medium">
                      {t('preview_mode_sepia', 'Sépia (Reposant)')}
                    </span>
                  </button>
                  <button
                    onClick={() => setReadingMode('dyslexia')}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                      readingMode === 'dyslexia'
                        ? 'bg-white/10 border-white/40'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <Accessibility className="w-6 h-6 text-white" />
                    <span className="text-white text-sm font-medium">
                      {t('preview_mode_dyslexia', 'Dyslexia Friendly')}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Live Simulation */}
          <div className="relative">
            <motion.div
              layout
              className={`relative aspect-[3/4] md:aspect-square w-full rounded-[3rem] p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] border-2 transition-colors duration-700 overflow-hidden ${getThemeClasses()}`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={readingMode}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col"
                >
                  <div className="flex items-center justify-between mb-16 opacity-40">
                    <span className="text-[10px] font-mono uppercase tracking-[0.3em]">
                      Lecture en cours
                    </span>
                    <Coffee className="w-4 h-4" />
                  </div>

                  <h1
                    className={`font-classical leading-tight mb-12 tracking-tight ${fontSize === 'text-base' ? 'text-3xl' : fontSize === 'text-lg' ? 'text-4xl' : 'text-5xl'}`}
                  >
                    {previewTitle}
                  </h1>

                  <div
                    className={`leading-relaxed ${fontSize} ${readingMode === 'dyslexia' ? 'font-sans font-medium' : 'font-classical'}`}
                  >
                    <p className="mb-8">{previewContent}</p>
                    <p className="opacity-60 italic">
                      {t(
                        'preview_continue',
                        "Continuez à lire pour découvrir l'essence de la souveraineté numérique..."
                      )}
                    </p>
                  </div>

                  <div className="mt-auto pt-12 flex items-center gap-4 opacity-20">
                    <div className="h-1 flex-1 bg-current rounded-full" />
                    <span className="text-[10px] font-mono uppercase">15%</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
