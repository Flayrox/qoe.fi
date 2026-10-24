'use client';

// =====================================================================
// 🧭 exit-interstitial.tsx — Apple-esque External Redirection Interstitial
// =====================================================================
// Design de haute précision inspiré des dialogues macOS/iOS et de l'artisanat
// de Rauno Freiberg (rauno.me).
// Compact, élégant, flou en verre, typographie chirurgicale.
// =====================================================================

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ArrowUpRight, Lock, ArrowLeft } from 'lucide-react';

interface ParsedUrlInfo {
  isValid: boolean;
  hostname: string;
  displayUrl: string;
  isHttps: boolean;
}

export function parseExternalUrl(rawUrl?: string | null): ParsedUrlInfo {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, hostname: '', displayUrl: '', isHttps: false };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isValid: false, hostname: '', displayUrl: '', isHttps: false };
  }

  try {
    const parsed = new URL(trimmed);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp) {
      return { isValid: false, hostname: '', displayUrl: '', isHttps: false };
    }

    return {
      isValid: true,
      hostname: parsed.hostname.replace(/^www\./, ''),
      displayUrl: parsed.href,
      isHttps: parsed.protocol === 'https:',
    };
  } catch {
    return { isValid: false, hostname: '', displayUrl: '', isHttps: false };
  }
}

// ── 1. MODALE IN-SITU STYLE APPLE / MACOS HUD ────────────────────────

export interface ExitInterstitialModalProps {
  isOpen: boolean;
  targetUrl: string | null;
  sourceName?: string;
  onClose: () => void;
}

export function ExitInterstitialModal({
  isOpen,
  targetUrl,
  sourceName,
  onClose,
}: ExitInterstitialModalProps) {
  if (!isOpen || !targetUrl) return null;

  const parsed = parseExternalUrl(targetUrl);
  if (!parsed.isValid) return null;

  const handleProceed = () => {
    window.open(parsed.displayUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      {/* Voile flou en verre liquide sombre */}
      <div
        className="fixed inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Boîtier flottant compact (format HUD Apple / Linear) */}
      <div className="relative w-full max-w-[360px] rounded-2xl bg-card/95 backdrop-blur-2xl border border-border/60 shadow-[0_20px_50px_rgba(0,0,0,0.18)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-5 text-left space-y-3.5 animate-in zoom-in-95 duration-150">
        {/* En-tête horizontal épuré */}
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-muted/60 border border-border/40 text-foreground shrink-0 mt-0.5">
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <h3
              id="exit-modal-title"
              className="text-[13px] font-semibold text-foreground tracking-tight leading-tight truncate"
            >
              Ouvrir {parsed.hostname} ?
            </h3>
            <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2">
              Lien externe vers un site tiers hors de {sourceName || 'cette publication'}.
            </p>
          </div>
        </div>

        {/* Barre d'URL discrète (façon barre d'adresse Safari) */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/40 text-[11px] font-mono text-muted-foreground">
          {parsed.isHttps ? (
            <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
          )}
          <span className="truncate select-all text-foreground/80">{parsed.displayUrl}</span>
        </div>

        {/* Actions ergonomiques Apple : Annuler à gauche, Action à droite */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleProceed}
            className="h-8 px-3.5 rounded-lg text-xs font-medium bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all inline-flex items-center gap-1 shadow-2xs cursor-pointer"
          >
            <span>Ouvrir</span>
            <ArrowUpRight className="w-3 h-3 opacity-70" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 2. CONTEXTE & HOOK POUR USAGE PROGRAMMATIQUE ──────────────────────

interface ExitInterstitialContextValue {
  openExitWarning: (url: string, sourceName?: string) => void;
  closeExitWarning: () => void;
}

const ExitInterstitialContext = createContext<ExitInterstitialContextValue | null>(null);

export function useExitInterstitial() {
  const ctx = useContext(ExitInterstitialContext);
  if (!ctx) {
    return {
      openExitWarning: (url: string) => {
        if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
      },
      closeExitWarning: () => {},
    };
  }
  return ctx;
}

export interface ExitInterstitialProviderProps {
  sourceName?: string;
  children: React.ReactNode;
}

export function ExitInterstitialProvider({
  sourceName: defaultSourceName,
  children,
}: ExitInterstitialProviderProps) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    url: string | null;
    sourceName?: string;
  }>({
    isOpen: false,
    url: null,
    sourceName: defaultSourceName,
  });

  const openExitWarning = useCallback(
    (url: string, sourceName?: string) => {
      setModalState({
        isOpen: true,
        url,
        sourceName: sourceName ?? defaultSourceName,
      });
    },
    [defaultSourceName]
  );

  const closeExitWarning = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const value = useMemo(
    () => ({ openExitWarning, closeExitWarning }),
    [openExitWarning, closeExitWarning]
  );

  return (
    <ExitInterstitialContext.Provider value={value}>
      {children}
      <ExitInterstitialModal
        isOpen={modalState.isOpen}
        targetUrl={modalState.url}
        sourceName={modalState.sourceName}
        onClose={closeExitWarning}
      />
    </ExitInterstitialContext.Provider>
  );
}

// ── 3. INTERCEPTEUR DÉCLARATIF DE CLICS SUR LIENS EXTERNES ───────────

export interface ExternalLinkInterceptorProps {
  sourceName?: string;
  className?: string;
  children: React.ReactNode;
}

export function ExternalLinkInterceptor({
  sourceName,
  className,
  children,
}: ExternalLinkInterceptorProps) {
  const { openExitWarning } = useExitInterstitial();

  const handleClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    // Liens relatifs, ancres locales, protocoles spéciaux : navigation interne immédiate
    if (
      href.startsWith('/') ||
      href.startsWith('#') ||
      href.startsWith('?') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('javascript:')
    ) {
      return;
    }

    try {
      const urlObj = new URL(
        href,
        typeof window !== 'undefined' ? window.location.href : 'http://localhost'
      );
      // Même origine : lien interne
      if (typeof window !== 'undefined' && urlObj.origin === window.location.origin) {
        return;
      }

      // Lien externe authentique : interception et ouverture du dialogue
      e.preventDefault();
      e.stopPropagation();
      openExitWarning(urlObj.href, sourceName);
    } catch {
      // URL malformée : laisser le comportement natif
    }
  };

  return (
    <div onClickCapture={handleClickCapture} className={className}>
      {children}
    </div>
  );
}

// ── 4. CARTE DE SORTIE ÉDITORIALE POUR PAGE STANDALONE (/exit) ───────

export interface ExitCardProps {
  targetUrl?: string | null;
  publicationName?: string;
  onBackUrl?: string;
}

export function ExitCard({ targetUrl, publicationName, onBackUrl = '/' }: ExitCardProps) {
  const parsed = parseExternalUrl(targetUrl);

  return (
    <div className="mx-auto w-full max-w-lg py-16 sm:py-24 select-none text-left">
      <div className="space-y-6">
        {/* Kicker typographique */}
        <div className="flex items-center gap-2 text-[11px] font-mono tracking-widest uppercase text-muted-foreground">
          <ArrowUpRight className="w-3.5 h-3.5 text-foreground" />
          <span>Redirection externe</span>
        </div>

        {/* Titre & Sous-titre éditoriaux */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            {parsed.isValid ? `Ouvrir ${parsed.hostname}` : 'Redirection introuvable'}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-md">
            {publicationName ? (
              <>
                Ce lien vous redirige vers un site tiers hors de{' '}
                <span className="font-medium text-foreground">{publicationName}</span>.
              </>
            ) : (
              'Ce lien ouvre une ressource extérieure.'
            )}
          </p>
        </div>

        {/* Ligne d'URL d'orfèvre */}
        {parsed.isValid ? (
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border/40 flex items-center justify-between gap-3 text-xs font-mono text-foreground select-all">
            <span className="truncate text-foreground/90">{parsed.displayUrl}</span>
            {parsed.isHttps ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 font-sans">
                <Lock className="w-3 h-3" /> Chiffré
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground shrink-0 font-sans">
                Non chiffré
              </span>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-muted/20 border border-border/40 text-xs text-muted-foreground">
            L’adresse fournie est incomplète ou utilise un protocole non reconnu.
          </div>
        )}

        {/* Actions horizontales Apple */}
        <div className="flex items-center gap-3 pt-2">
          {parsed.isValid && (
            <a
              href={parsed.displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl text-xs font-medium bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all shadow-2xs"
            >
              <span>Continuer vers le site</span>
              <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}

          <a
            href={onBackUrl}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retourner</span>
          </a>
        </div>
      </div>
    </div>
  );
}
