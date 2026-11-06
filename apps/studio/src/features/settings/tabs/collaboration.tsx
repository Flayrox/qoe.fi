'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock3, Loader2, UserPlus, XCircle } from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Checkbox } from '@qoe/ui/checkbox';
import { Tab, TabList, Tabs } from '@qoe/ui/tabs';
import { StudioSection } from '@/components/studio-page';
import {
  getCollaborationRequestsAction,
  respondToCollaborationRequestAction,
} from '../collaboration-actions';

interface CollaborationRequest {
  id: string;
  articleId: string;
  status: string;
  article?: { id: string; title: string; slug: string } | null;
  inviter?: { id: string; name: string | null; username: string | null } | null;
  invitee?: { id: string; name: string | null; username: string | null } | null;
}

type RequestInbox = 'received' | 'sent';

const REQUEST_STATUS: Record<
  string,
  { label: string; tone: 'brand' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: { label: 'En attente', tone: 'brand' },
  ACCEPTED: { label: 'Acceptée', tone: 'success' },
  DECLINED: { label: 'Refusée', tone: 'danger' },
};

function personLabel(person: CollaborationRequest['inviter']) {
  if (!person) return 'un créateur';
  return person.name || (person.username ? `@${person.username}` : 'un créateur');
}

export function CollaborationTab() {
  const [requests, setRequests] = useState<{
    received: CollaborationRequest[];
    sent: CollaborationRequest[];
  }>({ received: [], sent: [] });
  const [inbox, setInbox] = useState<RequestInbox>('received');
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [profileVisibility, setProfileVisibility] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    const res = await getCollaborationRequestsAction();
    setLoading(false);
    if (res.success) {
      setRequests({ received: res.received || [], sent: res.sent || [] });
    } else {
      setMessage(res.error || 'Impossible de charger les invitations.');
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const handleRespond = async (requestId: string, accept: boolean) => {
    setRespondingId(requestId);
    const res = await respondToCollaborationRequestAction(
      requestId,
      accept,
      profileVisibility[requestId] ?? true
    );
    setRespondingId(null);
    if (res.success) {
      setMessage(accept ? 'Invitation acceptée.' : 'Invitation refusée.');
      await loadRequests();
    } else {
      setMessage(res.error || "La réponse n'a pas pu être enregistrée.");
    }
  };

  const currentRequests = requests[inbox];
  const pendingCount = requests.received.filter((request) => request.status === 'PENDING').length;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
      <StudioSection
        title="Invitations de collaboration"
        icon={UserPlus}
        className="lg:col-span-8"
        actions={
          pendingCount > 0 ? (
            <Badge variant="soft" tone="brand" size="xs">
              {pendingCount} en attente
            </Badge>
          ) : undefined
        }
      >
        <Tabs
          variant="segmented"
          size="sm"
          value={inbox}
          onValueChange={(value) => setInbox(value as RequestInbox)}
          className="mb-4"
        >
          <TabList aria-label="Invitations de collaboration">
            <Tab id="received" count={requests.received.length}>
              Reçues
            </Tab>
            <Tab id="sent" count={requests.sent.length}>
              Envoyées
            </Tab>
          </TabList>
        </Tabs>

        {message ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-control border border-border/50 bg-muted/20 px-3 py-2 text-xs">
            <span>{message}</span>
            <Button variant="ghost" size="xs" onClick={() => setMessage(null)}>
              Fermer
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 py-8 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Chargement des invitations…
          </p>
        ) : currentRequests.length === 0 ? (
          <div className="rounded-control border border-dashed border-border/60 px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {inbox === 'received' ? 'Aucune invitation reçue.' : 'Aucune invitation envoyée.'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {inbox === 'received'
                ? 'Les demandes de co-rédaction apparaîtront ici.'
                : 'Invitez un co-auteur depuis les réglages d’un article.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {currentRequests.map((request) => {
              const status = REQUEST_STATUS[request.status] ?? {
                label: request.status,
                tone: 'neutral' as const,
              };
              const person = inbox === 'received' ? request.inviter : request.invitee;
              return (
                <div key={request.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {request.article?.title || 'Article'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {inbox === 'received' ? 'Invitation de' : 'Invitation à'}{' '}
                        {personLabel(person)}
                      </p>
                    </div>
                    <Badge variant="soft" tone={status.tone} size="xs">
                      {status.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild variant="ghost" tone="brand" size="xs">
                      <Link href={`/articles/${request.articleId}`}>
                        Ouvrir l’article
                        <ArrowUpRight />
                      </Link>
                    </Button>

                    {inbox === 'received' && request.status === 'PENDING' ? (
                      <>
                        <Checkbox
                          size="xs"
                          isSelected={profileVisibility[request.id] ?? true}
                          onChange={(checked) =>
                            setProfileVisibility((current) => ({
                              ...current,
                              [request.id]: checked,
                            }))
                          }
                          label="Afficher sur mon profil"
                        />
                        <Button
                          variant="solid"
                          tone="brand"
                          size="xs"
                          loading={respondingId === request.id}
                          onClick={() => void handleRespond(request.id, true)}
                        >
                          <CheckCircle2 />
                          Accepter
                        </Button>
                        <Button
                          variant="ghost"
                          tone="danger"
                          size="xs"
                          disabled={respondingId === request.id}
                          onClick={() => void handleRespond(request.id, false)}
                        >
                          <XCircle />
                          Refuser
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </StudioSection>

      <StudioSection title="Comment ça marche" icon={Clock3} className="lg:col-span-4">
        <ol className="space-y-3 text-xs leading-relaxed text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">1.</span> Invitez un co-auteur depuis les
            réglages d’un article, dans l’éditeur.
          </li>
          <li>
            <span className="font-medium text-foreground">2.</span> La personne retrouve la demande
            ici et choisit de l’accepter ou de la refuser.
          </li>
          <li>
            <span className="font-medium text-foreground">3.</span> Une fois acceptée, son nom peut
            apparaître dans la signature publique de l’article.
          </li>
        </ol>
        <p className="mt-4 border-t border-border/40 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          Les invitations sont nominatives : aucun email n’est exposé et les droits restent limités
          à l’article concerné.
        </p>
      </StudioSection>
    </div>
  );
}
