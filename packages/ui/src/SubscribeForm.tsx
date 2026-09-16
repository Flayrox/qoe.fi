'use client';

import { useState, useEffect, useRef } from 'react';
import { t } from '@lingui/core/macro';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import { createClient } from '@qoe/supabase/client';
import { Check, ChevronDown, Loader2, Mail } from 'lucide-react';
import { RecommendationModal, type RecommendedPublication } from './RecommendationModal';

interface SubscribeFormProps {
  publicationId: string;
  isBrutalist?: boolean;
  authorName?: string;
  recommendations?: RecommendedPublication[];
  userEmail?: string | null;
  className?: string;
}

export function SubscribeForm({
  publicationId,
  isBrutalist,
  authorName,
  recommendations = [],
  userEmail,
  className = '',
}: SubscribeFormProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [showModal, setShowModal] = useState(false);

  // Substack 1-Click State
  const [connectedEmail, setConnectedEmail] = useState<string | null>(userEmail ?? null);
  const [isOtherEmailMode, setIsOtherEmailMode] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    if (!email || !email.includes('@')) return;

    setStatus('loading');
    setMessage('');
    setSubmittedEmail(email);

    const res = await subscribeToNewsletterAction({ email, publicationId });

    if (res.ok) {
      setStatus('success');
      setMessage(
        t`Vous recevrez désormais les prochains écrits directement dans votre boîte mail.`
      );
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
          <h4 className="text-lg font-bold text-success mb-1">{t`Vous êtes sur la liste !`}</h4>
          <p className="text-sm text-muted-foreground">{message}</p>
          <button
            type="button"
            onClick={() => {
              setStatus('idle');
              setIsOtherEmailMode(true);
            }}
            className="mt-4 text-xs font-semibold text-[var(--tenant-accent)] hover:underline cursor-pointer"
          >
            {t`S'abonner avec une autre adresse`}
          </button>
        </div>
      </div>
    );
  }

  // 1-Click Substack Mode for connected Qoe.fi user
  const isOneClickMode = Boolean(connectedEmail && !isOtherEmailMode);

  return (
    <div className={`w-full max-w-md mx-auto ${className}`}>
      {isOneClickMode ? (
        <div className="relative" ref={dropdownRef}>
          <div
            className={`flex items-stretch overflow-hidden transition-all ${
              isBrutalist
                ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-background'
                : 'rounded-xl shadow-sm border border-border/60'
            }`}
          >
            {/* Primary 1-Click Subscribe Action */}
            <button
              type="button"
              disabled={status === 'loading'}
              onClick={() => void executeSubscribe(connectedEmail!)}
              className={`flex-1 h-13 px-5 font-semibold text-white text-base transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 ${
                isBrutalist ? 'uppercase tracking-wider hover:opacity-95' : 'hover:opacity-95'
              }`}
              style={{ backgroundColor: 'var(--tenant-accent, #000000)' }}
              title={t`S'abonner immédiatement avec ${connectedEmail || ''}`}
            >
              {status === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Mail className="w-4 h-4 shrink-0 opacity-85" />
                  <span className="truncate">
                    {t`S'abonner avec`}{' '}
                    <span className="font-bold underline decoration-white/40 underline-offset-2">
                      {connectedEmail}
                    </span>
                  </span>
                </>
              )}
            </button>

            {/* Substack-Style Chevron Dropdown Trigger */}
            <button
              type="button"
              disabled={status === 'loading'}
              onClick={() => setIsDropdownOpen((prev) => !prev)}
              className="px-3 border-l border-white/20 text-white flex items-center justify-center transition-colors hover:bg-black/10 cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--tenant-accent, #000000)' }}
              title={t`Plus d'options d'inscription`}
              aria-label={t`Options d'inscription`}
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-full sm:w-72 bg-popover text-popover-foreground border border-border/60 rounded-xl shadow-xl p-1.5 z-50 text-left">
              <button
                type="button"
                onClick={() => {
                  setIsDropdownOpen(false);
                  void executeSubscribe(connectedEmail!);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg hover:bg-muted/70 transition-colors text-foreground cursor-pointer"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-semibold">{t`Utiliser mon compte Qoe.fi`}</span>
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
      ) : (
        /* Standard / Other Email Input Mode */
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <input type="hidden" name="publicationId" value={publicationId} />
            <input
              type="email"
              name="email"
              required
              autoFocus={isOtherEmailMode}
              placeholder={t`Votre adresse email`}
              className={`flex-1 h-13 px-4 text-base ${
                isBrutalist
                  ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] bg-background text-foreground placeholder:text-muted-foreground'
                  : 'rounded-xl border border-input bg-background focus:ring-2 focus:ring-[var(--tenant-accent)] focus:border-transparent outline-none transition-all'
              }`}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className={`h-13 px-7 font-semibold text-white text-base transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 ${
                isBrutalist
                  ? 'border-2 border-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] uppercase tracking-wider hover:opacity-95'
                  : 'rounded-xl hover:opacity-95'
              }`}
              style={{ backgroundColor: 'var(--tenant-accent, #000000)' }}
            >
              {status === 'loading' ? <Loader2 className="w-5 h-5 animate-spin" /> : t`S'abonner`}
            </button>
          </div>

          {connectedEmail && (
            <button
              type="button"
              onClick={() => setIsOtherEmailMode(false)}
              className="self-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-1 cursor-pointer"
            >
              {t`Revenir à mon compte Qoe.fi (${connectedEmail})`}
            </button>
          )}
        </form>
      )}

      {status === 'error' && <p className="mt-3 text-sm text-destructive text-center">{message}</p>}
    </div>
  );
}
