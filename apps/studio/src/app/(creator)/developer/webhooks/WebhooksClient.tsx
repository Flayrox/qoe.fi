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
  Webhook as WebhookIcon,
  Send,
} from 'lucide-react';
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
import { DeveloperNav } from '@/features/developer/components/developer-nav';

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
  initialWebhooks,
  events,
  workspaceName,
}: {
  initialWebhooks: WebhookWithDeliveries[];
  events: readonly string[];
  workspaceName: string;
}) {
  const router = useRouter();
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
      setShowCreate(false);
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
      return <CheckCircle2 className="w-3.5 h-3.5 text-success" strokeWidth={1.5} />;
    if (status === 'FAILED')
      return <XCircle className="w-3.5 h-3.5 text-destructive" strokeWidth={1.5} />;
    return <Clock className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.5} />;
  };

  return (
    <div className="w-full space-y-8 font-sans pb-16 text-foreground">
      {/* Header section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1.5">
              <WebhookIcon className="w-3.5 h-3.5" />
              Événements & Intégrations Sortantes
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Webhooks Temps Réel
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Recevez les événements de « {workspaceName} » directement sur vos serveurs avec une
              signature cryptographique HMAC SHA-256.
            </p>
          </div>

          <button
            onClick={() => setShowCreate((s) => !s)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all cursor-pointer shadow-xs self-start md:self-auto"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Nouveau Webhook
          </button>
        </div>

        {/* Sub-Navigation */}
        <DeveloperNav activeTab="webhooks" />
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-card border border-border/80 rounded-2xl p-6 md:p-8 space-y-5 shadow-xs">
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
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Sync vers mon CRM, Discord Notifier..."
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground">
                Endpoint URL (HTTPS)
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.monsite.com/webhooks/qoe"
                className="w-full bg-muted/30 border border-border rounded-xl px-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
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
                  <button
                    key={ev}
                    type="button"
                    onClick={() =>
                      setSelectedEvents((prev) =>
                        prev.includes(ev as WebhookEvent)
                          ? prev.filter((e) => e !== ev)
                          : [...prev, ev as WebhookEvent]
                      )
                    }
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-150 cursor-pointer flex items-center gap-1.5',
                      isSelected
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:border-muted-foreground/40'
                    )}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{EVENT_LABELS[ev] ? EVENT_LABELS[ev]() : ev}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <button
              onClick={() => setShowCreate(false)}
              className="text-xs text-muted-foreground hover:text-foreground font-medium px-3 py-2"
            >
              Annuler
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim() || !url.trim()}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60 shadow-xs"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" strokeWidth={2} />
              )}
              Enregistrer le Webhook
            </button>
          </div>

          {revealedSecret && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-highlight/10 border border-highlight/20 text-xs">
              <span className="text-highlight font-bold shrink-0">Secret HMAC :</span>
              <code className="font-mono text-foreground truncate flex-1 text-[11px]">
                {revealedSecret}
              </code>
              <button
                onClick={() => copySecret(revealedSecret)}
                className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                title="Copier le secret"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* List */}
      {webhooks.length === 0 && !showCreate ? (
        <div className="py-20 text-center bg-card border border-border/80 rounded-2xl p-8 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-muted/40 text-primary flex items-center justify-center mx-auto mb-4 border border-border/60">
            <Globe className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-lg font-bold text-foreground">Aucun webhook configuré</h3>
          <p className="text-xs text-muted-foreground mt-1 mb-6 max-w-sm mx-auto leading-relaxed">
            Créez un endpoint HTTPS pour synchroniser automatiquement vos articles et abonnés avec
            vos applications.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Créer mon premier webhook
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border/80 rounded-2xl shadow-xs overflow-hidden divide-y divide-border/60">
          <div className="px-6 py-4 border-b border-border/80 flex items-center justify-between">
            <h3 className="text-base font-bold text-foreground">Endpoints Enregistrés</h3>
            <span className="text-xs font-semibold bg-muted/60 border border-border/80 px-2.5 py-1 rounded-full text-foreground">
              {webhooks.length} webhook{webhooks.length > 1 ? 's' : ''}
            </span>
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
                    <span
                      className={cn(
                        'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                        webhook.active
                          ? 'bg-success/10 text-success border-success/20'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {webhook.active ? 'Actif' : 'En pause'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono truncate">{webhook.url}</p>

                  <div className="flex flex-wrap gap-1 pt-1">
                    {webhook.events.map((ev) => (
                      <span
                        key={ev}
                        className="px-2 py-0.5 rounded-md bg-muted/60 text-[10px] font-medium text-muted-foreground border border-border/40"
                      >
                        {EVENT_LABELS[ev] ? EVENT_LABELS[ev]() : ev}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() => openDeliveries(webhook)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-foreground bg-muted/40 hover:bg-muted border border-border/60 transition-colors cursor-pointer"
                  title="Historique des envois"
                >
                  Historique
                </button>
                <button
                  onClick={() => handleTest(webhook.id)}
                  disabled={busyId === webhook.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-foreground bg-muted/40 hover:bg-muted border border-border/60 transition-colors cursor-pointer flex items-center gap-1"
                  title="Envoyer un ping de test"
                >
                  {busyId === webhook.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3 text-primary" />
                  )}
                  Tester
                </button>
                <button
                  onClick={() => handleToggle(webhook.id)}
                  disabled={busyId === webhook.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground bg-muted/30 hover:bg-muted/60 border border-border/40 transition-colors cursor-pointer"
                >
                  {webhook.active ? 'Pause' : 'Activer'}
                </button>
                <button
                  onClick={() => handleDelete(webhook.id, webhook.name)}
                  disabled={busyId === webhook.id}
                  className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer"
                  title="Supprimer ce webhook"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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
            <DialogDescription className="text-muted-foreground text-xs font-mono truncate">
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
                    className="p-3.5 rounded-xl border border-border/80 bg-muted/30 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {deliveryStatusIcon(d.status)}
                        <span className="font-semibold text-foreground">{d.event}</span>
                        {d.httpStatus && (
                          <span
                            className={cn(
                              'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold',
                              d.httpStatus >= 200 && d.httpStatus < 300
                                ? 'bg-success/10 text-success'
                                : 'bg-destructive/10 text-destructive'
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
                      <p className="text-[11px] text-muted-foreground font-mono break-all line-clamp-2">
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
    </div>
  );
}
