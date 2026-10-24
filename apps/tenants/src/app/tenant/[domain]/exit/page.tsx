import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { ShieldAlert, ExternalLink, ArrowLeft, AlertTriangle } from 'lucide-react';

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ url?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;

  return {
    title: `Redirection externe | ${name}`,
    description: `Avertissement de redirection vers un site externe depuis ${name}.`,
    robots: { index: false, follow: false },
  };
}

function parseTargetUrl(rawUrl?: string): {
  isValid: boolean;
  hostname: string | null;
  fullUrl: string | null;
  isSecureProtocol: boolean;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, hostname: null, fullUrl: null, isSecureProtocol: false };
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { isValid: false, hostname: null, fullUrl: null, isSecureProtocol: false };
  }

  try {
    const parsed = new URL(trimmed);
    const isHttp = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (!isHttp) {
      return { isValid: false, hostname: null, fullUrl: null, isSecureProtocol: false };
    }

    return {
      isValid: true,
      hostname: parsed.hostname,
      fullUrl: parsed.href,
      isSecureProtocol: parsed.protocol === 'https:',
    };
  } catch {
    return { isValid: false, hostname: null, fullUrl: null, isSecureProtocol: false };
  }
}

export default async function TenantExitPage({ params, searchParams }: PageProps) {
  const { domain } = await params;
  const { url: rawTargetUrl } = await searchParams;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;
  const publicationName = publication.name || decodedDomain;

  const target = parseTargetUrl(rawTargetUrl);

  return (
    <TenantPageShell
      publication={publication}
      domain={decodedDomain}
      host={host}
      backLabel="Annuler et retourner"
      currentPath="/exit"
    >
      <div className="mx-auto w-full max-w-xl py-6 sm:py-12">
        <div className="rounded-2xl border border-border/60 bg-card p-6 sm:p-8 shadow-xs space-y-6">
          {/* En-tête avec icône de bouclier de sécurité */}
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-warning/10 border border-warning/20 text-warning shrink-0">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div className="space-y-1 min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-warning">
                Avertissement de redirection
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                Vous quittez {publicationName}
              </h1>
            </div>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Le lien sur lequel vous venez de cliquer vous redirige vers un site tiers externe qui
            n’est ni opéré ni vérifié par{' '}
            <span className="font-semibold text-foreground">{publicationName}</span>.
          </p>

          {/* Carte de prévisualisation de la cible */}
          {target.isValid && target.fullUrl ? (
            <div className="p-4 rounded-xl border border-border/50 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-foreground">Site de destination :</span>
                {target.isSecureProtocol ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                    Connexion chiffrée (HTTPS)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning">
                    Non sécurisé (HTTP)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background border border-border/40 font-mono text-xs text-foreground break-all select-all">
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{target.fullUrl}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3.5 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                L’adresse de destination fournie est invalide, incomplète ou utilise un protocole
                non autorisé pour des raisons de sécurité.
              </span>
            </div>
          )}

          {/* Consignes de prudence */}
          <div className="text-xs text-muted-foreground space-y-1.5 border-t border-border/40 pt-4">
            <p className="font-medium text-foreground">Conseil de sécurité :</p>
            <p>
              Vérifiez attentivement l’adresse dans votre navigateur. Ne saisissez jamais vos mots
              de passe ou informations sensibles sur un domaine auquel vous ne faites pas pleinement
              confiance.
            </p>
          </div>

          {/* Actions : Poursuivre vs Annuler */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3 pt-2">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border/60 bg-muted/40 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Retourner sur {publicationName}</span>
            </Link>

            {target.isValid && target.fullUrl && (
              <a
                href={target.fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold transition-all hover:opacity-90 active:scale-95 shadow-xs"
              >
                <span>Poursuivre vers {target.hostname}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </TenantPageShell>
  );
}
