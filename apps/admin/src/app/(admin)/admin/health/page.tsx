// =====================================================================
// 🩺 /admin/health — la preuve chiffrée avant d'armer le refus
// =====================================================================
// Deux semaines d'observation doivent produire un chiffre, pas une impression :
// combien de refus OBSERVÉS (donc non appliqués), par capacité, et combien
// d'accords — plus l'état réel de la base et la version de migration APPLIQUÉE
// (une console qui ignore ce que son schéma sait faire ment à moitié).
//
// Si la base est muette, l'écran le dit : c'est exactement le genre de panne
// silencieuse qu'une page de santé existe pour rendre visible.
// =====================================================================

import React from 'react';
import Link from 'next/link';
import { Activity, Database, GitBranch, ShieldCheck, ShieldOff } from 'lucide-react';
import { getAdminIdentity, requireCapability } from '@/lib/admin-identity';
import { getAuthzDecisions } from '@/lib/admin-audit-data';
import { ADMIN_CAPABILITIES } from '@/lib/admin-console';
import { getPlatformHealth } from '@/lib/admin-infra-data';
import { QueuePageHeader } from '@/components/queue/QueuePageHeader';
import { StatusPill } from '@/components/queue/StatusPill';

export const dynamic = 'force-dynamic';

export default async function AdminHealthPage() {
  const identity = await getAdminIdentity();
  requireCapability(identity, 'admin.dashboard.read');

  const [health, decisions, month] = await Promise.all([
    getPlatformHealth(),
    getAuthzDecisions({ window: 24, denied: false, limit: 1 }),
    // Fenêtre large : la question « quelles capacités ne sont JAMAIS exercées »
    // ne se lit pas sur 24 heures.
    getAuthzDecisions({ window: 720, denied: false, limit: 1 }),
  ]);

  const exercised = new Set(month.groups.map((group) => group.capability));
  const neverExercised = ADMIN_CAPABILITIES.filter((capability) => !exercised.has(capability));

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <QueuePageHeader
        icon={<Activity className="w-4 h-4" />}
        title="Santé de la plateforme"
        badge={health?.mode === 'enforce' ? 'refus armé' : 'observation'}
        description={
          <>
            Base, migration appliquée, mode d’autorisation et décisions des 24 dernières heures.
            C’est la lecture qui décide du passage en{' '}
            <span className="font-mono">authz-enforce</span>.{' '}
            <Link href="/admin/access/decisions" className="underline">
              Détail des décisions
            </Link>
            .
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div
          className="rounded-3xl border border-border bg-white p-6 shadow-sm"
          data-testid="health-postgres"
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <Database className="w-3.5 h-3.5" /> Postgres
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {health?.postgres?.ok ? `${health.postgres.latencyMs} ms` : 'indisponible'}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {health?.postgres?.ok
              ? 'La base répond (aller-retour mesuré).'
              : (health?.postgres?.error ?? 'Sonde de base indisponible.')}
          </p>
        </div>

        <div
          className="rounded-3xl border border-border bg-white p-6 shadow-sm"
          data-testid="health-migration"
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            <GitBranch className="w-3.5 h-3.5" /> Migration appliquée
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {health?.migration ? `v${health.migration.applied}` : '—'}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {health?.migration?.error
              ? health.migration.error
              : 'Version réellement appliquée sur cette base (table goose).'}
          </p>
        </div>

        <div
          className="rounded-3xl border border-border bg-white p-6 shadow-sm"
          data-testid="health-mode"
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            {health?.mode === 'enforce' ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <ShieldOff className="w-3.5 h-3.5" />
            )}{' '}
            Autorisation
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {health?.mode === 'enforce' ? 'refus' : 'observation'}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {health?.mode === 'enforce'
              ? 'Une capacité manquante répond 403.'
              : 'Les refus sont journalisés, pas encore appliqués.'}
          </p>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Décisions des dernières 24 h</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Accords
            </div>
            <div className="mt-2 text-3xl font-semibold" data-testid="health-allowed">
              {(health?.decisions.last24h.allowed ?? 0).toLocaleString('fr-FR')}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Refus observés (non appliqués)
            </div>
            <div className="mt-2 text-3xl font-semibold" data-testid="health-denied-observed">
              {(health?.decisions.last24h.deniedObserved ?? 0).toLocaleString('fr-FR')}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Refus appliqués
            </div>
            <div className="mt-2 text-3xl font-semibold" data-testid="health-denied-enforced">
              {(health?.decisions.last24h.deniedEnforced ?? 0).toLocaleString('fr-FR')}
            </div>
          </div>
        </div>

        <div
          className="flex flex-wrap gap-2 text-[11px] text-muted-foreground"
          data-testid="health-recorder"
        >
          <StatusPill tone={(health?.decisions.recorder.dropped ?? 0) > 0 ? 'hot' : 'muted'}>
            journal : {health?.decisions.recorder.written ?? 0} écrites
          </StatusPill>
          <StatusPill tone={(health?.decisions.recorder.dropped ?? 0) > 0 ? 'hot' : 'muted'}>
            {health?.decisions.recorder.dropped ?? 0} perdues
          </StatusPill>
          <StatusPill tone="muted">file : {health?.decisions.recorder.queued ?? 0}</StatusPill>
          <StatusPill tone={decisions.items.length > 0 ? 'hot' : 'muted'}>
            version déployée : {health?.version ?? 'inconnue'}
          </StatusPill>
        </div>
        {(health?.decisions.recorder.dropped ?? 0) > 0 && (
          <p className="text-xs text-foreground">
            Des décisions ont été perdues faute de place dans le journal : la supervision est
            incomplète. Augmenter la capacité d’écriture avant de conclure sur les chiffres.
          </p>
        )}
      </section>

      <section className="space-y-3" data-testid="health-unused-capabilities">
        <h2 className="text-sm font-semibold">
          Capacités jamais exercées (30 jours) — {neverExercised.length}/{ADMIN_CAPABILITIES.length}
        </h2>
        <p className="text-xs text-muted-foreground">
          Une capacité jamais exercée n’est pas un droit inutile : c’est une route que personne
          n’emprunte, ou une capacité que personne ne détient. À vérifier avant de conclure qu’un
          rôle est trop large.
        </p>
        {neverExercised.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {neverExercised.map((capability) => (
              <span
                key={capability}
                className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {capability}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
