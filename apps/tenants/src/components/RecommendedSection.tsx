'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { subscribeToNewsletterAction } from '@qoe/sdk/actions/tenant';
import { Check, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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
    <section className="w-full my-16 py-12 border-y border-border/40 bg-muted/20">
      <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 text-[var(--tenant-accent,hsl(var(--primary)))] mb-1.5 font-medium text-xs tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t`Réseau de Recommandations`}</span>
            </div>
            <h3 className="text-2xl font-bold tracking-tight">
              {authorName
                ? t`Les lectures recommandées par ${authorName}`
                : t`Publications recommandées`}
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {recommendations.map((pub) => {
            const isSubscribed = Boolean(subscribedMap[pub.id]);
            const isLoading = Boolean(loadingMap[pub.id]);
            const avatar = pub.logoUrl || pub.authorAvatarUrl;
            const targetUrl = pub.customDomain
              ? `https://${pub.customDomain}`
              : `http://${pub.subdomain}.qoe.test`;

            return (
              <div
                key={pub.id}
                className="group relative flex flex-col justify-between p-5 rounded-2xl bg-card border border-border hover:border-border/80 transition-all hover:shadow-lg duration-300"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted flex-shrink-0 border border-border/50">
                      {avatar ? (
                        <Image
                          src={avatar}
                          alt={pub.name}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-bold text-lg text-muted-foreground">
                          {pub.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    <Link
                      href={targetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label={`Visiter ${pub.name}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>

                  <Link href={targetUrl} target="_blank" rel="noopener noreferrer">
                    <h4 className="font-semibold text-base tracking-tight hover:text-[var(--tenant-accent)] transition-colors line-clamp-1">
                      {pub.name}
                    </h4>
                  </Link>

                  {pub.authorName && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t`par ${pub.authorName}`}
                    </p>
                  )}

                  {pub.description && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                      {pub.description}
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-4 border-t border-border/40 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {pub.articlesCount > 0 ? t`${pub.articlesCount} écrits` : ''}
                  </span>

                  <button
                    onClick={() => {
                      if (!isSubscribed) setEmailModalPub(pub);
                    }}
                    disabled={isSubscribed || isLoading}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                      isSubscribed
                        ? 'bg-success/10 text-success border border-success/30'
                        : 'bg-foreground text-background hover:opacity-90 active:scale-95'
                    }`}
                  >
                    {isSubscribed ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{t`Abonné`}</span>
                      </>
                    ) : isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>{t`S'abonner`}</span>
                    )}
                  </button>
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
