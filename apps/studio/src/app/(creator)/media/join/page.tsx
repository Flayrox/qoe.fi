'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users,
  ShieldCheck,
  Clock,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  getMediaInviteLinkPreviewAction,
  joinMediaByLinkAction,
  type MediaInviteLinkPreview,
} from '../actions';
import { SafeAvatar } from '@qoe/ui';
import { cn } from '@qoe/utils';

export default function MediaJoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [preview, setPreview] = useState<MediaInviteLinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [joinSuccess, setJoinSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Aucun jeton d'invitation fourni dans le lien.");
      setLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const res = await getMediaInviteLinkPreviewAction(token);
        if (!isMounted) return;
        if (res.success && res.preview) {
          setPreview(res.preview);
        } else {
          setError(res.error || "Ce lien d'invitation est invalide ou a expiré.");
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Erreur lors du chargement de l'invitation.");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleJoin = () => {
    if (!token) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await joinMediaByLinkAction(token);
        if (res.success) {
          setJoinSuccess(true);
          setTimeout(() => {
            router.push('/media');
          }, 1000);
        } else {
          setError(res.error || 'Impossible de rejoindre le média.');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Une erreur inattendue est survenue.');
      }
    });
  };

  const roleLabel = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin':
        return 'Administrateur';
      case 'editor':
        return 'Éditeur';
      case 'writer':
        return 'Rédacteur';
      default:
        return 'Membre';
    }
  };

  const formatExpiry = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Permanent (sans expiration)';
    const d = new Date(dateStr);
    return `Expire le ${d.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-4 font-sans">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Vérification du lien d’invitation média…
          </p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-destructive/20 bg-card p-6 shadow-xl space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold text-foreground">Lien invalide ou expiré</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {error ||
                "Ce lien d'invitation n'est plus actif, a été révoqué ou a atteint son nombre maximal d'utilisations."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/media')}
            className="w-full rounded-xl bg-muted py-2.5 px-4 text-xs font-semibold text-foreground hover:bg-muted/80 transition-colors"
          >
            Retourner aux médias
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center p-4 font-sans">
      <div className="w-full max-w-lg rounded-3xl border border-border/50 bg-card p-8 shadow-2xl space-y-6">
        {/* Header de l'invitation */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Users className="h-3.5 w-3.5" />
            <span>Invitation d’équipe</span>
          </div>
          <h1 className="text-xl font-extrabold text-foreground tracking-tight">
            Rejoindre le média
          </h1>
          <p className="text-xs text-muted-foreground">
            Vous avez été invité à intégrer l’équipe éditoriale de cette publication.
          </p>
        </div>

        {/* Détails du média */}
        <div className="rounded-2xl border border-border/40 bg-background/60 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <SafeAvatar
              src={preview.logoUrl}
              name={preview.name}
              size={48}
              shape="squircle"
              type="MEDIA"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-foreground truncate">{preview.name}</h2>
              <p className="text-xs text-muted-foreground">qoe.fi/{preview.slug}</p>
              {preview.inviter && (
                <div className="mt-2 flex items-center gap-2">
                  <SafeAvatar
                    src={preview.inviter.logoUrl}
                    name={preview.inviter.name}
                    username={preview.inviter.username}
                    size={20}
                    shape="circle"
                  />
                  <span className="text-xs text-muted-foreground truncate">
                    Invité par{' '}
                    <span className="font-medium text-foreground">
                      {preview.inviter.name || preview.inviter.username || 'Un membre'}
                    </span>
                    {preview.inviter.username && ` (@${preview.inviter.username})`}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/30 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rôle accordé
              </span>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>{roleLabel(preview.role)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Validité
              </span>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span className="truncate">{formatExpiry(preview.expiresAt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bouton d'action */}
        <div className="space-y-3">
          {joinSuccess ? (
            <div className="flex items-center justify-center gap-2 rounded-xl bg-success/15 py-3 px-4 text-xs font-semibold text-success animate-in fade-in">
              <CheckCircle2 className="h-4 w-4" />
              <span>Vous avez rejoint le média ! Redirection en cours…</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handleJoin}
              className={cn(
                'group flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-60'
              )}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adhésion en cours…</span>
                </>
              ) : (
                <>
                  <span>Rejoindre le média</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          )}

          <p className="text-center text-[11px] text-muted-foreground">
            En rejoignant l’équipe, vous aurez accès aux brouillons et publications du média.
          </p>
        </div>
      </div>
    </div>
  );
}
