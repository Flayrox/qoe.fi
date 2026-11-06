'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  Loader2,
  Globe,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Send,
  Check,
} from 'lucide-react';
import { Badge } from '@qoe/ui/badge';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { cn } from '@qoe/utils';
import { toast } from '@qoe/ui/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@qoe/ui';
import {
  createWebhookAction,
  listWebhooksAction,
  deleteWebhookAction,
  toggleWebhookAction,
  testWebhookAction,
  listWebhookDeliveriesAction,
  type WebhookWithDeliveries,
  type WebhookEvent,
  type WebhookDeliveryLog,
} from './actions';
import { DeveloperAccessState } from '@/features/developer/components/developer-access-state';
import { DeveloperShell } from '@/features/developer/components/developer-shell';
import { hasDeveloperGrant, type DeveloperAccess } from '@/features/developer/types';

const EVENT_LABELS: Record<string, () => string> = {
  'article.published': () => t`Article publié`,
  'article.updated': () => t`Article modifié`,
  'article.deleted': () => t`Article supprimé`,
  'subscriber.created': () => t`Nouvel abonné`,
};

function QuietDot({ active }: { active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full transition-colors',
        active ? 'bg-success shadow-xs' : 'bg-muted-foreground/30'
      )}
    />
  );
}

export function WebhooksClient({
  access,
  initialWebhooks,
  events,
  workspaceName,
}: {
  access: DeveloperAccess;
  initialWebhooks: WebhookWithDeliveries[];
  events: readonly string[];
  workspaceName: string;
}) {
  const router = useRouter();
  const hasWebhookGrant = hasDeveloperGrant(access, 'webhooks');
  const [webhooks, setWebhooks] = useState<WebhookWithDeliveries[]>(initialWebhooks);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>(['article.published']);
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailWebhook, setDetailWebhook] = useState<WebhookWithDeliveries | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[] | null>(null);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !url.trim()) {
      toast.error("Le nom et l'URL sont requis.");
      return;
    }
    setCreating(true);
    const res = await createWebhookAction({ name, url, events: selectedEvents });
    setCreating(false);
    if (res.success) {
      toast.success(t`Webhook créé ! Copiez le secret maintenant.`);
      setRevealedSecret(res.secret);
      setName('');
      setUrl('');
      // Garder le formulaire ouvert tant que le secret est affiché : il est
      // indispensable pour configurer le endpoint et n'est montré qu'une fois.
      const list = await listWebhooksAction();
      if (list.success) setWebhooks(list.webhooks);
      router.refresh();
    } else {
      toast.error(res.error || t`Échec de la création.`);
    }
  };

  const handleToggle = async (id: string) => {
    setBusyId(id);
    const res = await toggleWebhookAction(id);
    setBusyId(null);
    if (res.success) {
      const list = await listWebhooksAction();
      if (list.success) setWebhooks(list.webhooks);
    } else {
      toast.error(res.error || 'Erreur');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le webhook "${name}" ?`)) return;
    setBusyId(id);
    const res = await deleteWebhookAction(id);
    setBusyId(null);
    if (res.success) {
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success(t`Webhook supprimé.`);
    } else {
      toast.error(res.error || 'Erreur');
    }
  };

  const handleTest = async (id: string) => {
    setBusyId(id);
    const res = await testWebhookAction(id);
    setBusyId(null);
    if (res.success) {
      toast.success(`Événement de test envoyé — HTTP ${res.status}`);
    } else {
      toast.error(res.error || t`Test échoué`);
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard?.writeText(secret).then(() => toast.success(t`Secret copié.`));
  };

  const openDeliveries = async (webhook: WebhookWithDeliveries) => {
    setDetailWebhook(webhook);
    setDeliveries(null);
    setLoadingDeliveries(true);
    const res = await listWebhookDeliveriesAction(webhook.id);
    setLoadingDeliveries(false);
    if (res.success) {
      setDeliveries(res.deliveries);
    } else {
      toast.error(res.error || 'Impossible de charger les logs.');
    }
  };

  const deliveryStatusIcon = (status: string) => {
    if (status === 'SUCCESS')
      return <CheckCircle2 className="w-3.5 h-3.5 text-success-text" strokeWidth={1.5} />;
    if (status === 'FAILED')
      return <XCircle className="w-3.5 h-3.5 text-destructive-text" strokeWidth={1.5} />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />;
  };

  return (
    <DeveloperShell
      access={access}
      description={`Recevez les événements de « ${workspaceName} » avec une signature HMAC SHA-256.`}
    >
      {hasWebhookGrant ? (
        <div className="flex justify-end">
          <Button
            variant="solid"
            tone="brand"
            size="md"
            onClick={() => setShowCreate((current) => !current)}
          >
            <Plus />
            Nouveau Webhook
          </Button>
        </div>
      ) : null}

      {/* Create form */}
      {showCreate && (
        <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8 space-y-5 shadow-xs">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground">Configurer un nouveau webhook</h3>
            <p className="text-xs text-muted-foreground">
              Entrez l'URL HTTPS publique de votre serveur qui traitera les requêtes POST.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Nom de l'intégration
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Sync vers mon CRM, Discord Notifier..."
                aria-label="Nom de l'intégration"
                size="sm"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Endpoint URL (HTTPS)
              </label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.monsite.com/webhooks/qoe"
                aria-label="Endpoint URL HTTPS"
                size="sm"
                className="font-sans text-xs"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Événements souscrits
            </label>
            <div className="flex flex-wrap gap-2">
              {events.map((ev) => {
                const isSelected = selectedEvents.includes(ev as WebhookEvent);
                return (
                  <Button
                    key={ev}
                    variant={isSelected ? 'soft' : 'outline'}
                    tone={isSelected ? 'brand' : 'neutral'}
                    size="xs"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedEvents((prev) =>
                        prev.includes(ev as WebhookEvent)
                          ? prev.filter((e) => e !== ev)
                          : [...prev, ev as WebhookEvent]
                      )
                    }
                    className="rounded-full"
                  >
                    {isSelected ? <Check aria-hidden /> : <Plus aria-hidden />}
                    <span>{EVENT_LABELS[ev] ? EVENT_LABELS[ev]() : ev}</span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreate(false);
                setRevealedSecret(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="solid"
              tone="brand"
              size="sm"
              onClick={handleCreate}
              disabled={!name.trim() || !url.trim()}
              loading={creating}
            >
              {!creating && <Zap aria-hidden />}
              Enregistrer le Webhook
            </Button>
          </div>

          {revealedSecret && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-highlight/10 border border-highlight/20 text-xs">
              <span className="text-highlight font-bold shrink-0">Secret HMAC :</span>
              <code className="font-sans font-medium text-foreground truncate flex-1 text-[11px]">
                {revealedSecret}
              </code>
              <Button
                variant="ghost"
                size="xs"
                shape="icon"
                onClick={() => copySecret(revealedSecret)}
                aria-label="Copier le secret"
                title="Copier le secret"
              >
                <Copy aria-hidden />
              </Button>
            </div>
          )}
        </div>
      )}

      {!hasWebhookGrant ? (
        <DeveloperAccessState access={access} capability="webhooks" />
      ) : webhooks.length === 0 && !showCreate ? (
        <div className="py-20 text-center bg-card border border-border/50 rounded-2xl p-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 text-primary flex items-center justify-center mx-auto mb-4 border border-border/60">
            <Globe className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-foreground">Aucun webhook configuré</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-6 max-w-sm mx-auto leading-relaxed">
            Créez un endpoint HTTPS pour synchroniser automatiquement vos articles et abonnés avec
            vos applications.
          </p>
          <Button variant="solid" tone="brand" size="md" onClick={() => setShowCreate(true)}>
            <Plus aria-hidden />
            Créer mon premier webhook
          </Button>
        </div>
      ) : (
        <div className="bg-card border border-border/50 rounded-2xl shadow-xs overflow-hidden divide-y divide-border/60">
          <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Endpoints Enregistrés</h3>
            <Badge variant="soft" size="sm" shape="pill">
              {webhooks.length} webhook{webhooks.length > 1 ? 's' : ''}
            </Badge>
          </div>

          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="pt-1">
                  <QuietDot active={webhook.active} />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-foreground truncate">{webhook.name}</p>
                    <Badge
                      variant="soft"
                      tone={webhook.active ? 'success' : 'neutral'}
                      shape="pill"
                    >
                      {webhook.active ? 'Actif' : 'En pause'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-sans truncate">{webhook.url}</p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {webhook.events.map((ev) => (
                      <Badge key={ev} variant="outline" tone="neutral">
                        {EVENT_LABELS[ev] ? EVENT_LABELS[ev]() : ev}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <Button
                  variant="soft"
                  size="xs"
                  onClick={() => openDeliveries(webhook)}
                  title="Historique des envois"
                >
                  Historique
                </Button>
                <Button
                  variant="soft"
                  tone="brand"
                  size="xs"
                  onClick={() => handleTest(webhook.id)}
                  disabled={busyId === webhook.id}
                  loading={busyId === webhook.id}
                  title="Envoyer un ping de test"
                >
                  {busyId !== webhook.id && <Send aria-hidden />}
                  Tester
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleToggle(webhook.id)}
                  disabled={busyId === webhook.id}
                >
                  {webhook.active ? 'Pause' : 'Activer'}
                </Button>
                <Button
                  variant="ghost"
                  tone="danger"
                  size="xs"
                  shape="icon"
                  onClick={() => handleDelete(webhook.id, webhook.name)}
                  disabled={busyId === webhook.id}
                  aria-label="Supprimer ce webhook"
                  title="Supprimer ce webhook"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deliveries Dialog */}
      <Dialog open={!!detailWebhook} onOpenChange={(open) => !open && setDetailWebhook(null)}>
        <DialogContent className="max-w-2xl bg-card text-foreground border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              Historique de livraison — {detailWebhook?.name}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs font-sans truncate">
              {detailWebhook?.url}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {loadingDeliveries ? (
              <div className="py-12 flex justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : deliveries && deliveries.length > 0 ? (
              <div className="space-y-2.5">
                {deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl border border-border/50 bg-muted/30 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {deliveryStatusIcon(d.status)}
                        <span className="font-semibold text-foreground">{d.event}</span>
                        {d.httpStatus && (
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-sans tabular-nums font-bold',
                              d.httpStatus >= 200 && d.httpStatus < 300
                                ? 'bg-success/10 text-success-text'
                                : 'bg-destructive/10 text-destructive-text'
                            )}
                          >
                            HTTP {d.httpStatus}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(d.createdAt).toLocaleDateString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    {d.responseBody && (
                      <p className="text-[11px] text-muted-foreground font-sans break-all line-clamp-2">
                        {d.responseBody}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Aucune livraison enregistrée pour ce webhook.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DeveloperShell>
  );
}
