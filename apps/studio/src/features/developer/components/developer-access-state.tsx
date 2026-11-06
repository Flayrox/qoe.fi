import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, Clock, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { cn } from '@qoe/utils';
import {
  DEVELOPER_CAPABILITIES,
  hasDeveloperGrant,
  type DeveloperAccess,
  type DeveloperCapabilityKey,
} from '../types';

export const DEVELOPER_ACTION_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90';

const STATUS_COPY: Record<
  DeveloperAccess['status'],
  { title: string; description: string; icon: typeof ShieldCheck }
> = {
  none: {
    title: 'Activez votre accès développeur',
    description:
      'Une demande suffit pour débloquer les clés d’API, les webhooks et les applications OAuth.',
    icon: KeyRound,
  },
  pending: {
    title: 'Votre demande est en cours d’examen',
    description:
      'Le dossier est transmis à l’équipe technique. Aucune action n’est nécessaire pour le moment.',
    icon: Clock,
  },
  approved: {
    title: 'Votre accès développeur est actif',
    description: 'Les permissions accordées sont disponibles dans les espaces ci-dessous.',
    icon: ShieldCheck,
  },
  rejected: {
    title: 'Votre demande a été refusée',
    description: 'Vous pouvez soumettre un nouveau dossier avec un cas d’usage plus détaillé.',
    icon: AlertCircle,
  },
  revoked: {
    title: 'Votre accès a été révoqué',
    description: 'Un administrateur a retiré cet accès. Vous pouvez demander son rétablissement.',
    icon: Lock,
  },
};

function formatAccessDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function accessActionLabel(access: DeveloperAccess): string {
  if (access.status === 'pending') return 'Voir ma demande';
  if (access.status === 'approved') return 'Gérer mes accès';
  if (access.status === 'rejected' || access.status === 'revoked') {
    return 'Soumettre une nouvelle demande';
  }
  return "Demander l'accès";
}

export function DeveloperAccessAction({
  access,
  href = '/developer',
  label,
}: {
  access: DeveloperAccess;
  href?: string;
  label?: string;
}) {
  return (
    <Link href={href} className={DEVELOPER_ACTION_CLASS}>
      {label ?? accessActionLabel(access)}
    </Link>
  );
}

export function DeveloperAccessState({
  access,
  capability,
  title,
  description,
  action,
}: {
  access: DeveloperAccess;
  capability?: DeveloperCapabilityKey;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  const base = STATUS_COPY[access.status];
  const capabilityMeta = capability
    ? DEVELOPER_CAPABILITIES.find((item) => item.key === capability)
    : undefined;
  const capabilityGranted = capability ? hasDeveloperGrant(access, capability) : false;
  const missingCapability = capability && access.status === 'approved' && !capabilityGranted;
  const Icon = missingCapability ? Lock : base.icon;
  const renderedAction = action === undefined ? <DeveloperAccessAction access={access} /> : action;

  const heading =
    title ??
    (missingCapability ? `Permission ${capabilityMeta?.label ?? ''} non accordée` : base.title);
  const body =
    description ??
    (missingCapability
      ? 'Votre accès développeur est actif, mais cette permission précise ne vous a pas encore été accordée.'
      : base.description);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <section className="space-y-4 rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Icon className="size-4" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{heading}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
          </div>
        </div>

        {access.status === 'pending' ? (
          <ol className="grid gap-2 sm:grid-cols-3" aria-label="Progression de la demande">
            {[
              ['Demande envoyée', true],
              ['Examen en cours', true],
              ['Activation', false],
            ].map(([label, complete], index) => (
              <li
                key={String(label)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-[11px]',
                  complete
                    ? 'border-primary/20 bg-primary/5 text-foreground'
                    : 'border-border/60 bg-muted/20 text-muted-foreground'
                )}
              >
                <span className="flex items-center gap-1.5 font-semibold">
                  {complete ? (
                    <Check className="size-3 text-primary" strokeWidth={2.5} />
                  ) : (
                    <span className="size-3 rounded-full border border-border" />
                  )}
                  {index + 1}. {label}
                </span>
              </li>
            ))}
          </ol>
        ) : null}

        {access.reason || access.updatedAt ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
            {access.reason ? (
              <>
                <span className="font-semibold text-foreground">Motif de la demande</span>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed text-muted-foreground">
                  {access.reason}
                </p>
              </>
            ) : null}
            {access.updatedAt ? (
              <p className={cn('text-[11px] text-muted-foreground', access.reason && 'mt-2')}>
                Dernière mise à jour du dossier : {formatAccessDate(access.updatedAt)}
              </p>
            ) : null}
          </div>
        ) : null}

        {renderedAction ? <div className="pt-1">{renderedAction}</div> : null}
      </section>

      <aside className="rounded-xl border border-border/60 bg-muted/10 shadow-2xs">
        <div className="border-b border-border/50 px-3.5 py-3">
          <h3 className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
            Ce que l’accès débloque
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Seules les permissions accordées sont actives.
          </p>
        </div>
        <ul className="divide-y divide-border/40 px-3.5">
          {DEVELOPER_CAPABILITIES.map((item) => {
            const granted = hasDeveloperGrant(access, item.key);
            const statusLabel = granted
              ? 'Accordé'
              : access.status === 'approved'
                ? 'Non accordé'
                : 'À débloquer';

            return (
              <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.description}</p>
                </div>
                <Badge
                  variant="soft"
                  tone={granted ? 'success' : access.status === 'approved' ? 'neutral' : 'vivid'}
                  size="xs"
                >
                  {statusLabel}
                </Badge>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
