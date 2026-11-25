'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Code2, Globe, Loader2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import { toast } from '@qoe/ui/toast';
import { StudioField, StudioSection } from '@/components/studio-page';
import { submitApiApplicationAction } from '@qoe/sdk/actions/dashboard';
import { t } from '@lingui/core/macro';

const APPLICATION_PRESETS = () =>
  [
    {
      id: 'portfolio',
      title: t`Site ou portfolio`,
      subtitle: 'Next.js, Astro, Remix',
      icon: Globe,
      template: t`Je souhaite intégrer l'API qoefi à mon site personnel pour afficher mes derniers articles, mes tags et les informations de mon profil public.`,
    },
    {
      id: 'automation',
      title: 'Automatisation & CMS',
      subtitle: 'Zapier, Notion, Make, n8n',
      icon: RefreshCw,
      template: t`Je souhaite connecter l'API qoefi à mes outils d'automatisation pour synchroniser mes brouillons et mes articles publiés.`,
    },
    {
      id: 'ai-agent',
      title: 'Agent IA & index',
      subtitle: t`Recherche, résumés`,
      icon: Code2,
      template: t`Je souhaite utiliser l'API en lecture pour alimenter un agent d'indexation sémantique et générer des résumés de mes publications.`,
    },
    {
      id: 'webhooks',
      title: t`Webhooks & backend`,
      subtitle: 'Discord, Telegram, serveur',
      icon: Send,
      template: t`Je souhaite recevoir les événements de publication par webhook pour synchroniser ma communauté et mes outils internes.`,
    },
  ] as const;

export function DeveloperRequestForm({ rejected = false }: { rejected?: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [projectUrl, setProjectUrl] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const finalReason = projectUrl.trim()
      ? `${reason.trim()}\n\nLien du projet : ${projectUrl.trim()}`
      : reason.trim();

    if (finalReason.length < 10) {
      toast.error(t`Décrivez votre cas d'usage en au moins 10 caractères.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitApiApplicationAction(finalReason);
      if (!res.ok) {
        toast.error(res.error?.message || t`Impossible d'envoyer la demande.`);
        return;
      }
      toast.success(t`Votre demande d'accès a bien été envoyée.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t`Impossible d'envoyer la demande.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="demande" className="scroll-mt-24">
      <StudioSection
        title={rejected ? t`Soumettre une nouvelle demande` : t`Demander l'accès`}
        icon={Send}
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">{t`Cas d’usage rapides`}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {APPLICATION_PRESETS().map((preset) => {
                const Icon = preset.icon;
                const selected = selectedPreset === preset.id;

                return (
                  <Button
                    key={preset.id}
                    variant="ghost"
                    block
                    onClick={() => {
                      setSelectedPreset(preset.id);
                      setReason(preset.template);
                    }}
                    className={
                      selected
                        ? 'items-start justify-start gap-2.5 rounded-lg border border-primary/40 bg-primary/5 p-3 text-left hover:bg-primary/5 [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! '
                        : 'items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-3 text-left hover:border-border hover:bg-muted/40 h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal '
                    }
                  >
                    <span
                      className={
                        selected
                          ? 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-primary bg-primary text-primary-foreground'
                          : 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground'
                      }
                    >
                      <Icon className="size-3.5!" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {preset.title}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {preset.subtitle}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <StudioField
            label={
              <>
                {t`Votre projet ou intégration`} <span className="text-primary">*</span>
              </>
            }
            hint={t`Décrivez les données utilisées et la façon dont vous comptez appeler l’API.`}
            counter={`${reason.trim().length} car. (min 10)`}
            htmlFor="developer-reason"
          >
            <Textarea
              id="developer-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t`Décrivez votre projet, les endpoints utiles et votre stack…`}
              required
            />
          </StudioField>

          <StudioField
            label={t`Lien du site ou du dépôt (optionnel)`}
            hint={t`Un lien public aide l’équipe à comprendre le contexte.`}
            htmlFor="developer-project-url"
          >
            <Input
              className=" h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
              id="developer-project-url"
              type="url"
              value={projectUrl}
              onChange={(event) => setProjectUrl(event.target.value)}
              placeholder={t`https://mon-projet.com ou https://github.com/…`}
            />
          </StudioField>

          <div className="flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {t`La demande est examinée sous 24 h ouvrées.`}
            </p>
            <Button
              type="submit"
              variant="solid"
              tone="brand"
              size="sm"
              disabled={isSubmitting || reason.trim().length < 10}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Send />}
              {isSubmitting ? t`Envoi…` : t`Envoyer ma demande`}
            </Button>
          </div>
        </form>
      </StudioSection>
    </div>
  );
}
