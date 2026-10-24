'use client';

// =====================================================================
// 🧭 exit-interstitial.tsx — Apple-esque External Redirection Interstitial
// =====================================================================
// Design ultra-minimaliste inspiré des standards d'Apple (Human Interface Guidelines).
// Intercepte de manière fluide et déclarative les liens externes dans les articles,
// les menus, et les bios, sans rompre la position de lecture de l'utilisateur.
// =====================================================================

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Compass, ExternalLink, Lock, ArrowLeft } from 'lucide-react';

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

// ── 1. MODAL APPLE-ESQUE ÉPURÉE ──────────────────────────────────────

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      {/* Arrière-plan flou translucide Apple */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Carte flottante épurée */}
      <div className="relative w-full max-w-sm rounded-3xl bg-card/95 backdrop-blur-2xl border border-border/50 shadow-2xl p-6 sm:p-7 text-center space-y-5 animate-in zoom-in-95 duration-200">
        {/* Icône Boussole discrète dans son squircle monochrome */}
        <div className="mx-auto w-12 h-12 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center text-foreground/80 shadow-2xs">
          <Compass className="w-5 h-5 transition-transform duration-500 hover:rotate-45" />
        </div>

        {/* Typographie de précision */}
        <div className="space-y-1.5">
          <h2
            id="exit-modal-title"
            className="text-base sm:text-lg font-semibold tracking-tight text-foreground"
          >
            Redirection externe
          </h2>
          <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed px-2">
            {sourceName ? (
              <>
                Vous quittez <span className="font-medium text-foreground">{sourceName}</span> vers
                un site tiers indépendant.
              </>
            ) : (
              'Vous vous apprêtez à ouvrir un lien vers un site externe.'
            )}
          </p>
        </div>

        {/* Capsule du nom de domaine */}
        <div className="inline-flex items-center gap-2 max-w-full px-3.5 py-1.5 rounded-full bg-muted/40 border border-border/40 font-mono text-xs text-foreground">
          {parsed.isHttps ? (
            <Lock className="w-3 h-3 text-muted-foreground shrink-0" />
          ) : (
            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
          )}
          <span className="font-semibold truncate">{parsed.hostname}</span>
        </div>

        {/* Boutons style Apple : Pilule contrastée + Annuler discret */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={handleProceed}
            className="w-full inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full text-xs font-semibold bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all shadow-xs cursor-pointer"
          >
            <span>Ouvrir {parsed.hostname}</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-70" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-colors cursor-pointer"
          >
            Annuler
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
    // Repli gracieux si le composant est utilisé sans provider : redirection directe
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

/**
 * Enveloppe un conteneur (ex. corps d'article markdown, flux de pensées, page publique)
 * et intercepte instantanément les clics sur n'importe quel lien externe `<a>`
 * pour déclencher l'interstitiel sans recharger ni perdre la position de lecture.
 */
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

// ── 4. CARTE DE SORTIE POUR PAGE STANDALONE (/exit) ─────────────────

export interface ExitCardProps {
  targetUrl?: string | null;
  publicationName?: string;
  onBackUrl?: string;
}

export function ExitCard({ targetUrl, publicationName, onBackUrl = '/' }: ExitCardProps) {
  const parsed = parseExternalUrl(targetUrl);

  return (
    <div className="mx-auto w-full max-w-md py-12 sm:py-20 select-none">
      <div className="rounded-3xl bg-card/95 backdrop-blur-2xl border border-border/50 shadow-2xl p-7 sm:p-9 text-center space-y-6">
        {/* Icône Boussole discrète */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center text-foreground/80 shadow-2xs">
          <Compass className="w-6 h-6" />
        </div>

        {/* Titre & Sous-titre */}
        <div className="space-y-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Redirection externe
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {publicationName ? (
              <>
                Vous quittez{' '}
                <span className="font-semibold text-foreground">{publicationName}</span> vers une
                ressource extérieure.
              </>
            ) : (
              'Vous vous apprêtez à accéder à un site extérieur.'
            )}
          </p>
        </div>

        {/* Capsule du nom de domaine / URL */}
        {parsed.isValid ? (
          <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/40 space-y-1.5 text-left">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
              <span>Destination</span>
              {parsed.isHttps ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Lock className="w-2.5 h-2.5" /> Chiffré
                </span>
              ) : (
                <span>Non chiffré</span>
              )}
            </div>
            <div className="font-mono text-xs font-semibold text-foreground truncate select-all">
              {parsed.displayUrl}
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-destructive/5 border border-destructive/20 text-xs text-destructive text-left">
            L’adresse fournie est incomplète, absente ou utilise un protocole non reconnu.
          </div>
        )}

        {/* Actions principales Apple */}
        <div className="flex flex-col gap-2.5 pt-2">
          {parsed.isValid && (
            <a
              href={parsed.displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-xs font-semibold bg-foreground text-background hover:opacity-90 active:scale-[0.98] transition-all shadow-xs"
            >
              <span>Continuer vers {parsed.hostname}</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </a>
          )}

          <a
            href={onBackUrl}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Retourner sur {publicationName || 'le site'}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
