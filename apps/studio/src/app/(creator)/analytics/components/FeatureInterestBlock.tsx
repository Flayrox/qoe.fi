'use client';

// =====================================================================
// 📡 FeatureInterestBlock — intérêt pour les fonctionnalités à venir
// =====================================================================
// Compte, pour l'espace actif (créateur ou média), les ouvertures
// d'annonces et les demandes de mise en service émises depuis
// l'interstitiel @qoe/ui. Aucune donnée nominative : uniquement des
// agrégats par fonctionnalité sur 90 jours.
// =====================================================================

import React from 'react';
import { ArrowUpRight, Inbox } from 'lucide-react';
import {
  DEFAULT_FEATURE_LOCALE,
  UpcomingBadge,
  getFeature,
  isFeatureKey,
  localize,
  useFeatureAnnouncement,
  type FeatureLocale,
} from '@qoe/ui';
import type { FeatureSignalSummary } from '@/features/upcoming/actions';

export function FeatureInterestBlock({
  signals = [],
  locale = DEFAULT_FEATURE_LOCALE,
}: {
  signals?: FeatureSignalSummary[];
  /** Locale résolue côté serveur (une seule source : le layout studio). */
  locale?: FeatureLocale;
}) {
  const announcement = useFeatureAnnouncement();
  const t = (fr: string, en: string) => (locale === 'en' ? en : fr);

  return (
    <div className="rounded-xl border border-border/30 bg-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight">
            {t('Fonctionnalités à venir', 'Upcoming features')}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              'Annonces consultées et demandes de mise en service, sur 90 jours.',
              'Announcements viewed and activation requests, over 90 days.'
            )}
          </p>
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-border/50 px-3.5 py-3 text-xs text-muted-foreground">
          <Inbox className="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />
          <span>
            {t(
              'Aucune fonctionnalité à venir consultée pour le moment.',
              'No upcoming feature viewed yet.'
            )}
          </span>
        </div>
      ) : (
        <ul className="divide-y divide-border/30">
          {signals.map((signal) => {
            const knownKey = isFeatureKey(signal.feature) ? signal.feature : null;
            const feature = knownKey ? getFeature(knownKey) : undefined;
            const title = feature ? localize(feature.copy.title, locale) : signal.feature;
            return (
              <li
                key={signal.feature}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {knownKey ? <UpcomingBadge feature={knownKey} locale={locale} /> : null}
                    <span className="text-xs font-medium text-foreground truncate">{title}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {signal.views} {t('vues', 'views')}
                  </span>
                  <span className="text-[11px] font-semibold text-foreground tabular-nums">
                    {signal.notifies} {t('demandes', 'requests')}
                  </span>
                  {knownKey ? (
                    <button
                      type="button"
                      onClick={() => announcement.open(knownKey)}
                      aria-label={t('Revoir l’annonce', 'Review the announcement')}
                      className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
