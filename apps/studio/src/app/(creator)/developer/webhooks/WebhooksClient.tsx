'use client';

import React, { useState } from 'react';
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
  Eye,
  History,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { toast } from 'sonner';
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

const EVENT_LABELS: Record<string, string> = {
  'article.published': 'Article publié',
  'article.updated': 'Article modifié',
  'article.deleted': 'Article supprimé',
  'subscriber.created': 'Nouvel abonné',
};

function QuietDot({ active }: { active?: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-1.5 w-1.5 rounded-full',
        active ? 'bg-success' : 'bg-muted-foreground/30'
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
      toast.success('Webhook créé ! Copiez le secret maintenant.');
      setRevealedSecret(res.secret);
      setName('');
      setUrl('');
      setShowCreate(false);
      const list = await listWebhooksAction();
      if (list.success) setWebhooks(list.webhooks);
      router.refresh();
    } else {
      toast.error(res.error || 'Échec de la création.');
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
    } else {
      toast.error(res.error || 'Erreur');
    }
  };

  const handleTest = async (id: string) => {
    setBusyId(id);
    const res = await testWebhookAction(id);
    setBusyId(null);
    if (res.success) {
      toast.success(`Test envoyé — HTTP ${res.status}`);
    } else {
      toast.error(res.error || 'Test échoué');
    }
  };

  const copySecret = (secret: string) => {
    navigator.clipboard?.writeText(secret).then(() => toast.success('Secret copié.'));
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
    <div className="mx-auto max-w-4xl px-4 md:px-6 py-8 text-foreground font-sans">
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Recevez les événements de « {workspaceName} » en temps réel sur vos endpoints (signature
            HMAC-SHA256).
          </p>
        </div>
        <button
          onClick={() => setShowCreate((s) => !s)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" strokeWidth={1.5} />
          Nouveau webhook
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-8 bg-card border border-border/40 rounded-2xl p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Nom
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Sync vers mon CMS"
                className="w-full bg-transparent border-b border-border/40 text-sm py-2.5 placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                Endpoint URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://monapp.com/webhooks/qoe"
                className="w-full bg-transparent border-b border-border/40 text-sm py-2.5 font-mono placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-2">
              Événements
            </label>
            <div className="flex flex-wrap gap-2">
              {events.map((ev) => (
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
                    'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer',
                    selectedEvents.includes(ev as WebhookEvent)
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'border-border/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {EVENT_LABELS[ev] || ev}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" strokeWidth={1.5} />
              )}
              Créer
            </button>
          </div>

          {revealedSecret && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-highlight/10 border border-highlight/20 text-xs">
              <span className="text-highlight font-bold shrink-0">Secret (à copier) :</span>
              <code className="font-mono text-foreground truncate flex-1">{revealedSecret}</code>
              <button
                onClick={() => copySecret(revealedSecret)}
                className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer"
                title="Copier"
              >
                <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* List */}
      {webhooks.length === 0 && !showCreate ? (
        <div className="py-20 text-center">
          <div className="size-14 rounded-xl bg-card border border-border/40 text-primary flex items-center justify-center mx-auto mb-5">
            <Globe className="w-6 h-6" strokeWidth={1.5} />
          </div>
          <h3 className="text-xl font-bold tracking-tight">Aucun webhook</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
            Créez un endpoint pour synchroniser vos publications et abonnés avec vos outils.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/30 border-t border-b border-border/30">
          {webhooks.map((webhook) => (
            <div key={webhook.id} className="py-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <QuietDot active={webhook.active} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{webhook.name}</p>
                  <p className="text-xs text-muted-foreground font-mono truncate">{webhook.url}</p>
                </div>
                <div className="flex flex-wrap gap-1 justify-end max-w-xs">
                  {webhook.events.map((ev) => (
                    <span
                      key={ev}
                      className="px-2 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground border border-border/20"
                    >
                      {EVENT_LABELS[ev] || ev}
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openDeliveries(webhook)}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Voir les logs de livraison"
                  >
                    Logs
                  </button>
                  <button
                    onClick={() => handleToggle(webhook.id)}
                    disabled={busyId === webhook.id}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {webhook.active ? 'Actif' : 'En pause'}
                  </button>
                  <button
                    onClick={() => handleTest(webhook.id)}
                    disabled={busyId === webhook.id}
                    className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Envoyer un test"
                  >
                    {busyId === webhook.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Zap className="w-4 h-4" strokeWidth={1.5} />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(webhook.id, webhook.name)}
                    disabled={busyId === webhook.id}
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Recent deliveries */}
              {webhook.deliveries.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pl-4">
                  {webhook.deliveries.map((d) => (
                    <span
                      key={d.id}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      {d.status === 'SUCCESS' ? (
                        <CheckCircle2 className="w-3 h-3 text-success" strokeWidth={1.5} />
                      ) : d.status === 'FAILED' ? (
                        <XCircle className="w-3 h-3 text-destructive" strokeWidth={1.5} />
                      ) : (
                        <Clock className="w-3 h-3" strokeWidth={1.5} />
                      )}
                      {EVENT_LABELS[d.event] || d.event}
                      {d.httpStatus ? ` · HTTP ${d.httpStatus}` : ''} ·{' '}
                      {new Date(d.createdAt).toLocaleString('fr-FR')}
                    </span>
                  ))}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Eye className="w-3 h-3" strokeWidth={1.5} />
                    {webhook.deliveries.length} livraison(s) récente(s)
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 🔍 Vue détaillée des livraisons */}
      <Dialog
        open={detailWebhook !== null}
        onOpenChange={(open) => {
          if (!open) setDetailWebhook(null);
        }}
      >
        <DialogContent className="max-w-2xl p-6 rounded-2xl bg-card border border-border/40 shadow-2xl font-sans max-h-[85vh] flex flex-col">
          <DialogHeader className="space-y-1.5">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-primary" strokeWidth={1.5} />
              <DialogTitle className="text-base font-bold text-foreground">
                Logs de livraison
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
              {detailWebhook?.name} · {detailWebhook?.url}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto mt-4 space-y-2 pr-1">
            {loadingDeliveries ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
                <span className="text-sm">Chargement des livraisons…</span>
              </div>
            ) : !deliveries || deliveries.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Aucune livraison pour le moment.
              </div>
            ) : (
              deliveries.map((d) => (
                <div
                  key={d.id}
                  className="rounded-xl border border-border/30 bg-background/50 p-3.5"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {deliveryStatusIcon(d.status)}
                    <span className="text-xs font-semibold">
                      {EVENT_LABELS[d.event] || d.event}
                    </span>
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded-md text-[10px] font-bold',
                        d.status === 'SUCCESS'
                          ? 'bg-success/10 text-success'
                          : d.status === 'FAILED'
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {d.status}
                    </span>
                    {d.httpStatus ? (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        HTTP {d.httpStatus}
                      </span>
                    ) : null}
                    {typeof d.attempts === 'number' && d.attempts > 1 ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <RotateCcw className="w-3 h-3" strokeWidth={1.5} />
                        {d.attempts} tentatives
                      </span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  {d.responseBody ? (
                    <pre className="mt-2 p-2.5 rounded-lg bg-muted/40 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                      {d.responseBody}
                    </pre>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
