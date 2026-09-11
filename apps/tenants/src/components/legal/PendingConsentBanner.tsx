'use client';

// =====================================================================
// ⚖️ PendingConsentBanner — consentements légaux manquants
// =====================================================================
// Une nouvelle version d'un document « à accepter » redéclenche le
// consentement : le lecteur connecté voit ici exactement ce qu'il doit
// accepter, et chaque acceptation crée une preuve (version + date + IP).
// =====================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { recordLegalConsentAction } from '@qoe/sdk/actions/legal';

export interface PendingConsentItem {
  slug: string;
  title: string;
  version: string;
}

interface PendingConsentBannerProps {
  pending: PendingConsentItem[];
  locale: string;
}

export function PendingConsentBanner({ pending, locale }: PendingConsentBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string[]>([]);

  const remaining = pending.filter((item) => !accepted.includes(item.slug));
  if (remaining.length === 0) return null;

  function acceptAll() {
    setError(null);
    startTransition(async () => {
      const results = await Promise.all(
        remaining.map((item) =>
          recordLegalConsentAction({
            slug: item.slug,
            locale,
            source: 'tenant',
            method: 'banner',
          })
        )
      );
      const failure = results.find((result) => !result.success);
      if (failure) {
        setError(failure.error ?? 'Consentement non enregistré');
        return;
      }
      setAccepted((previous) => [...previous, ...remaining.map((item) => item.slug)]);
      router.refresh();
    });
  }

  return (
    <div className="mt-10 rounded-2xl border border-[var(--tenant-accent)]/30 bg-[var(--tenant-accent)]/5 p-5">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--tenant-accent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Mise à jour des conditions</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {remaining.length === 1
              ? 'Un document doit être accepté pour continuer à utiliser le service.'
              : `${remaining.length} documents doivent être acceptés pour continuer à utiliser le service.`}
          </p>

          <ul className="mt-3 space-y-1.5">
            {remaining.map((item) => (
              <li key={item.slug} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                <Link href={`/legal/${item.slug}`} className="underline">
                  {item.title}
                </Link>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  v{item.version}
                </span>
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            onClick={acceptAll}
            disabled={isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            J&apos;accepte {remaining.length === 1 ? 'ce document' : 'ces documents'}
          </button>
        </div>
      </div>
    </div>
  );
}
