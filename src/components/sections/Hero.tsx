"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimationFrame } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface HeroProps {
  config: Record<string, string>;
}

// ─── Editor content ──────────────────────────────────────────────────────────
const EDITOR_TITLE = "L'architecture du silence";
const EDITOR_BODY = `Il y a dans le vide une forme d'intelligence que nos écrans ont oubliée. Écrire, c'est d'abord creuser — ôter le superflu jusqu'à ce que la phrase respire d'elle-même, sans soutien artificiel.

La clarté ne s'impose pas. Elle se révèle, lentement, comme une lumière qui filtre à travers le brouillard de nos pensées accumulées.

La page blanche n'est pas une menace. C'est une invitation.`;

// ─── Reader: 3 articles, rich and diverse ─────────────────────────────────────
type RItem =
  | { type: "label"; text: string }
  | { type: "title"; text: string }
  | { type: "section"; text: string }
  | { type: "body"; text: string }
  | { type: "quote"; text: string }
  | { type: "divider" };

const READER_ITEMS: RItem[] = [
  { type: "label", text: "Clara Lambert · Essai · 8 min" },
  { type: "title", text: "Le silence comme infrastructure" },
  { type: "body", text: "Il y a des architectures invisibles. Non pas des bâtiments, mais des espaces mentaux — des structures que l'on construit délibérément pour penser mieux." },
  { type: "body", text: "Le silence est l'une d'entre elles. Non pas l'absence de son, mais l'absence de sollicitations qui se déguisent en urgences." },
  { type: "quote", text: "« On ne pense vraiment que dans les intervalles. »" },
  { type: "body", text: "Pendant des siècles, la rareté de l'écrit était une contrainte naturelle. Copier un manuscrit prenait des mois. Lire était un acte rare, presque sacré." },
  { type: "body", text: "Aujourd'hui, l'abondance est le problème. Nous ne manquons pas d'informations — nous manquons de distance." },
  { type: "section", text: "I. L'anxiété du flux" },
  { type: "body", text: "La vitesse à laquelle le contenu est produit dépasse notre capacité à l'assimiler. Ce qui reste, c'est une anxiété cognitive chronique : le sentiment d'être toujours en retard." },
  { type: "body", text: "Choisir de lire lentement est un acte politique. C'est refuser l'économie de l'attention telle qu'elle est organisée." },
  { type: "quote", text: "« Lire, c'est résister. »" },
  { type: "section", text: "II. Les conditions de la profondeur" },
  { type: "body", text: "Les grandes œuvres ont toutes été écrites dans des conditions que nous qualifierions d'ennuyeuses. Pas de notifications. Pas de flux. Pas de stories." },
  { type: "body", text: "Proust écrivait dans une chambre capitonnée. Kafka après minuit. Wittgenstein, dans une cabane en Norvège." },
  { type: "section", text: "III. Comment se donner ces conditions" },
  { type: "body", text: "La question n'est pas : comment consommer davantage de contenu de qualité ? La question est : comment me donner les conditions pour qu'un seul texte m'affecte vraiment ?" },
  { type: "quote", text: "« Le silence n'est pas passivité. C'est la condition même de la pensée. »" },
  { type: "label", text: "— Fin —" },
  { type: "divider" },
  { type: "label", text: "Julien Roche · Technologie · 5 min" },
  { type: "title", text: "Sortir du cloud des géants" },
  { type: "body", text: "L'hébergement de nos médias indépendants ne peut plus reposer sur les serveurs des GAFAM. Ce n'est pas une question technique. C'est une question de souveraineté." },
  { type: "body", text: "Le Cloud Act américain permet aux autorités des États-Unis d'accéder aux données hébergées par des entreprises américaines, où qu'elles soient dans le monde." },
  { type: "quote", text: "« La liberté de la presse passe par la liberté de l'infrastructure. »" },
  { type: "section", text: "Les alternatives existent" },
  { type: "body", text: "Hetzner, en Allemagne. Scaleway, en France. OVH, à Roubaix. Des datacenters où le droit européen s'applique réellement." },
  { type: "body", text: "Ce que nous choisissons d'héberger dit ce que nous choisissons de défendre." },
  { type: "label", text: "— Fin —" },
  { type: "divider" },
  { type: "label", text: "Sophie Laurent · Philosophie · 6 min" },
  { type: "title", text: "La mémoire contre l'archive" },
  { type: "body", text: "Nous archivons tout. Chaque photo, chaque message, chaque note vocale. Mais archiver n'est pas se souvenir." },
  { type: "body", text: "La mémoire est active. Elle transforme. Elle reconstruit. Elle donne du sens à ce qu'elle retient en le plaçant dans un récit." },
  { type: "quote", text: "« Une mémoire sans oubli est une prison. »" },
  { type: "section", text: "L'archive ne pense pas" },
  { type: "body", text: "L'archive est passive. Elle conserve sans digérer. Elle accumule sans comprendre. Elle est fidèle aux faits, et infidèle à la vie." },
  { type: "body", text: "En voulant tout garder, nous n'avons peut-être rien retenu. L'oubli sélectif n'est pas une défaillance. C'est une fonction." },
  { type: "quote", text: "« Oublier est une forme de liberté. »" },
  { type: "label", text: "— Fin —" },
];

// ─── Reader scroll — pauses on inactive, resumes from exact position ──────────
function ReaderScroll({ active }: { active: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const activeRef = useRef(active);

  useEffect(() => { activeRef.current = active; }, [active]);

  useAnimationFrame((_, delta) => {
    if (!containerRef.current || !activeRef.current) return;
    posRef.current += delta * 0.014;
    const half = containerRef.current.scrollHeight / 2;
    if (posRef.current >= half) posRef.current -= half;
    containerRef.current.style.transform = `translateY(-${posRef.current}px)`;
  });

  const doubled = [...READER_ITEMS, ...READER_ITEMS];
  return (
    <div ref={containerRef} className="will-change-transform">
      {doubled.map((item, i) => {
        if (item.type === "title") return <h2 key={i} className="text-[11px] font-bold text-neutral-900 leading-snug mb-2 mt-1">{item.text}</h2>;
        if (item.type === "label") return <p key={i} className="text-[8px] text-[#EE4B2B] font-semibold tracking-widest uppercase mb-1.5">{item.text}</p>;
        if (item.type === "section") return <p key={i} className="text-[8.5px] font-bold text-neutral-600 mt-3 mb-1.5 tracking-wide uppercase">{item.text}</p>;
        if (item.type === "quote") return (
          <blockquote key={i} className="border-l-[1.5px] border-[#EE4B2B] pl-2.5 my-2.5">
            <p className="text-[9px] text-neutral-500 italic leading-relaxed">{item.text}</p>
          </blockquote>
        );
        if (item.type === "divider") return <div key={i} className="border-t border-neutral-100 my-4" />;
        return <p key={i} className="text-[9px] text-neutral-700 leading-relaxed mb-1.5">{item.text}</p>;
      })}
    </div>
  );
}

// ─── Typewriter — preserves position on pause ────────────────────────────────
function useTypewriter(text: string, speed = 30, active = true) {
  const [typed, setTyped] = useState("");
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) { if (timerRef.current) clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(() => {
      if (indexRef.current >= text.length) { clearInterval(timerRef.current!); return; }
      indexRef.current++;
      setTyped(text.slice(0, indexRef.current));
    }, speed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [active]); // eslint-disable-line

  return typed;
}

// ─── Mac dot ─────────────────────────────────────────────────────────────────
function MacDot({ bg, label, onClick, pulsing }: { bg: string; label: string; onClick?: () => void; pulsing?: boolean }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={cn("w-3 h-3 rounded-full flex-shrink-0 focus:outline-none hover:brightness-90 transition-all relative", pulsing && "ring-2 ring-offset-1")}
      style={{ background: bg, ...(pulsing ? { ringColor: bg } : {}) }}
    >
      {pulsing && (
        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: bg }} />
      )}
    </button>
  );
}

// ─── Animated Mac cursor SVG ─────────────────────────────────────────────────
function MacCursor({ visible, targetX, targetY }: { visible: boolean; targetX: number; targetY: number }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed z-[200] pointer-events-none"
          initial={{ x: window.innerWidth / 2, y: window.innerHeight / 2, opacity: 0, scale: 0.6 }}
          animate={{ x: targetX - 6, y: targetY - 4, opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 1L1 21L6.5 15.5L9.5 23L12 22L9 14.5H16.5L1 1Z" fill="white" stroke="#333" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Plateau preview panel ───────────────────────────────────────────────────
interface PlateauProps {
  onClose: (fromElement: DOMRect | null) => void;
  showChrome: boolean;
  autoClickDot: boolean;
}

function PlateauPreview({ onClose, showChrome, autoClickDot }: PlateauProps) {
  const [active, setActive] = useState<"writer" | "reader">("writer");
  const typedBody = useTypewriter(EDITOR_BODY, 30, active === "writer");
  const redDotRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="w-full max-w-[96%] xl:max-w-7xl mx-auto relative">
      {/* Mac chrome bar */}
      <motion.div
        animate={{ opacity: showChrome ? 1 : 0, y: showChrome ? 0 : -6 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="absolute -top-9 left-3 z-30 flex items-center gap-1.5 pointer-events-auto group"
      >
        <MacDot
          bg="#EE4B2B"
          label="Fermer"
          pulsing={autoClickDot}
          onClick={() => onClose(redDotRef.current?.getBoundingClientRect() ?? null)}
        />
        <MacDot bg="#F5BF4F" label="Réduire" />
        <MacDot bg="#62C554" label="Plein écran" />
        <motion.span
          animate={{ opacity: showChrome ? 1 : 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="ml-2 text-[9px] text-neutral-400 select-none"
        >
          qoe.fi — Plateau
        </motion.span>
      </motion.div>

      {/* Hidden ref element on red dot position for cursor targeting */}
      <button ref={redDotRef} className="absolute -top-9 left-3 w-3 h-3 opacity-0 pointer-events-none" aria-hidden />

      {/* Plateau body */}
      <div className="w-full rounded-[36px] bg-[#EE4B2B] flex flex-col md:flex-row overflow-hidden shadow-2xl md:h-[680px] p-2 md:p-3 gap-2 md:gap-3">
        {/* Editor side */}
        <motion.div
          layout
          onMouseEnter={() => setActive("writer")}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{ flexBasis: active === "writer" ? "72%" : "66%", flexShrink: 0 }}
          className="relative rounded-[28px] overflow-hidden md:h-full cursor-pointer min-h-[320px] md:min-h-0"
        >
          <div className={cn("absolute inset-0 transition-opacity duration-400", active === "writer" ? "opacity-100" : "opacity-0 pointer-events-none")}>
            <div className="w-full h-full bg-white rounded-[24px] flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-neutral-400">Brouillon · Auto-sauvegardé</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-neutral-300">{typedBody.split(" ").filter(Boolean).length} mots</span>
                  <Link href="/login" className="inline-flex items-center gap-1 bg-[#EE4B2B] hover:bg-[#d63d20] text-white text-[10px] font-semibold px-3 py-1.5 rounded-md transition-colors">
                    Publier <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
              <div className="flex-1 overflow-hidden px-8 md:px-14 py-8 flex flex-col gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                  className="self-start flex items-center gap-px bg-neutral-900 text-white rounded-md px-1 py-1 shadow-lg"
                >
                  {["B", "I", "H1", "→"].map((l) => (
                    <span key={l} className="text-[10px] font-medium px-2 py-0.5 rounded hover:bg-neutral-700 cursor-pointer transition-colors">{l}</span>
                  ))}
                </motion.div>
                <h1 className="text-2xl md:text-[2rem] font-bold text-neutral-900 leading-tight tracking-tight mt-2">{EDITOR_TITLE}</h1>
                <p className="text-sm md:text-base text-neutral-600 leading-relaxed min-h-[6rem] max-w-2xl whitespace-pre-line">
                  {typedBody}
                  <span className="inline-block w-[2px] h-[1em] bg-[#EE4B2B] align-middle ml-0.5 animate-pulse" />
                </p>
              </div>
            </div>
          </div>
          <div className={cn("absolute inset-0 flex flex-col justify-end p-8 transition-opacity duration-400", active === "writer" ? "opacity-0 pointer-events-none" : "opacity-100")}>
            <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] mb-2">Éditeur</p>
            <h3 className="text-white text-2xl font-bold tracking-tight">Écrire.</h3>
          </div>
        </motion.div>

        {/* Reader side */}
        <motion.div
          layout
          onMouseEnter={() => setActive("reader")}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{ flexBasis: active === "reader" ? "28%" : "22%", flexShrink: 0, flexGrow: 1 }}
          className="relative rounded-[28px] overflow-hidden md:h-full cursor-pointer min-h-[260px] md:min-h-0"
        >
          <div className={cn("absolute inset-0 transition-opacity duration-400", active === "reader" ? "opacity-100" : "opacity-0 pointer-events-none")}>
            <div className="w-full h-full bg-white rounded-[24px] flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-3 border-b border-neutral-100 shrink-0">
                <p className="text-[9px] text-[#EE4B2B] font-semibold tracking-widest uppercase">qoe.fi — Lecture</p>
              </div>
              <div className="relative flex-1 overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-white to-transparent z-10 pointer-events-none" />
                <div className="absolute bottom-0 inset-x-0 h-12 bg-gradient-to-t from-white to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-0 px-5 py-4 overflow-hidden">
                  <ReaderScroll active={active === "reader"} />
                </div>
              </div>
            </div>
          </div>
          <div className={cn("absolute inset-0 flex flex-col justify-end p-6 transition-opacity duration-400", active === "reader" ? "opacity-0 pointer-events-none" : "opacity-100")}>
            <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] mb-2">Lecteur</p>
            <h3 className="text-white text-xl font-bold tracking-tight">Lire.</h3>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Hero section ────────────────────────────────────────────────────────────
export const Hero = ({ config }: HeroProps) => {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const [showChrome, setShowChrome] = useState(false);
  const [autoClosePhase, setAutoClosePhase] = useState<"idle" | "cursor" | "closing">("idle");
  const [cursorTarget, setCursorTarget] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLElement>(null);
  const closedRef = useRef(false);
  const wheelCountRef = useRef(0);
  const genieTargetRef = useRef<{ x: number; y: number } | null>(null);
  // Store ref to logo element for genie-to-logo animation
  const logoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    logoRef.current = document.querySelector("[data-logo]");
  }, []);

  // Main close handler — with optional source rect for genie effect
  const handleClose = useCallback((_fromRect?: DOMRect | null) => {
    closedRef.current = true;
    // Get logo position for the fly-to-logo target
    const logo = document.querySelector("[data-logo]");
    if (logo) {
      const lr = logo.getBoundingClientRect();
      genieTargetRef.current = { x: lr.left + lr.width / 2, y: lr.top + lr.height / 2 };
    }
    setClosed(true);
  }, []);

  // Intercept wheel — auto-close after 5 cumulative wheel events
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (closedRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      setShowChrome(true);
      wheelCountRef.current += 1;

      if (wheelCountRef.current >= 5 && autoClosePhase === "idle") {
        // Get red dot position
        const dot = el.querySelector("[data-reddot]");
        const rect = dot?.getBoundingClientRect();
        if (rect) {
          setCursorTarget({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
        }
        setAutoClosePhase("cursor");

        // After cursor animation arrives → "click"
        setTimeout(() => {
          setAutoClosePhase("closing");
          handleClose();
        }, 1100);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [autoClosePhase, handleClose]);

  return (
    <>
      {/* Auto mac cursor overlay */}
      <MacCursor
        visible={autoClosePhase === "cursor"}
        targetX={cursorTarget.x}
        targetY={cursorTarget.y}
      />

      <section
        ref={heroRef}
        onMouseEnter={() => !closed && setShowChrome(true)}
        onMouseLeave={() => !closed && setShowChrome(false)}
        className={cn(
          "relative flex flex-col items-center bg-background transition-all duration-700 overflow-visible",
          closed ? "min-h-0 py-0" : "min-h-screen justify-center pt-20 pb-12 px-4"
        )}
      >
        <AnimatePresence>
          {!closed && (
            <motion.div
              key="plateau"
              className="w-full flex items-center justify-center"
              exit={
                genieTargetRef.current
                  ? {
                      opacity: 0,
                      scale: 0.05,
                      x: genieTargetRef.current.x - (window.innerWidth / 2),
                      y: genieTargetRef.current.y - (window.innerHeight / 2),
                      borderRadius: "50%",
                    }
                  : { opacity: 0, scale: 0.96, y: -24 }
              }
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Red dot anchor for cursor targeting */}
              <span data-reddot className="absolute -top-9 left-[max(2%,8px)] w-3 h-3 rounded-full pointer-events-none" />
              <PlateauPreview
                onClose={handleClose}
                showChrome={showChrome}
                autoClickDot={autoClosePhase === "cursor"}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scroll hint */}
        <AnimatePresence>
          {showChrome && !closed && autoClosePhase === "idle" && (
            <motion.div
              key="hint"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] text-neutral-400 select-none pointer-events-none"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#EE4B2B]" />
              Cliquez × pour découvrir les publications
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
};
