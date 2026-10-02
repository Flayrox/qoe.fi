'use client';

// =====================================================================
// 📣 CampaignManager — créer, soumettre, approuver, lancer, suspendre
// =====================================================================
// Deux principes :
//   - on ne propose QUE les transitions que le statut courant autorise : un
//     bouton « Approuver » sur un brouillon ferait croire à un raccourci, et le
//     serveur le refuserait ;
//   - chaque transition est une action explicite (jamais un menu déroulant
//     silencieux), avec le compteur d'envoi en regard pour juger du volume
//     avant d'appuyer.
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Megaphone, Plus } from 'lucide-react';
import {
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_TRANSITIONS,
  CAMPAIGN_TYPES,
  type StaffCampaign,
} from '@/lib/admin-campaign-types';
import { campaignTransitionAction, createCampaignAction } from '@/lib/admin-infra-actions';
import { QueueEmpty } from '@/components/queue/QueueEmpty';
import { StatusPill } from '@/components/queue/StatusPill';
import { useStaffAction } from '@/components/queue/useStaffAction';

const inputCls =
  'w-full text-xs px-3 py-2 rounded-xl border border-border bg-background outline-none';

/** Transitions légitimes pour un statut donné (miroir du cycle de vie serveur). */
function allowedTransitions(status: string) {
  return CAMPAIGN_TRANSITIONS.filter((transition) => transition.from.split(',').includes(status));
}

const statusLabels: Record<string, string> = {
  DRAFT: 'brouillon',
  SUBMITTED: 'soumis',
  APPROVED: 'approuvé',
  SENDING: 'en envoi',
  PAUSED: 'suspendu',
  SENT: 'envoyé',
  CANCELED: 'annulé',
  FAILED: 'échec',
};

interface CampaignManagerProps {
  initialCampaigns: StaffCampaign[];
  canWrite: boolean;
}

export function CampaignManager({ initialCampaigns, canWrite }: CampaignManagerProps) {
  const router = useRouter();
  const { loadingId, run } = useStaffAction<string>();
  const [showNew, setShowNew] = useState(false);
  const [type, setType] = useState<string>(CAMPAIGN_TYPES[0].value);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [audienceType, setAudienceType] = useState<string>(CAMPAIGN_AUDIENCES[0].value);
  const [audiencePublicationId, setAudiencePublicationId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const running = loadingId !== null;

  const create = async () => {
    const res = await run(
      'new',
      () =>
        createCampaignAction({
          type,
          subject,
          bodyHtml,
          audienceType,
          audiencePublicationId,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : '',
        }),
      { ok: 'Brouillon de campagne créé' }
    );
    if (res?.ok) {
      setShowNew(false);
      setSubject('');
      setBodyHtml('');
      setAudiencePublicationId('');
      setScheduledAt('');
      router.refresh();
    }
  };

  const transition = async (campaign: StaffCampaign, action: string) => {
    const res = await run(
      `${campaign.id}:${action}`,
      () => campaignTransitionAction({ campaignId: campaign.id, action }),
      { ok: 'Transition appliquée' }
    );
    if (res?.ok) router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Campagnes ({initialCampaigns.length})</h2>
          <p className="text-xs text-muted-foreground">
            Le contenu est validé par le serveur (catégories fermées, audience déclarée). Un envoi
            ne part qu’après approbation explicite.
          </p>
        </div>
        <button
          type="button"
          disabled={!canWrite}
          onClick={() => setShowNew((open) => !open)}
          data-testid="campaign-toggle-new"
          className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3 h-3" /> {showNew ? 'Fermer' : 'Nouvelle campagne'}
        </button>
      </div>

      {!canWrite && (
        <p className="text-xs text-muted-foreground" data-testid="campaign-readonly">
          Lecture seule : la capacité <span className="font-mono">admin.campaigns.write</span> est
          requise pour créer ou faire avancer une campagne.
        </p>
      )}

      {canWrite && showNew && (
        <section
          className="space-y-3 rounded-3xl border border-border bg-white p-5 shadow-sm"
          data-testid="campaign-form"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-[11px] text-muted-foreground space-y-1 block">
              Catégorie
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={inputCls}
                data-testid="campaign-type"
              >
                {CAMPAIGN_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted-foreground space-y-1 block">
              Audience
              <select
                value={audienceType}
                onChange={(e) => setAudienceType(e.target.value)}
                className={inputCls}
                data-testid="campaign-audience"
              >
                {CAMPAIGN_AUDIENCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {audienceType === 'PUBLICATION_SUBSCRIBERS' && (
            <input
              value={audiencePublicationId}
              onChange={(e) => setAudiencePublicationId(e.target.value)}
              placeholder="Identifiant de la publication (obligatoire pour cette audience)"
              className={inputCls}
              data-testid="campaign-audience-publication"
            />
          )}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Objet de l’email"
            className={inputCls}
            data-testid="campaign-subject"
          />
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            placeholder="Corps (HTML) — le serveur refuse une catégorie sans contenu valide"
            rows={4}
            className={inputCls}
            data-testid="campaign-body"
          />
          <label className="text-[11px] text-muted-foreground space-y-1 block">
            Envoi programmé (vide = dès l’approbation)
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputCls}
              data-testid="campaign-scheduled"
            />
          </label>
          <button
            type="button"
            onClick={create}
            disabled={running || subject.trim() === '' || bodyHtml.trim() === ''}
            data-testid="campaign-create"
            className="text-xs font-bold px-4 py-2 rounded-xl bg-[#EE4B2B] text-white cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Créer le brouillon
          </button>
        </section>
      )}

      {initialCampaigns.length === 0 ? (
        <QueueEmpty
          title="Aucune campagne"
          hint="Créez un brouillon : il devra être soumis puis approuvé avant tout envoi."
        />
      ) : (
        <ul className="space-y-3" data-testid="campaign-list">
          {initialCampaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="rounded-3xl border border-border bg-white p-5 shadow-sm space-y-3"
              data-testid={`campaign-${campaign.status}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Megaphone className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{campaign.subject}</span>
                  <StatusPill tone={campaign.status === 'SENDING' ? 'hot' : 'muted'}>
                    {statusLabels[campaign.status] ?? campaign.status}
                  </StatusPill>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{campaign.id}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                <span>catégorie : {campaign.type}</span>
                <span>audience : {campaign.audienceType}</span>
                {campaign.audiencePublicationId ? (
                  <span className="font-mono">{campaign.audiencePublicationId}</span>
                ) : null}
                <span>envoyés : {campaign.sentCount}</span>
                <span>échecs : {campaign.failedCount}</span>
                {campaign.scheduledAt ? (
                  <span>programmé : {new Date(campaign.scheduledAt).toLocaleString('fr-FR')}</span>
                ) : null}
              </div>
              {canWrite && allowedTransitions(campaign.status).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {allowedTransitions(campaign.status).map((step) => (
                    <button
                      key={step.action}
                      type="button"
                      disabled={running}
                      onClick={() => transition(campaign, step.action)}
                      data-testid={`campaign-${step.action}-${campaign.id}`}
                      className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-border cursor-pointer disabled:opacity-40"
                    >
                      {step.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
