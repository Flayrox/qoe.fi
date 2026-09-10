'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Compass, ArrowLeft, Dices, Sparkles, Check, BookOpen } from 'lucide-react';
import { LogoSymbol } from '@qoe/brand';

interface NotFoundViewProps {
  /**
   * Code de langue optionnel ('fr' ou 'en'). Si omis, auto-détecté via html lang ou 'fr'.
   */
  locale?: 'fr' | 'en';
  /**
   * Titre personnalisé optionnel.
   */
  title?: string;
  /**
   * Message personnalisé optionnel.
   */
  description?: string;
  /**
   * Afficher ou masquer la barre de recherche intégrée (défaut: true).
   */
  showSearch?: boolean;
}

const THEORIES = {
  fr: [
    'Un calligraphe distrait a renversé son café filtre sur la table des matières.',
    'Ce chapitre s’est échappé cette nuit pour fonder sa propre revue clandestine.',
    'Cette pensée était tellement avant-gardiste que son URL n’est prévue que pour 2032.',
    'Une société secrète de typographes a discrètement remplacé cette page par un feuillet vierge.',
    'L’auteur a souffert du syndrome de la page blanche... et elle a littéralement disparu.',
    'Une rafale de vent numérique a emporté ce feuillet vers un autre rayon de la bibliothèque.',
    'Ce texte a refusé d’être indexé, affirmant qu’il préférait demeurer une légende orale.',
    'Le relieur a cousu les pages dans le désordre. Celle-ci flotte désormais entre deux dimensions.',
    'Cette pensée est actuellement en cours de reformulation dans un café de Montmartre.',
    'Un chat d’imprimerie s’est endormi sur la touche Suppr au moment du bouclage.',
  ],
  en: [
    'A distracted calligrapher spilled filter coffee over the table of contents.',
    'This chapter escaped last night to start its own underground literary gazette.',
    'This thought was so avant-garde that its URL is only scheduled for release in 2032.',
    'A secret guild of typographers quietly replaced this page with blank parchment.',
    'The author suffered from writer’s block... and the page literally vanished.',
    'A digital gust of wind swept this draft away to another corner of the library.',
    'This essay refused to be indexed, declaring it preferred to remain an oral legend.',
    'The bookbinder stitched the folios out of order; this one now drifts between worlds.',
    'This reflection is currently being rewritten in a quiet Parisian café.',
    'The printing press cat napped on the Delete key right before deadline.',
  ],
};

const STRINGS = {
  fr: {
    badge: 'PIÈCE MANQUANTE #404',
    title: 'Manuscrit introuvable dans les archives',
    subtitle:
      'La page que vous cherchez s’est détachée de la reliure, a été déplacée ou n’a pas encore été rédigée.',
    theoryTitle: 'Hypothèse du bibliothécaire sur cette disparition :',
    theoryRoll: 'Autre explication',
    repairPrompt: 'La feuille semble déchirée...',
    repairBtn: 'Recoudre la reliure',
    repairing: 'Recousage en cours...',
    repaired: 'Reliure réparée ! Retour au fil des pensées...',
    searchPlaceholder: 'Rechercher un auteur, une publication, un sujet...',
    searchBtn: 'Rechercher',
    backHome: 'Reprendre le fil',
    explore: 'Explorer les écrits',
    goBack: 'Page précédente',
    lostCoordinates: 'Coordonnées égarées : ',
  },
  en: {
    badge: 'MISSING LEAF #404',
    title: 'Manuscript missing from the archives',
    subtitle:
      'The page you are looking for detached from the binding, was moved, or has not been penned yet.',
    theoryTitle: 'The librarian’s theory on this disappearance:',
    theoryRoll: 'Another theory',
    repairPrompt: 'The leaf appears torn...',
    repairBtn: 'Stitch the binding',
    repairing: 'Stitching page...',
    repaired: 'Binding restored! Returning to the stream of thoughts...',
    searchPlaceholder: 'Search for an author, publication, topic...',
    searchBtn: 'Search',
    backHome: 'Back to feed',
    explore: 'Explore essays',
    goBack: 'Go back',
    lostCoordinates: 'Lost coordinates: ',
  },
};

export function NotFoundView({
  locale: propLocale,
  title,
  description,
  showSearch = true,
}: NotFoundViewProps) {
  const router = useRouter();
  const [locale, setLocale] = useState<'fr' | 'en'>(propLocale || 'fr');
  const [theoryIndex, setTheoryIndex] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isRepaired, setIsRepaired] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPath, setCurrentPath] = useState('');

  // 3D Tilt state
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!propLocale && typeof document !== 'undefined') {
      const docLang = document.documentElement.lang?.toLowerCase();
      if (docLang?.startsWith('en')) {
        setLocale('en');
      }
    }
    if (typeof window !== 'undefined') {
      setCurrentPath(window.location.pathname);
      // Random initial theory
      const list = THEORIES[locale];
      setTheoryIndex(Math.floor(Math.random() * list.length));
    }
  }, [propLocale, locale]);

  const t = STRINGS[locale];
  const currentTheories = THEORIES[locale];

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left; // x position within element
    const y = e.clientY - rect.top; // y position within element
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    // Rotate max 7 degrees
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    setTilt({ x: rotateX, y: rotateY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
  }, []);

  const handleRollTheory = () => {
    if (isRolling) return;
    setIsRolling(true);
    setTimeout(() => {
      setTheoryIndex((prev) => (prev + 1) % currentTheories.length);
      setIsRolling(false);
    }, 240);
  };

  const handleRepair = () => {
    if (isRepairing || isRepaired) return;
    setIsRepairing(true);
    setTimeout(() => {
      setIsRepairing(false);
      setIsRepaired(true);
      setTimeout(() => {
        router.push('/home');
      }, 1100);
    }, 900);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <main className="min-h-[82vh] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-10 select-none overflow-hidden relative">
      {/* Halo d'ambiance vermillon subtil en arrière-plan */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full bg-[#EE4B2B]/[0.07] blur-[120px]"
      />

      <div className="w-full max-w-3xl flex flex-col items-center gap-8 relative z-10">
        {/* 📜 Carte 3D Interactive « Le Manuscrit Vivant » */}
        <div
          ref={cardRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
            transition:
              tilt.x === 0 && tilt.y === 0 ? 'transform 0.5s ease-out' : 'transform 0.1s ease-out',
          }}
          className="w-full relative rounded-3xl border border-border/80 bg-card/90 backdrop-blur-xl p-6 sm:p-10 shadow-2xl shadow-black/5 dark:shadow-black/40 overflow-hidden group"
        >
          {/* Ligne dorée/vermillon décorative en haut de la reliure */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#EE4B2B] to-transparent opacity-80" />

          {/* Sceau de cire officiel vermillon en haut à droite */}
          <div className="absolute top-5 right-5 sm:top-7 sm:right-7 flex items-center justify-center">
            <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#EE4B2B] text-white shadow-lg shadow-[#EE4B2B]/30 flex items-center justify-center transition-transform duration-300 group-hover:scale-105 group-hover:rotate-6">
              <LogoSymbol className="w-6 h-6 sm:w-7 sm:h-7" fillColor="#FFFFFF" />
              {/* Micro-contour estampé */}
              <div className="absolute inset-0.5 rounded-full border border-white/30 pointer-events-none" />
            </div>
          </div>

          {/* Badge & Statut 404 */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EE4B2B]/10 text-[#EE4B2B] border border-[#EE4B2B]/20 text-xs font-mono font-medium tracking-wider mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B] animate-pulse" />
            {t.badge}
          </div>

          {/* Titre & Message littéraire */}
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground font-classical max-w-[85%] mb-3">
            {title || t.title}
          </h1>

          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl mb-6">
            {description || t.subtitle}
          </p>

          {/* Chemin demandé */}
          {currentPath && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/60 text-muted-foreground text-xs font-mono border border-border/60 mb-6">
              <span className="opacity-70">{t.lostCoordinates}</span>
              <span className="font-semibold text-foreground/90 truncate max-w-[280px] sm:max-w-md">
                {currentPath}
              </span>
            </div>
          )}

          {/* 🎲 Widget interactif : Théorie du bibliothécaire */}
          <div className="rounded-2xl bg-muted/40 border border-border/60 p-4 sm:p-5 relative transition-all duration-300">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5 text-[#EE4B2B]" />
                <span>{t.theoryTitle}</span>
              </div>
              <button
                type="button"
                onClick={handleRollTheory}
                disabled={isRolling}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#EE4B2B] hover:text-[#EE4B2B]/80 px-2.5 py-1 rounded-md bg-[#EE4B2B]/10 hover:bg-[#EE4B2B]/15 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Dices
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${
                    isRolling ? 'rotate-180 scale-110' : ''
                  }`}
                />
                <span>{t.theoryRoll}</span>
              </button>
            </div>

            <p
              className={`text-sm sm:text-base italic text-foreground/90 font-serif leading-relaxed transition-opacity duration-200 ${
                isRolling ? 'opacity-20' : 'opacity-100'
              }`}
            >
              « {currentTheories[theoryIndex]} »
            </p>
          </div>

          {/* 🪡 Easter Egg Interactif : Recoudre la reliure */}
          <div className="mt-6 pt-5 border-t border-border/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {isRepaired ? (
                <span className="text-success font-medium inline-flex items-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {t.repaired}
                </span>
              ) : isRepairing ? (
                <span className="text-primary font-medium inline-flex items-center gap-1.5 animate-pulse">
                  <Sparkles className="w-4 h-4" />
                  {t.repairing}
                </span>
              ) : (
                <span>{t.repairPrompt}</span>
              )}
            </div>

            <button
              type="button"
              onClick={handleRepair}
              disabled={isRepairing || isRepaired}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all duration-300 cursor-pointer ${
                isRepaired
                  ? 'bg-success/15 text-success border border-success/30'
                  : 'bg-foreground/5 hover:bg-primary/10 text-foreground hover:text-primary border border-border hover:border-primary/30'
              } disabled:cursor-not-allowed`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isRepaired ? '✓ Reliure restaurée' : t.repairBtn}</span>
            </button>
          </div>
        </div>

        {/* 🔍 Barre de Recherche Directe */}
        {showSearch && (
          <form
            onSubmit={handleSearchSubmit}
            className="w-full relative flex items-center shadow-sm rounded-2xl overflow-hidden border border-border bg-card focus-within:border-[#EE4B2B] focus-within:ring-2 focus-within:ring-[#EE4B2B]/20 transition-all duration-200"
          >
            <div className="pl-4 text-muted-foreground pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full py-3.5 pl-3 pr-28 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            <button
              type="submit"
              className="absolute right-2 px-4 py-2 rounded-xl bg-[#EE4B2B] hover:bg-[#d63f20] text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer"
            >
              {t.searchBtn}
            </button>
          </form>
        )}

        {/* 🧭 Actions & Navigation de Rebond */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#EE4B2B] hover:bg-[#d63f20] text-white text-sm font-medium shadow-md shadow-[#EE4B2B]/20 hover:shadow-lg hover:shadow-[#EE4B2B]/30 transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4" />
            <span>{t.backHome}</span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/search')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-card hover:bg-accent text-foreground text-sm font-medium border border-border transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>{t.explore}</span>
          </button>

          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground text-sm font-medium transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.goBack}</span>
          </button>
        </div>
      </div>
    </main>
  );
}
