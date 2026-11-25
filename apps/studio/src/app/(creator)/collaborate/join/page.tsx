'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText,
  Users,
  ShieldCheck,
  Clock,
  ArrowRight,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import {
  getCollaborationInviteLinkPreviewAction,
  joinCollaborationByLinkAction,
  type CollaborationInviteLinkPreview,
} from '@qoe/sdk/actions/articles';
import { SafeAvatar } from '@qoe/ui';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';

export default function CollaborateJoinPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [preview, setPreview] = useState<CollaborationInviteLinkPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [joinSuccess, setJoinSuccess] = useState(false);
  // La redirection différée doit être annulée si la page est quittée avant
  // l'échéance, sinon un départ volontaire devient une navigation forcée.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  useEffect(() => {
    if (!token) {
      setError(t`Aucun jeton d'invitation fourni dans le lien.`);
      setLoading(false);
      return;
    }

    let isMounted = true;
    (async () => {
      try {
        const res = await getCollaborationInviteLinkPreviewAction(token);
        if (!isMounted) return;
        if (res.ok && res.data) {
          setPreview(res.data);
        } else {
          setError(
            res.ok
              ? t`Ce lien d'invitation est invalide ou a expiré.`
              : res.error.message || t`Ce lien d'invitation est invalide ou a expiré.`
          );
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setError(
          err instanceof Error ? err.message : t`Erreur lors du chargement de l'invitation.`
        );
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
        const res = await joinCollaborationByLinkAction(token);
        if (res.ok && res.data?.success) {
          setJoinSuccess(true);
          redirectTimer.current = setTimeout(() => {
            router.push(`/articles/${res.data.articleId}`);
          }, 1000);
        } else {
          setError(
            res.ok
              ? t`Impossible de rejoindre la co-rédaction.`
              : res.error.message || t`Impossible de rejoindre la co-rédaction.`
          );
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : t`Une erreur inattendue est survenue.`);
      }
    });
  };

  const roleLabel = (role: string) => {
    switch (role) {
      case 'PRIMARY_AUTHOR':
        return t`Auteur principal`;
      case 'CO_AUTHOR':
        return t`Co-auteur`;
      case 'EDITOR':
        return t`Éditeur`;
      case 'CONTRIBUTOR':
        return t`Contributeur`;
      default:
        return t`Contributeur`;
    }
  };

  const formatExpiry = (dateStr: string | null | undefined) => {
    if (!dateStr) return t`Permanent (sans expiration)`;
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
            {t`Vérification du lien d’invitation…`}
          </p>
        </div>
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md rounded-xl border border-destructive/20 bg-card p-6 shadow-xl space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive-text">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-bold text-foreground">{t`Lien invalide ou expiré`}</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {error ||
                t`Ce lien d'invitation n'est plus actif, a été révoqué ou a atteint sa limite d'utilisations.`}
            </p>
          </div>
          <Button
            variant="soft"
            block
            onClick={() => router.push('/articles')}
            className="rounded-xl bg-muted px-4 py-2.5 text-xs! font-semibold! text-foreground hover:bg-muted/80 leading-[16px]! h-auto! whitespace-normal! justify-normal inline-block "
          >
            {t`Retourner aux articles`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[75vh] items-center justify-center p-4 font-sans">
      <div className="w-full max-w-lg space-y-6 rounded-xl border border-border/50 bg-card p-6 shadow-xs">
        {/* Header de l'invitation */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Users className="h-3.5 w-3.5" />
            <span>{t`Invitation de collaboration`}</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t`Rejoindre la co-rédaction`}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t`Vous avez été invité à participer à la rédaction de cet article.`}
          </p>
        </div>

        {/* Détails de l'article */}
        <div className="rounded-xl border border-border/40 bg-background/60 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                {preview.title || t`Article sans titre`}
              </h2>
              <div className="mt-2 flex items-center gap-2">
                <SafeAvatar
                  src={preview.author.logoUrl}
                  name={preview.author.name}
                  username={preview.author.username}
                  size={20}
                  shape="circle"
                />
                <span className="text-xs text-muted-foreground truncate">
                  {t`Par`}{' '}
                  <span className="font-medium text-foreground">
                    {preview.author.name || preview.author.username || t`Auteur`}
                  </span>
                  {preview.author.username && ` (@${preview.author.username})`}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border/30 text-xs">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t`Rôle accordé`}
              </span>
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <span>{roleLabel(preview.role)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t`Validité`}
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
            <div className="flex items-center justify-center gap-2 rounded-xl bg-success/15 py-3 px-4 text-xs font-semibold text-success-text animate-in fade-in">
              <CheckCircle2 className="h-4 w-4" />
              <span>{t`Invitation acceptée ! Redirection en cours…`}</span>
            </div>
          ) : (
            <Button
              variant="solid"
              tone="brand"
              block
              onClick={handleJoin}
              loading={isPending}
              className="items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm! font-bold! shadow-lg shadow-primary/20 active:scale-[0.99] leading-[20px]! h-auto! whitespace-normal! "
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4! w-4! animate-spin" />
                  <span>{t`Acceptation en cours…`}</span>
                </>
              ) : (
                <>
                  <span>{t`Accepter et ouvrir l’éditeur`}</span>
                  <ArrowRight className="h-4! w-4! transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          )}

          <p className="text-center text-[11px] text-muted-foreground">
            {t`En rejoignant, votre profil sera associé à l’article conformément au rôle sélectionné.`}
          </p>
        </div>
      </div>
    </div>
  );
}
