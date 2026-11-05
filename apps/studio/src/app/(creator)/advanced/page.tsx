'use client';

import React, { useState, useEffect } from 'react';
import { Users, CheckCircle2, XCircle, UserPlus, Loader2, Building2 } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { StudioHeader } from '@/components/studio-page';
import {
  getCollaborationRequestsAction,
  respondToCollaborationRequestAction,
  sendCollaborationRequestAction,
} from './actions';
import { createMediaAction } from '../media/actions';

interface CollaborationRequest {
  id: string;
  status: string;
  article?: { title: string } | null;
  inviter?: { name: string | null; username: string | null } | null;
}

const REQUEST_STATUS: Record<
  string,
  { label: string; tone: 'brand' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: { label: t`En attente`, tone: 'brand' },
  ACCEPTED: { label: t`Acceptée`, tone: 'success' },
  DECLINED: { label: t`Refusée`, tone: 'danger' },
};

export default function CreatorAdvancedPage() {
  const [requests, setRequests] = useState<{
    received: CollaborationRequest[];
    sent: CollaborationRequest[];
  }>({ received: [], sent: [] });
  const [loading, setLoading] = useState(true);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteArticleId, setInviteArticleId] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [profileVisibility, setProfileVisibility] = useState<Record<string, boolean>>({});

  const [mediaName, setMediaName] = useState('');
  const [mediaSlug, setMediaSlug] = useState('');
  const [mediaBio, setMediaBio] = useState('');
  const [creatingMedia, setCreatingMedia] = useState(false);
  const [mediaMsg, setMediaMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    const res = await getCollaborationRequestsAction();
    if (res.success) {
      setRequests({ received: res.received || [], sent: res.sent || [] });
    }
    setLoading(false);
  };

  const handleRespond = async (
    requestId: string,
    accept: boolean,
    showOnPublicProfile: boolean = true
  ) => {
    const res = await respondToCollaborationRequestAction(requestId, accept, showOnPublicProfile);
    if (res.success) {
      setActionMsg(accept ? t`Invitation acceptée.` : t`Invitation refusée.`);
      void loadRequests();
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername || !inviteArticleId) return;

    setSendingInvite(true);
    const res = await sendCollaborationRequestAction(inviteArticleId, inviteUsername);
    setSendingInvite(false);

    if (res.success) {
      setActionMsg(t`Invitation envoyée.`);
      setInviteUsername('');
      setInviteArticleId('');
      void loadRequests();
    } else {
      setActionMsg(res.error || t`Envoi impossible.`);
    }
  };

  const handleCreateMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaName || !mediaSlug) return;

    setCreatingMedia(true);
    const res = await createMediaAction(mediaName, mediaSlug, mediaBio);
    setCreatingMedia(false);

    if (res.success) {
      setMediaMsg(t`Média créé. Il est accessible depuis le sélecteur d'espace.`);
      setMediaName('');
      setMediaSlug('');
      setMediaBio('');
    } else {
      setMediaMsg(res.error || t`Création impossible.`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 text-foreground">
      <StudioHeader
        title={t`Collaboration`}
        description={t`Demandes de co-rédaction, visibilité sur votre profil et espaces médias.`}
      />

      {actionMsg && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card px-4 py-3">
          <span className="text-sm">{actionMsg}</span>
          <Button variant="ghost" size="xs" onClick={() => setActionMsg(null)}>
            {t`Fermer`}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3 rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <header className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              {t`Demandes reçues`}
            </h2>
          </header>

          {loading ? (
            <p className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t`Chargement…`}
            </p>
          ) : requests.received.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
              {t`Aucune demande en attente.`}
            </p>
          ) : (
            <ul className="space-y-3">
              {requests.received.map((req) => {
                const status = REQUEST_STATUS[req.status] ?? {
                  label: req.status,
                  tone: 'neutral' as const,
                };
                return (
                  <li
                    key={req.id}
                    className="space-y-2 rounded-lg border border-border/40 bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {req.article?.title || t`Article`}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t`De`}{' '}
                          {req.inviter?.name ||
                            (req.inviter?.username ? `@${req.inviter.username}` : t`un créateur`)}
                        </p>
                      </div>
                      <Badge variant="soft" tone={status.tone} size="xs">
                        {status.label}
                      </Badge>
                    </div>

                    {req.status === 'PENDING' && (
                      <div className="flex flex-wrap items-center gap-2 border-t border-border/30 pt-2">
                        <label className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={profileVisibility[req.id] ?? true}
                            onChange={(event) =>
                              setProfileVisibility((current) => ({
                                ...current,
                                [req.id]: event.target.checked,
                              }))
                            }
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          {t`Afficher sur mon profil`}
                        </label>
                        <Button
                          size="sm"
                          variant="solid"
                          tone="brand"
                          onClick={() =>
                            void handleRespond(req.id, true, profileVisibility[req.id] ?? true)
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {t`Accepter`}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleRespond(req.id, false)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          {t`Refuser`}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
          <header className="flex items-center gap-2">
            <UserPlus className="h-3.5 w-3.5 text-primary" />
            <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              {t`Inviter un co-auteur`}
            </h2>
          </header>
          <p className="text-xs text-muted-foreground">
            {t`Invitez un auteur sur l'un de vos articles.`}
          </p>

          <form onSubmit={handleSendInvite} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="invite-article" className="text-xs font-semibold text-foreground">
                {t`Identifiant de l'article`}
              </label>
              <Input
                id="invite-article"
                size="sm"
                value={inviteArticleId}
                onChange={(e) => setInviteArticleId(e.target.value)}
                placeholder="cm123abc"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="invite-username" className="text-xs font-semibold text-foreground">
                {t`Nom d'utilisateur du co-auteur`}
              </label>
              <Input
                id="invite-username"
                size="sm"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="@username"
              />
            </div>

            <Button
              type="submit"
              variant="solid"
              tone="brand"
              size="sm"
              block
              loading={sendingInvite}
            >
              {t`Envoyer la demande`}
            </Button>
          </form>
        </section>
      </div>

      <section className="space-y-3 rounded-xl border border-border/50 bg-card p-5 shadow-2xs">
        <header className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <h2 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {t`Nouveau média`}
          </h2>
        </header>
        <p className="text-xs text-muted-foreground">
          {t`Un espace séparé, avec son propre profil, son sous-domaine et son équipe.`}
        </p>

        {mediaMsg && (
          <p className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs">
            {mediaMsg}
          </p>
        )}

        <form onSubmit={handleCreateMedia} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="media-name" className="text-xs font-semibold text-foreground">
              {t`Nom du média`}
            </label>
            <Input
              id="media-name"
              size="sm"
              value={mediaName}
              onChange={(e) => {
                setMediaName(e.target.value);
                setMediaSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
              }}
              placeholder={t`Nom du média`}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="media-slug" className="text-xs font-semibold text-foreground">
              {t`Sous-domaine`}
            </label>
            <Input
              id="media-slug"
              size="sm"
              value={mediaSlug}
              onChange={(e) => setMediaSlug(e.target.value)}
              placeholder="nom-du-media"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="media-bio" className="text-xs font-semibold text-foreground">
              {t`Description`}
            </label>
            <Textarea
              id="media-bio"
              size="sm"
              value={mediaBio}
              onChange={(e) => setMediaBio(e.target.value)}
              placeholder={t`En une phrase, ce que publie ce média.`}
              rows={3}
            />
          </div>

          <div className="md:col-span-2">
            <Button
              type="submit"
              variant="solid"
              tone="brand"
              size="sm"
              block
              loading={creatingMedia}
            >
              {t`Créer le média`}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
