'use client';

import React, { useMemo } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { AlertTriangle, ArrowRight, CheckCircle2, Info, ShieldCheck, XCircle } from 'lucide-react';
import { t } from '@lingui/core/macro';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { Button } from '@qoe/ui/button';
import { cn } from '@qoe/utils';
import {
  analyzePublishReadiness,
  type PreflightCheck,
  type PreflightStatus,
} from '../lib/preflight';

export interface PublishReadinessDialogProps {
  open: boolean;
  onClose: () => void;
  editor: Editor;
  title: string;
  slug: string;
  imageUrl?: string | null;
  coverAlt?: string;
  coverDecorative?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  isPremium?: boolean;
  published?: boolean;
  onFixAlt?: () => void;
  onFixCoverAlt?: () => void;
  onFocusTitle?: () => void;
  onFocusContent?: () => void;
  onOpenSettings?: () => void;
}

const STATUS_ICON: Record<PreflightStatus, React.ElementType> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const STATUS_TONE: Record<PreflightStatus, string> = {
  ok: 'text-success-text',
  warning: 'text-highlight',
  error: 'text-destructive-text',
  info: 'text-muted-foreground',
};

function actionForCheck(
  check: PreflightCheck,
  props: PublishReadinessDialogProps
): (() => void) | undefined {
  switch (check.id) {
    case 'title':
      return props.onFocusTitle;
    case 'content':
      return props.onFocusContent;
    case 'images':
      return check.status === 'warning' ? props.onFixAlt : undefined;
    case 'cover':
      return check.status === 'warning' ? props.onFixCoverAlt : undefined;
    case 'seoTitle':
    case 'seoDescription':
      return check.status === 'warning' ? props.onOpenSettings : undefined;
    default:
      return undefined;
  }
}

/**
 * Récapitulatif avant publication. Aucun appel réseau : le panneau agrège ce
 * que l'auteur peut corriger localement. Les droits, la revue et le paywall
 * restent vérifiés par l'API au moment de l'enregistrement.
 */
export function PublishReadinessDialog(props: PublishReadinessDialogProps) {
  const { open, onClose, editor } = props;

  const contentHtml = useEditorState({
    editor,
    selector: ({ editor: current }) => current.getHTML(),
  });

  const result = useMemo(
    () =>
      analyzePublishReadiness({
        title: props.title,
        slug: props.slug,
        contentHtml,
        imageUrl: props.imageUrl,
        coverAlt: props.coverAlt,
        coverDecorative: props.coverDecorative,
        seoTitle: props.seoTitle,
        seoDescription: props.seoDescription,
        isPremium: props.isPremium,
        published: props.published,
      }),
    [
      contentHtml,
      props.title,
      props.slug,
      props.imageUrl,
      props.coverAlt,
      props.coverDecorative,
      props.seoTitle,
      props.seoDescription,
      props.isPremium,
      props.published,
    ]
  );

  const summary =
    result.errors > 0
      ? {
          label: t`${result.errors} point${result.errors === 1 ? '' : 's'} à corriger`,
          className: 'border-destructive/25 bg-destructive/10 text-destructive-text',
          icon: XCircle,
        }
      : result.warnings > 0
        ? {
            label: t`Prêt, avec ${result.warnings} avertissement${result.warnings === 1 ? '' : 's'}`,
            className: 'border-highlight/25 bg-highlight/10 text-highlight',
            icon: AlertTriangle,
          }
        : {
            label: t`Prêt à publier`,
            className: 'border-success/25 bg-success/10 text-success-text',
            icon: ShieldCheck,
          };

  const SummaryIcon = summary.icon;

  const runAction = (action: () => void) => {
    onClose();
    requestAnimationFrame(action);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()} size="lg">
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            {t`Avant de publier`}
          </DialogTitle>
          <DialogDescription>
            {t`Derniers contrôles de forme. Vous pouvez publier malgré les avertissements ; les erreurs doivent être corrigées.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3 py-1">
          <div
            className={cn(
              'flex items-center gap-2 rounded-control border px-3 py-2 text-xs font-semibold',
              summary.className
            )}
            role="status"
            aria-live="polite"
          >
            <SummaryIcon className="size-4 shrink-0" aria-hidden />
            {summary.label}
          </div>

          <ul className="space-y-1.5">
            {result.checks.map((check) => {
              const Icon = STATUS_ICON[check.status];
              const action = actionForCheck(check, props);
              return (
                <li
                  key={check.id}
                  className="flex items-start gap-2.5 rounded-control border border-border/45 bg-muted/15 px-3 py-2"
                >
                  <Icon
                    className={cn('mt-0.5 size-4 shrink-0', STATUS_TONE[check.status])}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{check.label}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {check.detail}
                    </p>
                  </div>
                  {action ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="shrink-0"
                      onClick={() => runAction(action)}
                    >
                      {t`Corriger`}
                      <ArrowRight className="size-3" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {props.isPremium ? (
            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t`Article Premium : vérifiez que l’extrait gratuit donne envie de s’abonner.`}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          {props.onOpenSettings ? (
            <Button variant="ghost" size="sm" onClick={() => runAction(props.onOpenSettings!)}>
              {t`Ouvrir les options`}
            </Button>
          ) : null}
          <Button variant="solid" tone="brand" size="sm" onClick={onClose}>
            {t`Fermer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
