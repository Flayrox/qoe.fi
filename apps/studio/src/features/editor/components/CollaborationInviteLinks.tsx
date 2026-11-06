'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Clock, Copy, Link2, Loader2, Trash2, Users } from 'lucide-react';
import {
  createCollaborationInviteLinkAction,
  listCollaborationInviteLinksAction,
  revokeCollaborationInviteLinkAction,
  type CollaborationInviteLinkDTO,
} from '@qoe/sdk/actions/articles';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Input } from '@qoe/ui/input';
import { Select } from '@qoe/ui/select';

const LINK_ROLES = [
  { id: 'CONTRIBUTOR', label: 'Contributeur' },
  { id: 'CO_AUTHOR', label: 'Co-auteur' },
  { id: 'EDITOR', label: 'Éditeur' },
];

const LINK_DURATIONS = [
  { id: '24', label: '24 heures' },
  { id: '168', label: '7 jours' },
  { id: '720', label: '30 jours' },
  { id: '0', label: 'Permanent' },
];

const LINK_MAX_USES = [
  { id: '1', label: '1 seule fois' },
  { id: '5', label: '5 utilisations' },
  { id: '10', label: '10 utilisations' },
  { id: '0', label: 'Illimité' },
];

function formatExpiry(dateStr: string | null) {
  if (!dateStr) return 'Permanent';
  return new Date(dateStr).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getJoinUrl(token: string) {
  return `${window.location.origin}/collaborate/join?token=${token}`;
}

function roleLabel(role: string) {
  if (role === 'CO_AUTHOR') return 'Co-auteur';
  if (role === 'EDITOR') return 'Éditeur';
  return 'Contributeur';
}

export function CollaborationInviteLinks({
  articleId,
  open,
  onOpenChange,
}: {
  articleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [links, setLinks] = useState<CollaborationInviteLinkDTO[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkRole, setLinkRole] = useState('CONTRIBUTOR');
  const [linkExpiresIn, setLinkExpiresIn] = useState(24);
  const [linkMaxUses, setLinkMaxUses] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [latestCreatedUrl, setLatestCreatedUrl] = useState<string | null>(null);

  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await listCollaborationInviteLinksAction(articleId);
      if (res.ok && res.data) {
        setLinks(res.data.links || []);
      }
    } finally {
      setLoadingLinks(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (open) fetchLinks();
  }, [open, fetchLinks]);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setLatestCreatedUrl(null);
  };

  const handleCreateLink = async () => {
    setCreatingLink(true);
    try {
      const res = await createCollaborationInviteLinkAction({
        articleId,
        role: linkRole,
        expiresInHours: linkExpiresIn,
        maxUses: linkMaxUses,
      });
      if (res.ok && res.data?.link) {
        setLatestCreatedUrl(getJoinUrl(res.data.link.token));
        setLinks((prev) => [res.data.link, ...prev]);
      }
    } finally {
      setCreatingLink(false);
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    const res = await revokeCollaborationInviteLinkAction(linkId);
    if (res.ok) {
      setLinks((prev) => prev.filter((link) => link.id !== linkId));
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange} size="lg">
      <DialogContent aria-label="Lien de collaboration" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" aria-hidden />
            Lien de collaboration
          </DialogTitle>
          <DialogDescription>
            Générez un lien d’invitation pour co-rédiger cet article. Les personnes disposant du
            lien peuvent rejoindre la co-rédaction sans renseigner d’adresse email.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5 pr-1">
          <section className="space-y-3 border-t border-border/40 pt-4">
            <h3 className="text-xs font-bold tracking-wider text-foreground uppercase">
              Créer un nouveau lien
            </h3>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Select
                label="Rôle accordé"
                hideLabel
                size="sm"
                value={linkRole}
                onValueChange={setLinkRole}
                options={LINK_ROLES}
              />
              <Select
                label="Durée de validité"
                hideLabel
                size="sm"
                value={String(linkExpiresIn)}
                onValueChange={(value) => setLinkExpiresIn(Number(value))}
                options={LINK_DURATIONS}
              />
              <Select
                label="Utilisations max"
                hideLabel
                size="sm"
                value={String(linkMaxUses)}
                onValueChange={(value) => setLinkMaxUses(Number(value))}
                options={LINK_MAX_USES}
              />
            </div>

            <Button
              variant="solid"
              tone="brand"
              size="sm"
              block
              loading={creatingLink}
              onClick={handleCreateLink}
              className="mt-1"
            >
              {!creatingLink && <Link2 aria-hidden />}
              Générer le lien d’invitation
            </Button>
          </section>

          {latestCreatedUrl && (
            <div className="space-y-1.5 rounded-control bg-success/10 p-3">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-success-text">
                <span className="flex items-center gap-1.5">
                  <Check className="size-3.5" aria-hidden />
                  Lien prêt à être partagé.
                </span>
                <Button
                  variant="soft"
                  tone="success"
                  size="xs"
                  onClick={() => copyToClipboard(latestCreatedUrl, 'latest')}
                >
                  {copiedId === 'latest' ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copiedId === 'latest' ? 'Copié.' : 'Copier'}
                </Button>
              </div>
              <Input
                readOnly
                size="sm"
                aria-label="Lien d’invitation créé"
                value={latestCreatedUrl}
                onFocus={(event) => event.currentTarget.select()}
                className="bg-background/80"
              />
            </div>
          )}

          <section className="space-y-2 border-t border-border/30 pt-3">
            <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
              Liens actifs pour cet article
            </h3>

            {loadingLinks ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Chargement des liens…
              </div>
            ) : links.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground italic">
                Aucun lien actif généré pour cet article.
              </p>
            ) : (
              <div className="max-h-48 divide-y divide-border/20 overflow-y-auto pr-1">
                {links.map((link) => {
                  const joinUrl = getJoinUrl(link.token);
                  return (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="brand">{roleLabel(link.role)}</Badge>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="size-3" aria-hidden />
                            {link.expiresAt
                              ? `Expire le ${formatExpiry(link.expiresAt)}`
                              : 'Permanent'}
                          </span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Users className="size-3" aria-hidden />
                            {link.usedCount} / {link.maxUses > 0 ? link.maxUses : '∞'}
                          </span>
                        </div>
                        <p className="truncate font-sans text-[11px] text-muted-foreground">
                          {joinUrl}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="xs"
                          shape="icon"
                          onClick={() => copyToClipboard(joinUrl, link.id)}
                          aria-label="Copier le lien"
                          title="Copier le lien"
                        >
                          {copiedId === link.id ? (
                            <Check className="text-success-text" aria-hidden />
                          ) : (
                            <Copy aria-hidden />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          tone="danger"
                          size="xs"
                          shape="icon"
                          onClick={() => handleRevokeLink(link.id)}
                          aria-label="Révoquer le lien"
                          title="Révoquer le lien"
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </DialogBody>

        <DialogFooter>
          <DialogClose>Fermer</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
