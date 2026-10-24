'use client';

import { useState, useEffect, useRef } from 'react';
import { t } from '@lingui/core/macro';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import { createClient } from '@qoe/supabase/client';
import { getMainAppUrl } from '@qoe/config';
import { Check, ChevronDown, Loader2, Mail, Sparkles } from 'lucide-react';
import { RecommendationModal, type RecommendedPublication } from './RecommendationModal';

export interface SubscribeFormProps {
  publicationId: string;
  isBrutalist?: boolean;
  authorName?: string;
  recommendations?: RecommendedPublication[];
  userEmail?: string | null;
  className?: string;
  accentColor?: string;
  placeholder?: string;
  buttonText?: string;
  helperText?: string;
  disabled?: boolean;
  size?: 'default' | 'compact';
}

export function SubscribeForm({
  publicationId,
  isBrutalist,
  authorName,
  recommendations = [],
  userEmail,
  className = '',
  accentColor,
  placeholder,
  buttonText,
  helperText,
  disabled = false,
  size = 'default',
}: SubscribeFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [isDirectActive, setIsDirectActive] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // 1-Click Subscription State
  const [connectedEmail, setConnectedEmail] = useState<string | null>(userEmail ?? null);
  const [isOtherEmailMode, setIsOtherEmailMode] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Client host / current URL for redirecting to Qoefi 1-click
  const [currentHostname, setCurrentHostname] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCurrentHostname(window.location.hostname);
      setCurrentUrl(window.location.href);
    }
  }, []);

  const mainApp = getMainAppUrl(currentHostname || undefined);
  const qoefiSubscribeUrl = `${mainApp}/subscribe-with-qoefi?publication=${encodeURIComponent(
    publicationId
  )}${currentUrl ? `&return=${encodeURIComponent(currentUrl)}` : ''}`;

  // Auto-detect connected user if not passed explicitly as prop
  useEffect(() => {
    if (userEmail !== undefined) {
      setConnectedEmail(userEmail);
      return;
    }

    let isMounted = true;
    try {
      const supabase = createClient();
      supabase.auth
        .getUser()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (!error && data?.user?.email) {
            setConnectedEmail(data.user.email);
          }
        })
        .catch(() => {
          // Client or auth context not available, stay in anonymous mode
        });
    } catch {
      // Ignored in test/offline environments
    }

    return () => {
      isMounted = false;
    };
  }, [userEmail]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  async function executeSubscribe(email: string) {
    if (disabled || !email || !email.includes('@')) return;

    setStatus('loading');
    setMessage('');
    setSubmittedEmail(email);

    const res = await subscribeToNewsletterAction({ email, publicationId });

    if (res.ok) {
      setStatus('success');
      if (res.data?.active) {
        setIsDirectActive(true);
        setMessage(t`Vous êtes désormais abonné à la newsletter !`);
      } else {
        setIsDirectActive(false);
        // Double opt-in (fiche 01) : l'abonnement n'est actif qu'après le clic
        // sur le lien envoyé — ne jamais promettre une réception immédiate.
        setMessage(
          t`Vérifiez votre boîte mail : un lien de confirmation vient de partir. L'abonnement ne sera actif qu'après votre clic.`
        );
      }
      if (recommendations && recommendations.length > 0) {
        setShowModal(true);
      }
    } else {
      setStatus('error');
      setMessage(res.error?.message || t`Une erreur est survenue lors de la souscription.`);
    }
  }

  function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (disabled) return;
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get('email') || '').trim();
    void executeSubscribe(email);
  }

  if (status === 'success') {
    return (
      <div className={`w-full max-w-md mx-auto ${className}`}>
        {recommendations.length > 0 && (
          <RecommendationModal
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            authorName={authorName}
            recommendations={recommendations}
            subscriberEmail={submittedEmail}
          />
        )}
        <div
          className={`p-6 text-center ${
            isBrutalist
              ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-background'
              : 'bg-success/10 border border-success/20 rounded-xl'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto mb-3">
            <Check className="w-5 h-5 stroke-[2.5]" />
          </div>
          <h4 className="text-lg font-bold text-success mb-1">
            {isDirectActive ? t`Abonnement confirmé !` : t`Plus qu'une étape !`}
          </h4>
          <p className="text-sm text-muted-foreground">{message}</p>
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setIsOtherEmailMode(true);
            }}
            className="mt-4 text-xs font-semibold hover:underline cursor-pointer"
            style={accentColor ? { color: accentColor } : undefined}
          >
            {t`S'abonner avec une autre adresse`}
          </button>
        </div>
      </div>
    );
  }

  // 1-Click Subscription Mode for connected Qoefi user
  const isOneClickMode = Boolean(connectedEmail && !isOtherEmailMode);

  return (
    <div className={`w-full max-w-md font-[family:inherit] ${className}`}>
      {isOneClickMode ? (
        <div className="relative" ref={dropdownRef}>
          <div
            className={`flex items-stretch overflow-hidden transition-all ${
              isBrutalist
                ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-background'
                : size === 'compact'
                  ? 'rounded-lg shadow-2xs border border-border/60'
                  : 'rounded-xl shadow-xs border border-border/60'
            }`}
          >
            {/* Primary 1-Click Subscribe Action */}
            <button
              type="button"
              disabled={disabled || status === 'loading'}
              onClick={() => void executeSubscribe(connectedEmail!)}
              className={`flex-1 min-w-0 font-semibold font-[family:inherit] transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 ${
                size === 'compact' ? 'h-10 px-3.5 text-xs' : 'h-13 px-5 text-base'
              } ${
                accentColor
                  ? 'text-white hover:opacity-95'
                  : 'bg-foreground text-background hover:bg-foreground/90 dark:bg-white dark:text-black dark:hover:bg-white/90'
              } ${isBrutalist ? 'uppercase tracking-wider' : ''}`}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
              title={t`S'abonner immédiatement avec ${connectedEmail || ''}`}
            >
              {status === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              ) : (
                <>
                  <Mail className="w-3.5 h-3.5 shrink-0 opacity-85" />
                  <span className="truncate">
                    {t`S'abonner avec`}{' '}
                    <span className="font-bold underline decoration-current/40 underline-offset-2">
                      {connectedEmail}
                    </span>
                  </span>
                </>
              )}
            </button>

            {/* Chevron Dropdown Trigger - explicit width and shrink-0 to remain visible */}
            <button
              type="button"
              disabled={disabled || status === 'loading'}
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className={`shrink-0 w-11 border-l flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 ${
                accentColor
                  ? 'border-white/20 text-white hover:bg-black/10'
                  : 'border-background/20 dark:border-black/20 bg-foreground text-background hover:bg-foreground/90 dark:bg-white dark:text-black dark:hover:bg-white/90'
              }`}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
              title={t`Plus d'options d'inscription`}
              aria-label={t`Options d'inscription`}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {/* Sub-button to easily switch to another email */}
          <div className="flex justify-center mt-2">
            <button
              type="button"
              onClick={() => setIsOtherEmailMode(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer hover:underline"
            >
              {t`Utiliser une autre adresse email`}
            </button>
          </div>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div
              className={`absolute right-0 top-full mt-2 w-full sm:w-72 bg-popover text-popover-foreground border border-border/60 rounded-xl shadow-xl p-1.5 z-50 text-left ${
                isBrutalist
                  ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-background'
                  : ''
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  void executeSubscribe(connectedEmail!);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted/70 transition-colors text-foreground cursor-pointer"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-semibold">{t`Utiliser mon compte Qoefi`}</span>
                  <span className="text-muted-foreground truncate">{connectedEmail}</span>
                </div>
                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
              </button>

              <div className="h-px bg-border/40 my-1" />

              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  setIsOtherEmailMode(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted/70 transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5 shrink-0" />
                <span>{t`S'abonner avec une autre adresse...`}</span>
              </button>
            </div>
          )}
        </div>
      ) : !connectedEmail && !isOtherEmailMode ? (
        /* Guest Mode: 1-Click with Qoefi button + Divider + Standard Email Form */
        <div className="flex flex-col gap-3">
          <a
            href={qoefiSubscribeUrl}
            className={`w-full font-semibold font-[family:inherit] transition-all flex items-center justify-center gap-2.5 cursor-pointer no-underline ${
              size === 'compact' ? 'h-10 px-3.5 text-xs' : 'h-12 px-5 text-sm sm:text-base'
            } ${
              isBrutalist
                ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider bg-background text-foreground hover:bg-muted'
                : accentColor
                  ? 'text-white shadow-xs hover:opacity-95'
                  : 'bg-foreground text-background shadow-xs hover:bg-foreground/90 dark:bg-white dark:text-black dark:hover:bg-white/90 rounded-xl'
            }`}
            style={!isBrutalist && accentColor ? { backgroundColor: accentColor } : undefined}
          >
            <Sparkles className="w-4 h-4 shrink-0 opacity-85" />
            <span>{t`S'abonner en 1 clic avec Qoefi`}</span>
          </a>

          <div className="flex items-center gap-3 my-0.5">
            <div className="flex-1 h-px bg-border/50" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 select-none">
              {t`ou avec votre adresse email`}
            </span>
            <div className="flex-1 h-px bg-border/50" />
          </div>

          <form onSubmit={handleFormSubmit} className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input type="hidden" name="publicationId" value={publicationId} />
              <input
                type="email"
                name="email"
                required
                disabled={disabled || status === 'loading'}
                placeholder={placeholder || t`Votre adresse email`}
                className={`flex-1 text-foreground placeholder:text-muted-foreground/60 outline-none font-[family:inherit] transition-all ${
                  size === 'compact'
                    ? 'h-10 px-3.5 text-sm rounded-lg border border-border bg-background shadow-2xs focus:ring-1 focus:ring-foreground'
                    : isBrutalist
                      ? 'h-13 px-4 text-base border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-background text-foreground'
                      : 'h-13 px-4 text-base rounded-xl border border-input bg-background shadow-xs focus:ring-2 focus:ring-foreground/20'
                }`}
              />
              <button
                type="submit"
                disabled={disabled || status === 'loading'}
                className={`font-semibold font-[family:inherit] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 ${
                  size === 'compact'
                    ? 'h-10 px-4 text-sm rounded-lg shadow-2xs whitespace-nowrap'
                    : isBrutalist
                      ? 'h-13 px-7 text-base border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider'
                      : 'h-13 px-7 text-base rounded-xl shadow-xs'
                } ${
                  accentColor
                    ? 'text-white hover:opacity-95'
                    : 'bg-foreground text-background hover:bg-foreground/90 dark:bg-white dark:text-black dark:hover:bg-white/90'
                }`}
                style={accentColor ? { backgroundColor: accentColor } : undefined}
              >
                {status === 'loading' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  buttonText || t`S'abonner`
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* Explicit Other Email Input Mode for connected user */
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input type="hidden" name="publicationId" value={publicationId} />
            <input
              type="email"
              name="email"
              required
              disabled={disabled || status === 'loading'}
              autoFocus={isOtherEmailMode}
              placeholder={placeholder || t`Votre adresse email`}
              className={`flex-1 text-foreground placeholder:text-muted-foreground/60 outline-none transition-all ${
                size === 'compact'
                  ? 'h-10 px-3.5 text-sm rounded-lg border border-border bg-background shadow-2xs focus:ring-1 focus:ring-foreground'
                  : isBrutalist
                    ? 'h-13 px-4 text-base border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-background text-foreground'
                    : 'h-13 px-4 text-base rounded-xl border border-input bg-background shadow-xs focus:ring-2 focus:ring-foreground/20'
              }`}
            />
            <button
              type="submit"
              disabled={disabled || status === 'loading'}
              className={`font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 ${
                size === 'compact'
                  ? 'h-10 px-4 text-sm rounded-lg shadow-2xs whitespace-nowrap'
                  : isBrutalist
                    ? 'h-13 px-7 text-base border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider'
                    : 'h-13 px-7 text-base rounded-xl shadow-xs'
              } ${
                accentColor
                  ? 'text-white hover:opacity-95'
                  : 'bg-foreground text-background hover:bg-foreground/90 dark:bg-white dark:text-black dark:hover:bg-white/90'
              }`}
              style={accentColor ? { backgroundColor: accentColor } : undefined}
            >
              {status === 'loading' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                buttonText || t`S'abonner`
              )}
            </button>
          </div>

          {connectedEmail && (
            <button
              type="button"
              onClick={() => setIsOtherEmailMode(false)}
              className="self-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 cursor-pointer"
            >
              {t`Revenir à mon compte Qoefi (${connectedEmail})`}
            </button>
          )}
        </form>
      )}

      {helperText && <p className="mt-2 text-[12px] text-muted-foreground/70">{helperText}</p>}

      {status === 'error' && <p className="mt-3 text-sm text-destructive text-center">{message}</p>}
    </div>
  );
}
