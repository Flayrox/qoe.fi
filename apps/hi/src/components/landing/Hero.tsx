'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  motion,
  AnimatePresence,
  animate,
  useAnimationFrame,
  useScroll,
  useTransform,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from 'framer-motion';
import { t } from '@lingui/core/macro';
import { LogoSymbol } from '@qoe/ui';
import { useI18n } from '@qoe/i18n';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@qoe/utils';

interface HeroProps {
  config: Record<string, string>;
}

// ─── Reader: 3 articles, rich and diverse ─────────────────────────────────────
type RItem =
  | { type: 'label'; text: string }
  | { type: 'title'; text: string }
  | { type: 'section'; text: string }
  | { type: 'body'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'divider' };

// Contenu de démonstration de l'aperçu lecteur — construit au rendu pour que
// les traductions suivent la langue active (un tableau évalué au module
// resterait figé dans la langue par défaut).
function getReaderItems(): RItem[] {
  return [
    { type: 'label', text: t`Clara Lambert · Essai · 8 min` },
    { type: 'title', text: t`Le silence comme infrastructure` },
    {
      type: 'body',
      text: t`Il y a des architectures invisibles. Non pas des bâtiments, mais des espaces mentaux — des structures que l'on construit délibérément pour penser mieux.`,
    },
    {
      type: 'body',
      text: t`Le silence est l'une d'entre elles. Non pas l'absence de son, mais l'absence de sollicitations qui se déguisent en urgences.`,
    },
    { type: 'quote', text: t`« On ne pense vraiment que dans les intervalles. »` },
    {
      type: 'body',
      text: t`Pendant des siècles, la rareté de l'écrit était une contrainte naturelle. Copier un manuscrit prenait des mois. Lire était un acte rare, presque sacré.`,
    },
    {
      type: 'body',
      text: t`Aujourd'hui, l'abondance est le problème. Nous ne manquons pas d'informations — nous manquons de distance.`,
    },
    { type: 'section', text: t`I. L'anxiété du flux` },
    {
      type: 'body',
      text: t`La vitesse à laquelle le contenu est produit dépasse notre capacité à l'assimiler. Ce qui reste, c'est une anxiété cognitive chronique : le sentiment d'être toujours en retard.`,
    },
    {
      type: 'body',
      text: t`Choisir de lire lentement est un acte politique. C'est refuser l'économie de l'attention telle qu'elle est organisée.`,
    },
    { type: 'quote', text: t`« Lire, c'est résister. »` },
    { type: 'section', text: t`II. Les conditions de la profondeur` },
    {
      type: 'body',
      text: t`Les grandes œuvres ont toutes été écrites dans des conditions que nous qualifierions d'ennuyeuses. Pas de notifications. Pas de flux. Pas de stories.`,
    },
    {
      type: 'body',
      text: t`Proust écrivait dans une chambre capitonnée. Kafka après minuit. Wittgenstein, dans une cabane en Norvège.`,
    },
    { type: 'section', text: t`III. Comment se donner ces conditions` },
    {
      type: 'body',
      text: t`La question n'est pas : comment consommer davantage de contenu de qualité ? La question est : comment me donner les conditions pour qu'un seul texte m'affecte vraiment ?`,
    },
    {
      type: 'quote',
      text: t`« Le silence n'est pas passivité. C'est la condition même de la pensée. »`,
    },
    { type: 'label', text: t`— Fin —` },
    { type: 'divider' },
    { type: 'label', text: t`Julien Roche · Technologie · 5 min` },
    { type: 'title', text: t`Sortir du cloud des géants` },
    {
      type: 'body',
      text: t`L'hébergement de nos médias indépendants ne peut plus reposer sur les serveurs des GAFAM. Ce n'est pas une question technique. C'est une question de souveraineté.`,
    },
    {
      type: 'body',
      text: t`Le Cloud Act américain permet aux autorités des États-Unis d'accéder aux données hébergées par des entreprises américaines, où qu'elles soient dans le monde.`,
    },
    {
      type: 'quote',
      text: t`« La liberté de la presse passe par la liberté de l'infrastructure. »`,
    },
    { type: 'section', text: t`Les alternatives existent` },
    {
      type: 'body',
      text: t`Hetzner, en Allemagne. Scaleway, en France. OVH, à Roubaix. Des datacenters où le droit européen s'applique réellement.`,
    },
    {
      type: 'body',
      text: t`Ce que nous choisissons d'héberger dit ce que nous choisissons de défendre.`,
    },
    { type: 'label', text: t`— Fin —` },
    { type: 'divider' },
    { type: 'label', text: t`Sophie Laurent · Philosophie · 6 min` },
    { type: 'title', text: t`La mémoire contre l'archive` },
    {
      type: 'body',
      text: t`Nous archivons tout. Chaque photo, chaque message, chaque note vocale. Mais archiver n'est pas se souvenir.`,
    },
    {
      type: 'body',
      text: t`La mémoire est active. Elle transforme. Elle reconstruit. Elle donne du sens à ce qu'elle retient en le plaçant dans un récit.`,
    },
    { type: 'quote', text: t`« Une mémoire sans oubli est une prison. »` },
    { type: 'section', text: t`L'archive ne pense pas` },
    {
      type: 'body',
      text: t`L'archive est passive. Elle conserve sans digérer. Elle accumule sans comprendre. Elle est fidèle aux faits, et infidèle à la vie.`,
    },
    {
      type: 'body',
      text: t`En voulant tout garder, nous n'avons peut-être rien retenu. L'oubli sélectif n'est pas une défaillance. C'est une fonction.`,
    },
    { type: 'quote', text: t`« Oublier est une forme de liberté. »` },
    { type: 'label', text: t`— Fin —` },
  ];
}

// ─── Reader scroll — pauses on inactive, resumes from exact position ──────────
function ReaderScroll({ active, items }: { active: boolean; items: RItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useAnimationFrame((_, delta) => {
    if (!containerRef.current || !activeRef.current) return;
    posRef.current += delta * 0.014;
    const half = containerRef.current.scrollHeight / 2;
    if (posRef.current >= half) posRef.current -= half;
    containerRef.current.style.transform = `translateY(-${posRef.current}px)`;
  });

  const doubled = [...items, ...items];
  return (
    <div ref={containerRef} className="will-change-transform">
      {doubled.map((item, i) => {
        if (item.type === 'title')
          return (
            <h2 key={i} className="text-[11px] font-bold text-foreground leading-snug mb-2 mt-1">
              {item.text}
            </h2>
          );
        if (item.type === 'label')
          return (
            <p
              key={i}
              className="text-[8px] text-[#EE4B2B] font-semibold tracking-widest uppercase mb-1.5"
            >
              {item.text}
            </p>
          );
        if (item.type === 'section')
          return (
            <p
              key={i}
              className="text-[8.5px] font-bold text-muted-foreground mt-3 mb-1.5 tracking-wide uppercase"
            >
              {item.text}
            </p>
          );
        if (item.type === 'quote')
          return (
            <blockquote key={i} className="border-l-[1.5px] border-[#EE4B2B] pl-2.5 my-2.5">
              <p className="text-[9px] text-muted-foreground italic leading-relaxed">{item.text}</p>
            </blockquote>
          );
        if (item.type === 'divider') return <div key={i} className="border-t border-border my-4" />;
        return (
          <p key={i} className="text-[9px] text-muted-foreground leading-relaxed mb-1.5">
            {item.text}
          </p>
        );
      })}
    </div>
  );
}

// ─── Typewriter — preserves position on pause ────────────────────────────────
function useTypewriter(text: string, speed = 30, active = true) {
  const [typed, setTyped] = useState('');
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      if (indexRef.current >= text.length) {
        clearInterval(timerRef.current!);
        return;
      }
      indexRef.current++;
      setTyped(text.slice(0, indexRef.current));
    }, speed);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [active]);

  return typed;
}

// ─── Mac dot ─────────────────────────────────────────────────────────────────
function MacDot({
  bg,
  label,
  onClick,
  pulsing,
}: {
  bg: string;
  label: string;
  onClick?: () => void;
  pulsing?: boolean;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={cn(
        'w-3 h-3 rounded-full flex-shrink-0 focus:outline-none hover:brightness-90 transition-all relative',
        pulsing && 'ring-2 ring-offset-1'
      )}
      style={{ background: bg, ...(pulsing ? { ringColor: bg } : {}) }}
    >
      {pulsing && (
        <span
          className="absolute inset-0 rounded-full animate-ping opacity-60"
          style={{ background: bg }}
        />
      )}
    </button>
  );
}

// ─── Logo final : le plateau devenu le logo de l'app ─────────────────────────
// Exactement le logo de la sidebar de core/studio (AppSidebar) : le symbole
// officiel rempli de vermillon, posé sur le fond de page — sa fenêtre est le
// fond qui passe au travers (pas de pastille). Le plateau partageant son ratio
// et son rayon de coin, le dessin remplit exactement sa boîte : aucun réglage
// de taille, donc aucun risque de dérive entre le plateau et le dock.
function BrandLogo({ className }: { className?: string }) {
  return <LogoSymbol className={cn('block', className)} fillColor="#EE4B2B" />;
}

// ─── Géométrie du plateau canonique & du logo ────────────────────────────────
// Le plateau a UNE taille canonique et n'est jamais reflué : il est seulement
// zoomé par homothétie pour tenir dans la fenêtre. C'est la seule façon d'avoir
// le même match avec le logo à toutes les tailles de fenêtre.
//
// Contour officiel du symbole (packages/brand) relevé au point près :
//   contour 215,92 × 132,77 · rayon de coin 12,01 (5,56 % de la largeur)
//    fenêtre 134,22→205,35 × 8,31→123,75 · rayon 8,34
const SYMBOL_RATIO = 216 / 133;
const PLATE_W = 1040; // Réduit pour un cadrage plus élégant et aéré
const PLATE_H = PLATE_W / SYMBOL_RATIO; // ≈ 640,37 px
const PLATE_RADIUS = Math.round((12.01 / 216) * PLATE_W * 10) / 10; // ≈ 57,9 px
const PLATE_RADIUS_REST = 32;
const PLATE_PAD = 12;
const PLATE_GAP = 12;
const PLATE_INNER_W = PLATE_W - 2 * PLATE_PAD; // 1016 px
const PLATE_INNER_H = PLATE_H - 2 * PLATE_PAD; // ≈ 616,37 px

// Positions et largeurs fixes au repos (deux panneaux côte à côte)
const READER_REST_W = 342; // Aligné sur la largeur de la fenêtre du logo
const READER_REST_X = PLATE_W - PLATE_PAD - READER_REST_W; // 686 px

const WRITER_REST_X = PLATE_PAD; // 12 px
const WRITER_REST_W = READER_REST_X - PLATE_GAP - WRITER_REST_X; // 662 px

const PANEL_RADIUS = 22;

// Géométrie de la fenêtre intérieure du symbole (en coordonnées du plateau)
const UNIT = PLATE_W / 216;
const WINDOW_X = 134.22 * UNIT; // ≈ 646,25 px
const WINDOW_Y = 8.31 * UNIT; // ≈ 40,01 px
const WINDOW_W = 71.13 * UNIT; // ≈ 342,48 px
const WINDOW_H = 115.44 * UNIT; // ≈ 555,82 px
const WINDOW_RADIUS = 8.34 * UNIT; // ≈ 40,16 px

// Marge réservée autour du plateau pour le zoom
const FIT_MARGIN_X = 96;
const FIT_MARGIN_Y = 120;
const PLATE_MAX_FIT = 0.9; // Cadrage aéré et contenu au départ

// Logo docké
const MARK_H = 28;
const MARK_W = MARK_H * SYMBOL_RATIO;
const DOCK_TOP = 16;
const WIDE_MIN_W = 768;

function plateFit(vw: number, vh: number) {
  return Math.min(PLATE_MAX_FIT, (vw - FIT_MARGIN_X) / PLATE_W, (vh - FIT_MARGIN_Y) / PLATE_H);
}

const ramp = (v: number, a: number, b: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const span = (v: number, a: number, b: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
const glide = (v: number, a: number, b: number) => ease(span(v, a, b));

// ─── Plateau preview panel ───────────────────────────────────────────────────
interface PlateauProps {
  onClose: (fromElement: DOMRect | null) => void;
  showChrome: boolean;
  config: Record<string, string>;
  locale: string;
  /** Échelle et décalage du plateau à sa taille de logo docké. */
  endScale: number;
  travelY: number;
  /** Progrès de la morphose : il porte toute la chronologie interne. */
  morph: MotionValue<number>;
  /** Zoom qui adapte le plateau canonique à la fenêtre (1 sous md). */
  fit: number;
  isWide: boolean;
}

function PlateauPreview({
  onClose,
  showChrome,
  config,
  locale,
  endScale,
  travelY,
  morph,
  fit,
  isWide,
}: PlateauProps) {
  const [active, setActive] = useState<'writer' | 'reader'>('writer');
  const activeRef = useRef(active);
  activeRef.current = active;

  const isEngagedRef = useRef(false);
  const [isEngaged, setIsEngaged] = useState(false);
  // Mémorise quelle carte était active au moment précis où le scroll s'amorce
  const [scrollOrigin, setScrollOrigin] = useState<'writer' | 'reader'>('writer');

  useMotionValueEvent(morph, 'change', (v) => {
    const engaged = v > 0.005;
    if (engaged !== isEngagedRef.current) {
      isEngagedRef.current = engaged;
      setIsEngaged(engaged);
      if (engaged) {
        setScrollOrigin(activeRef.current);
      }
    }
  });

  // ─── Chronologie continue au scroll ─────────────────────────────────────────
  // Progression de la morphose : UNIQUEMENT au scroll
  const cadranGlide = useTransform(morph, (v) => (isWide ? glide(v, 0.04, 0.88) : 0));

  // Trajectoire de la carte Éditeur si elle morph vers le logo
  const writerX = useTransform(cadranGlide, (g) => lerp(WRITER_REST_X, WINDOW_X, g));
  const writerY = useTransform(cadranGlide, (g) => lerp(PLATE_PAD, WINDOW_Y, g));
  const writerW = useTransform(cadranGlide, (g) => lerp(WRITER_REST_W, WINDOW_W, g));
  const writerH = useTransform(cadranGlide, (g) => lerp(PLATE_INNER_H, WINDOW_H, g));
  const writerR = useTransform(cadranGlide, (g) => lerp(PANEL_RADIUS, WINDOW_RADIUS, g));

  // Trajectoire de la carte Lecteur si elle morph vers le logo
  const readerX = useTransform(cadranGlide, (g) => lerp(READER_REST_X, WINDOW_X, g));
  const readerY = useTransform(cadranGlide, (g) => lerp(PLATE_PAD, WINDOW_Y, g));
  const readerW = useTransform(cadranGlide, (g) => lerp(READER_REST_W, WINDOW_W, g));
  const readerH = useTransform(cadranGlide, (g) => lerp(PLATE_INNER_H, WINDOW_H, g));
  const readerR = useTransform(cadranGlide, (g) => lerp(PANEL_RADIUS, WINDOW_RADIUS, g));

  // Fondu rapide de la carte inactive dès le début du scroll
  const inactiveFade = useTransform(morph, (v) => 1 - ramp(v, 0.01, 0.12));

  // Réduction et élévation du plateau vers le dock
  const shrink = useTransform(morph, (v) => (isWide ? ramp(v, 0.06, 0.94) : 0));
  const boxScale = useTransform(shrink, (v) => lerp(1, endScale, v));
  const boxY = useTransform(shrink, (v) => travelY * v);

  // Coins extérieurs du plateau qui s'ouvrent vers ceux du symbole
  const plateRadius = useTransform(morph, (v) =>
    lerp(PLATE_RADIUS_REST, PLATE_RADIUS, ramp(v, 0.08, 0.85))
  );

  // Barre chrome Mac
  const chromeOpacity = useTransform(morph, (v) => 1 - ramp(v, 0.01, 0.08));

  // Fondu précoce des contenus texte / UI pour laisser place au cadran blanc pur
  const contentFade = useTransform(morph, (v) => 1 - ramp(v, 0.02, 0.18));

  // Le vermillon s'efface en fin de course pour révéler le contour du logo officiel
  const plateOpacity = useTransform(morph, (v) => 1 - ramp(v, 0.88, 0.96));

  // Le cadran blanc devient transparent pour former la fenêtre découpée du logo
  const cadranOpacity = useTransform(morph, (v) => 1 - ramp(v, 0.92, 0.98));

  // Opacité au scroll selon la carte qui a initié la morphose
  const writerScrollOpacity = useTransform(cadranOpacity, (o) =>
    scrollOrigin === 'writer' ? o : 0
  );
  const readerScrollOpacity = useTransform(cadranOpacity, (o) =>
    scrollOrigin === 'reader' ? o : 0
  );

  // Fondu mobile
  const mobileFade = useTransform(morph, (v) => 1 - ramp(v, 0, 0.14));

  const editorTitle =
    config[`hero_editor_title_${locale}`] ||
    config['hero_editor_title'] ||
    t`L'architecture du silence`;
  const editorBody =
    config[`hero_editor_body_${locale}`] ||
    config['hero_editor_body'] ||
    t`Il y a dans le vide une forme d'intelligence que nos écrans ont oubliée. Écrire, c'est d'abord creuser — ôter le superflu jusqu'à ce que la phrase respire d'elle-même, sans soutien artificiel.\n\nLa clarté ne s'impose pas. Elle se révèle, lentement, comme une lumière qui filtre à travers le brouillard de nos pensées accumulées.\n\nLa page blanche n'est pas une menace. C'est une invitation.`;

  const customReaderItemsJson =
    config[`hero_reader_items_${locale}`] || config['hero_reader_items'];
  let readerItems = getReaderItems();
  if (customReaderItemsJson) {
    try {
      const parsed = JSON.parse(customReaderItemsJson);
      if (Array.isArray(parsed)) {
        readerItems = parsed;
      }
    } catch (e) {
      console.error('Failed to parse custom reader items:', e);
    }
  }

  const typedBody = useTypewriter(editorBody, 30, active === 'writer');
  const redDotRef = useRef<HTMLButtonElement>(null);

  const fitBoxStyle = isWide ? { width: PLATE_W * fit, height: PLATE_H * fit } : undefined;
  const plateStyle = isWide
    ? {
        width: PLATE_W,
        height: PLATE_H,
        scale: fit,
        transformOrigin: 'top left' as const,
        borderRadius: plateRadius,
      }
    : undefined;

  return (
    <motion.div
      style={{ scale: boxScale, y: boxY }}
      className={cn(
        'relative flex justify-center',
        isWide ? 'w-full' : 'w-full max-w-[96%] xl:max-w-7xl'
      )}
    >
      <div style={fitBoxStyle}>
        <motion.div
          style={plateStyle}
          className={cn('relative overflow-hidden', !isWide && 'w-full rounded-[36px]')}
        >
          {/* Vermillon du plateau */}
          <motion.div
            style={{ opacity: plateOpacity }}
            className="absolute inset-0 bg-[#EE4B2B] shadow-2xl"
          />

          {/* Logo officiel sous le plateau */}
          <div className="absolute inset-0 z-[5] pointer-events-none" aria-hidden>
            <BrandLogo className="w-full h-full" />
          </div>

          {/* Contenu plateau */}
          <div className="relative z-20 h-full">
            {/* Mac chrome bar */}
            <motion.div style={{ opacity: chromeOpacity }} className="absolute inset-0">
              <motion.div
                animate={{ opacity: showChrome ? 1 : 0, y: showChrome ? 0 : -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="absolute -top-9 left-3 z-30 flex items-center gap-1.5 pointer-events-auto group"
              >
                <MacDot
                  bg="#EE4B2B"
                  label={t`Fermer`}
                  onClick={() => onClose(redDotRef.current?.getBoundingClientRect() ?? null)}
                />
                <MacDot bg="#F5BF4F" label={t`Réduire`} />
                <MacDot bg="#62C554" label={t`Plein écran`} />
                <motion.span
                  animate={{ opacity: showChrome ? 1 : 0 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                  className="ml-2 text-[9px] text-muted-foreground select-none"
                >
                  qoefi — Plateau
                </motion.span>
              </motion.div>
            </motion.div>

            {/* Hidden ref element on red dot position for cursor targeting */}
            <button
              ref={redDotRef}
              data-reddot
              className="absolute -top-9 left-3 w-3 h-3 opacity-0 pointer-events-none"
              aria-hidden
            />

            {/* Disposition canonique desktop : un seul panneau blanc affiché au repos avec fondu propre, morph UNIQUEMENT au scroll */}
            {isWide ? (
              <div className="relative w-full h-full select-none">
                {/* ── ZONE & LIBELLÉ ÉDITEUR (gauche) ── */}
                <div
                  onMouseEnter={() => !isEngaged && setActive('writer')}
                  style={{
                    left: WRITER_REST_X,
                    top: PLATE_PAD,
                    width: WRITER_REST_W,
                    height: PLATE_INNER_H,
                  }}
                  className={cn(
                    'absolute cursor-pointer flex flex-col justify-end p-8 z-10',
                    isEngaged && 'pointer-events-none'
                  )}
                >
                  <div
                    className={cn(
                      'transition-opacity duration-300 ease-out pointer-events-none',
                      !isEngaged && active === 'reader' ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] mb-2">{t`Éditeur`}</p>
                    <h3 className="text-white text-2xl font-bold tracking-tight">{t`Écrire.`}</h3>
                  </div>
                </div>

                {/* ── ZONE & LIBELLÉ LECTEUR (droite) ── */}
                <div
                  onMouseEnter={() => !isEngaged && setActive('reader')}
                  style={{
                    left: READER_REST_X,
                    top: PLATE_PAD,
                    width: READER_REST_W,
                    height: PLATE_INNER_H,
                  }}
                  className={cn(
                    'absolute cursor-pointer flex flex-col justify-end p-6 z-10',
                    isEngaged && 'pointer-events-none'
                  )}
                >
                  <div
                    className={cn(
                      'transition-opacity duration-300 ease-out pointer-events-none',
                      !isEngaged && active === 'writer' ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] mb-2">{t`Lecteur`}</p>
                    <h3 className="text-white text-xl font-bold tracking-tight">{t`Lire.`}</h3>
                  </div>
                </div>

                {/* ── CARTE ÉDITEUR (blanche) ── */}
                <motion.div
                  onMouseEnter={() => !isEngaged && setActive('writer')}
                  style={{
                    position: 'absolute',
                    left: isEngaged && scrollOrigin === 'writer' ? writerX : WRITER_REST_X,
                    top: isEngaged && scrollOrigin === 'writer' ? writerY : PLATE_PAD,
                    width: isEngaged && scrollOrigin === 'writer' ? writerW : WRITER_REST_W,
                    height: isEngaged && scrollOrigin === 'writer' ? writerH : PLATE_INNER_H,
                    borderRadius: isEngaged && scrollOrigin === 'writer' ? writerR : PANEL_RADIUS,
                    opacity: isEngaged ? writerScrollOpacity : active === 'writer' ? 1 : 0,
                  }}
                  className={cn(
                    'bg-white overflow-hidden shadow-xl z-20',
                    !isEngaged && 'transition-opacity duration-300 ease-out cursor-pointer',
                    isEngaged && 'pointer-events-none'
                  )}
                >
                  <motion.div
                    style={{ opacity: scrollOrigin === 'writer' ? contentFade : 1 }}
                    className="w-full h-full flex flex-col"
                  >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />
                        <span className="text-[10px] text-muted-foreground">
                          {t`Brouillon · Auto-sauvegardé`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground">
                          {t`${typedBody.split(' ').filter(Boolean).length.toString()} mots`}
                        </span>
                        <Link
                          href="/login"
                          className="inline-flex items-center gap-1 bg-[#EE4B2B] hover:bg-[#d63d20] text-white text-[10px] font-semibold px-3 py-1.5 rounded-md transition-colors"
                        >
                          {t`Publier`} <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden px-8 md:px-12 py-7 flex flex-col gap-4">
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="self-start flex items-center gap-px bg-foreground text-background rounded-md px-1 py-1 shadow-lg"
                      >
                        {['B', 'I', 'H1', '→'].map((l) => (
                          <span
                            key={l}
                            className="text-[10px] font-medium px-2 py-0.5 rounded hover:bg-foreground/80 cursor-pointer transition-colors"
                          >
                            {l}
                          </span>
                        ))}
                      </motion.div>
                      <h1 className="text-xl md:text-2xl font-bold text-foreground leading-tight tracking-tight mt-1">
                        {editorTitle}
                      </h1>
                      <p className="text-xs md:text-sm text-muted-foreground leading-relaxed min-h-[5rem] max-w-xl whitespace-pre-line">
                        {typedBody}
                        <span className="inline-block w-[2px] h-[1em] bg-[#EE4B2B] align-middle ml-0.5 animate-pulse" />
                      </p>
                    </div>
                  </motion.div>
                </motion.div>

                {/* ── CARTE LECTEUR (blanche) ── */}
                <motion.div
                  onMouseEnter={() => !isEngaged && setActive('reader')}
                  style={{
                    position: 'absolute',
                    left: isEngaged && scrollOrigin === 'reader' ? readerX : READER_REST_X,
                    top: isEngaged && scrollOrigin === 'reader' ? readerY : PLATE_PAD,
                    width: isEngaged && scrollOrigin === 'reader' ? readerW : READER_REST_W,
                    height: isEngaged && scrollOrigin === 'reader' ? readerH : PLATE_INNER_H,
                    borderRadius: isEngaged && scrollOrigin === 'reader' ? readerR : PANEL_RADIUS,
                    opacity: isEngaged ? readerScrollOpacity : active === 'reader' ? 1 : 0,
                  }}
                  className={cn(
                    'bg-white overflow-hidden shadow-xl z-20',
                    !isEngaged && 'transition-opacity duration-300 ease-out cursor-pointer',
                    isEngaged && 'pointer-events-none'
                  )}
                >
                  <motion.div
                    style={{ opacity: scrollOrigin === 'reader' ? contentFade : 1 }}
                    className="w-full h-full flex flex-col"
                  >
                    <div className="px-5 pt-4 pb-3 border-b border-border shrink-0">
                      <p className="text-[9px] text-[#EE4B2B] font-semibold tracking-widest uppercase">
                        {t`qoefi — Lecture`}
                      </p>
                    </div>
                    <div className="relative flex-1 overflow-hidden">
                      <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
                      <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />
                      <div className="absolute inset-0 px-5 py-4 overflow-hidden">
                        <ReaderScroll active={active === 'reader'} items={readerItems} />
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              </div>
            ) : (
              /* Mobile layout */
              <motion.div
                style={{ opacity: mobileFade }}
                className="w-full h-full rounded-[36px] flex flex-col overflow-hidden p-2 gap-2"
              >
                <div className="relative rounded-[28px] overflow-hidden min-h-[320px] bg-white flex flex-col">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                    <span className="text-[10px] text-muted-foreground">{t`Brouillon`}</span>
                    <Link
                      href="/login"
                      className="bg-[#EE4B2B] text-white text-[10px] font-semibold px-2.5 py-1 rounded-md"
                    >
                      {t`Publier`}
                    </Link>
                  </div>
                  <div className="p-4 flex-1">
                    <h1 className="text-xl font-bold text-foreground mb-2">{editorTitle}</h1>
                    <p className="text-xs text-muted-foreground line-clamp-6">{editorBody}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export const Hero = ({ config }: HeroProps) => {
  const i18n = useI18n();
  const locale = i18n.getLanguage() || 'fr';
  const [closed, setClosed] = useState(false);
  const [showChrome, setShowChrome] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const closedRef = useRef(false);
  const genieTargetRef = useRef<{ x: number; y: number } | null>(null);
  const reduceMotion = useReducedMotion();

  // ── Fenêtre ──
  const [viewport, setViewport] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    const measure = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Scène sticky en 2 phases (240vh) ──
  // Phase 1 : le plateau voyage de bas (55 % visible) vers le haut perché
  // (45 % visible) SANS morphose. Phase 2 : la morphose vers le logo
  // s'enclenche seulement une fois le plateau perché en haut.
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end end'] });
  const PARK_END = 0.42; // fin du voyage, début de la morphose
  const MORPH_END = 0.88; // fin de la morphose
  const rawMorph = useTransform(scrollYProgress, [PARK_END, MORPH_END], [0, 1]);
  const morph = useTransform(rawMorph, (v) => (reduceMotion ? 0 : v));

  const isWide = viewport.w >= WIDE_MIN_W;
  const fit = isWide ? plateFit(viewport.w, viewport.h) : 1;
  const canMorph = !reduceMotion && isWide;

  const displayedW = PLATE_W * fit;
  const endScale = MARK_W / displayedW;
  const travelY = DOCK_TOP + MARK_H / 2 - viewport.h / 2;

  // ── Voyage vertical : bas coupé (55 % visible) → perché à hauteur du dock ──
  // Phase 1 suit le scroll (manipulation directe). À partir du perchoir,
  // l'extérieur reste ÉPINGLÉ : c'est la morphose interne, avec sa propre
  // courbe `shrink`, qui emmène le plateau jusqu'au dock. Position et échelle
  // partagent le même easing → trajectoire strictement monotone, aucun creux,
  // aucune disparition/retour.
  const displayedH = isWide ? PLATE_H * fit : Math.min(viewport.h * 0.7, 560);
  // Départ : haut du plateau à vh - 0.55*H (bas coupé sous le fold).
  const initialDrop = reduceMotion ? 0 : Math.max(0, viewport.h / 2 - displayedH * 0.05);
  // Perché : EXACTEMENT à hauteur du dock (travelY) — le bas du plateau
  // dépasse à ~55 % en haut. Ça rend la phase 2 un shrink pur, sans aucune
  // translation : un perchoir plus haut (ex. 45 % visible) forçait une
  // redescente de ~60 px au déclenchement de la morphose (le micro-saut
  // visible quand le hint disparaît).
  const topPark = reduceMotion ? 0 : travelY;
  // Desktop (morphose) : on reste épinglé au perchoir après la phase 1.
  const riseHoldY = useTransform(scrollYProgress, [0, PARK_END], [initialDrop, topPark]);
  // Mobile / sans morphose : simple remontée vers le centre, puis maintien.
  const riseCenterY = useTransform(scrollYProgress, [0, 0.3], [initialDrop, 0]);
  const riseY = canMorph ? riseHoldY : riseCenterY;
  // Course interne : du perchoir jusqu'au dock (le handoff reste exact :
  // topPark + morphTravel === travelY).
  const morphTravel = travelY - topPark;

  const boxOpacitySwap = useTransform(scrollYProgress, (v) => (v >= 0.995 ? 0 : 1));
  const dockOpacitySwap = useTransform(scrollYProgress, (v) => (v >= 0.995 ? 1 : 0));
  const boxOpacityFade = useTransform(scrollYProgress, [0.94, 1], [1, 0]);
  const dockOpacityFade = useTransform(scrollYProgress, [0.94, 1], [0, 1]);
  const boxOpacity = canMorph ? boxOpacitySwap : boxOpacityFade;
  const dockOpacity = canMorph ? dockOpacitySwap : dockOpacityFade;
  const [morphed, setMorphed] = useState(false);
  const [dockActive, setDockActive] = useState(false);
  useMotionValueEvent(morph, 'change', (v) => setMorphed(v > 0.04));
  useMotionValueEvent(scrollYProgress, 'change', (v) => setDockActive(v > 0.94));

  // Main close handler — fly-to-logo genie effect (manuel uniquement : le
  // plateau ne disparaît plus au scroll, il reste visible en permanence).
  const handleClose = useCallback(() => {
    closedRef.current = true;
    // Get logo position for the fly-to-logo target
    const logo = document.querySelector('[data-logo]');
    if (logo) {
      const lr = logo.getBoundingClientRect();
      genieTargetRef.current = { x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 };
    }
    setClosed(true);
    document.body.classList.add('hero-closed');
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <>
      {/* Logo docké : strictement identique à la boîte morphée finale
          (même vermillon, même taille, même marque) → handoff invisible. */}
      {!closed && (
        <motion.button
          data-logo
          type="button"
          onClick={scrollToTop}
          aria-label="qoefi — retour en haut"
          style={{ opacity: dockOpacity, x: '-50%' }}
          className={cn(
            'fixed left-1/2 top-0 z-[100] flex items-center justify-center bg-transparent',
            dockActive ? 'cursor-pointer' : 'pointer-events-none'
          )}
        >
          <span
            className="flex items-center justify-center"
            style={{ width: MARK_W, height: MARK_H, marginTop: DOCK_TOP }}
          >
            <BrandLogo className="w-full h-full" />
          </span>
        </motion.button>
      )}

      {/* Scène sticky : le plateau reste centré pendant la morphose (240vh
          de scroll), puis le SVG docké prend le relais exact. */}
      <section
        ref={heroRef}
        onMouseEnter={() => !closed && setShowChrome(true)}
        onMouseLeave={() => !closed && setShowChrome(false)}
        className={cn(
          'relative flex flex-col items-center bg-background transition-all duration-700 overflow-visible',
          closed ? 'min-h-0 py-0' : canMorph ? 'h-[240vh] px-4' : 'h-[160vh] px-4'
        )}
      >
        {!closed && (
          <>
            {/* Fond Sahara : ancré en haut de la section (h-screen), il défile
                vers le haut avec la page au lieu de rester figé pendant le
                sticky. Le plateau, lui, reste sticky pour sa morphose. */}
            <div
              aria-hidden
              className="absolute top-0 h-screen inset-x-0 z-0 pointer-events-none select-none overflow-hidden"
            >
              <img src="/sahara.jpeg" alt="" className="w-full h-full object-cover object-center" />
              {/* Voile orange subtil pour incorporer l'image à la charte */}
              <div className="absolute inset-0 bg-[#F97316]/20 mix-blend-multiply" />
              {/* Léger dégradé neutre + orange pour la lisibilité */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-[#F97316]/10 to-transparent" />
            </div>
            <div className="sticky top-0 h-screen w-full flex flex-col items-center justify-center overflow-hidden">
              <AnimatePresence>
                <motion.div
                  key="plateau"
                  className="relative z-10 w-full flex items-center justify-center will-change-transform"
                  style={{ opacity: boxOpacity, y: riseY }}
                  exit={
                    genieTargetRef.current
                      ? {
                          opacity: 0,
                          scale: 0.05,
                          x: genieTargetRef.current.x - window.innerWidth / 2,
                          y: genieTargetRef.current.y - window.innerHeight / 2,
                          borderRadius: '50%',
                        }
                      : { opacity: 0, scale: 0.96, y: -24 }
                  }
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PlateauPreview
                    onClose={handleClose}
                    showChrome={showChrome}
                    config={config}
                    locale={locale}
                    endScale={endScale}
                    travelY={canMorph ? morphTravel : travelY}
                    morph={morph}
                    fit={fit}
                    isWide={isWide}
                  />
                </motion.div>
              </AnimatePresence>

              {/* Scroll hint */}
              <AnimatePresence>
                {showChrome && !morphed && (
                  <motion.div
                    key="hint"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className="relative z-10 absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] text-muted-foreground select-none pointer-events-none"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B]" />
                    {t`Cliquez × pour découvrir les publications`}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </section>
    </>
  );
};
