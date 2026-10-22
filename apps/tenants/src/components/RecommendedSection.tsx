'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import { Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { SafeAvatar } from '@qoe/ui';
import type { RecommendationItem } from '@/lib/tenant-data';

interface RecommendedSectionProps {
  authorName?: string;
  recommendations: RecommendationItem[];
}

export function RecommendedSection({ authorName, recommendations }: RecommendedSectionProps) {
  const [subscribedMap, setSubscribedMap] = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [emailModalPub, setEmailModalPub] = useState<RecommendationItem | null>(null);
  const [emailInput, setEmailInput] = useState('');

  if (!recommendations || recommendations.length === 0) return null;

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailModalPub || !emailInput.trim()) return;

    const pubId = emailModalPub.id;
    setLoadingMap((prev) => ({ ...prev, [pubId]: true }));
    try {
      const res = await subscribeToNewsletterAction({
        email: emailInput.trim(),
        publicationId: pubId,
      });
      if (res.ok) {
        setSubscribedMap((prev) => ({ ...prev, [pubId]: true }));
        setEmailModalPub(null);
        setEmailInput('');
      }
    } finally {
      setLoadingMap((prev) => ({ ...prev, [pubId]: false }));
    }
  };

  return (
    <section className="w-full my-16 border-t border-border/60 pt-10">
      <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
        <div className="mb-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t`Recommandations`}
          </p>
          <h3 className="mt-2 text-xl sm:text-2xl font-semibold tracking-tight">
            {authorName
              ? t`Les lectures recommandées par ${authorName}`
              : t`Publications recommandées`}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
          {recommendations.map((pub) => {
            const isSubscribed = Boolean(subscribedMap[pub.id]);
            const isLoading = Boolean(loadingMap[pub.id]);
            const avatar = pub.logoUrl || pub.authorAvatarUrl;
            const targetUrl = (() => {
              if (pub.customDomain) return `https://${pub.customDomain}`;
              if (!pub.subdomain) return '#';
              if (typeof window !== 'undefined') {
                const host = window.location.hostname;
                if (host.endsWith('lvh.me')) return `http://${pub.subdomain}.lvh.me:15403`;
                if (host.endsWith('localhost')) return `http://${pub.subdomain}.localhost:15403`;
                if (host.endsWith('qoe.test')) return `http://${pub.subdomain}.qoe.test`;
              }
              return `https://${pub.subdomain}.qoe.fi`;
            })();

            return (
              <div key={pub.id} className="flex items-start gap-3 py-1">
                <SafeAvatar
                  src={avatar}
                  name={pub.name}
                  username={pub.subdomain}
                  size={36}
                  shape="circle"
                  className="border border-border/50 shrink-0 mt-0.5"
                />

                <div className="min-w-0 flex-1">
                  <Link href={targetUrl} target="_blank" rel="noopener noreferrer">
                    <h4 className="font-medium text-sm tracking-tight hover:underline underline-offset-4 truncate">
                      {pub.name}
                    </h4>
                  </Link>

                  {pub.authorName && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {t`par ${pub.authorName}`}
                    </p>
                  )}

                  {pub.description && (
                    <p className="text-[11.5px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                      {pub.description}
                    </p>
                  )}

                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    {pub.articlesCount > 0 && <span>{t`${pub.articlesCount} écrits`}</span>}
                    <button
                      onClick={() => {
                        if (!isSubscribed) setEmailModalPub(pub);
                      }}
                      disabled={isSubscribed || isLoading}
                      className="inline-flex items-center gap-1 font-medium text-foreground underline underline-offset-4 decoration-border hover:decoration-foreground transition-colors disabled:opacity-60 cursor-pointer"
                    >
                      {isSubscribed ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>{t`Abonné`}</span>
                        </>
                      ) : isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <span>{t`S'abonner`}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Email Modal for 1-Click Subscription */}
      {emailModalPub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md p-6 bg-background rounded-2xl border border-border shadow-2xl">
            <h4 className="text-lg font-semibold mb-1">{t`S'abonner à ${emailModalPub.name}`}</h4>
            <p className="text-xs text-muted-foreground mb-4">
              {t`Recevez les prochaines parutions directement dans votre boîte mail.`}
            </p>

            <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
              <input
                type="email"
                required
                placeholder={t`Votre adresse email`}
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full h-11 px-4 text-sm rounded-xl border border-input bg-background focus:ring-2 focus:ring-[var(--tenant-accent)] outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setEmailModalPub(null)}
                  className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {t`Annuler`}
                </button>
                <button
                  type="submit"
                  disabled={loadingMap[emailModalPub.id]}
                  className="px-5 py-2 text-xs font-medium rounded-full bg-foreground text-background hover:opacity-90 active:scale-95 disabled:opacity-50"
                >
                  {loadingMap[emailModalPub.id] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    t`Confirmer l'abonnement`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
