'use client';

import { CalendarClock } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { DatePicker, TimeField } from '@qoe/ui/date-picker';
import { formatScheduledAt } from '../lib/datetime';
import {
  applyScheduleDate,
  applyScheduleTime,
  parseScheduleDraft,
  schedulePresets,
} from '../lib/schedule-draft';

export interface ArticleScheduleSectionProps {
  status: string;
  scheduledAt: string | null;
  scheduleDraft: string;
  timeZoneLabel: string;
  onScheduleDraftChange: (value: string) => void;
  onSchedule: () => void;
  onClearSchedule: () => void;
  schedulePending?: boolean;
}

/** « dans 3 h », « dans 2 j » — null si la date est passée ou invalide. */
function scheduleCountdown(iso: string): string | null {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diffMinutes = Math.round((target - Date.now()) / 60000);
  if (diffMinutes <= 0) return null;
  if (diffMinutes < 60) return t`Publication dans ${diffMinutes} min.`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return t`Publication dans ${hours} h.`;
  return t`Publication dans ${Math.round(hours / 24)} j.`;
}

export function ArticleScheduleSection({
  status,
  scheduledAt,
  scheduleDraft,
  timeZoneLabel,
  onScheduleDraftChange,
  onSchedule,
  onClearSchedule,
  schedulePending = false,
}: ArticleScheduleSectionProps) {
  const parsedSchedule = parseScheduleDraft(scheduleDraft);
  const scheduledLabel = formatScheduledAt(scheduledAt);

  return (
    <section
      className="space-y-3 border-t border-border/40 pt-4"
      data-testid="article-schedule-section"
    >
      <h4 className="flex items-center gap-2 font-sans text-xs font-bold tracking-wider text-muted-foreground uppercase">
        <CalendarClock className="size-3.5 stroke-[1.5] text-primary" aria-hidden />
        {t`Date de publication`}
      </h4>

      {status === 'PUBLISHED' && !scheduledAt ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t`Cet article est en ligne. Le programmer le rendrait invisible jusqu'à la date choisie : dépubliez-le d'abord si vous voulez le repositionner dans le temps.`}
        </p>
      ) : (
        <>
          {scheduledAt && scheduledLabel ? (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold tracking-wider text-highlight uppercase">
                {t`Programmé`}
              </p>
              <p className="mt-0.5 text-sm font-medium text-foreground">{scheduledLabel}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {scheduleCountdown(scheduledAt) ??
                  t`Publication automatique à cette heure (${timeZoneLabel}).`}
              </p>
            </div>
          ) : (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {t`Choisissez une date : l'article sera publié automatiquement à ce moment (heure locale ${timeZoneLabel}).`}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {schedulePresets().map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                size="xs"
                onClick={() => onScheduleDraftChange(preset.value)}
                disabled={schedulePending}
                className="rounded-full"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-1.5">
            <DatePicker
              label={t`Date`}
              value={parsedSchedule.date}
              onChange={(date) => onScheduleDraftChange(applyScheduleDate(scheduleDraft, date))}
              isDisabled={schedulePending}
              className="min-w-[9rem] flex-1"
            />
            <TimeField
              label={t`Heure`}
              value={parsedSchedule.time}
              onChange={(time) => onScheduleDraftChange(applyScheduleTime(scheduleDraft, time))}
              isDisabled={schedulePending}
              className="w-[7.5rem]"
            />
            <Button
              variant="solid"
              tone="vivid"
              size="sm"
              onClick={onSchedule}
              disabled={schedulePending}
              loading={schedulePending}
              className="shrink-0"
            >
              {schedulePending ? t`Programmation…` : scheduledAt ? t`Reporter` : t`Programmer`}
            </Button>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground/80">
            {t`Tant que la date n'est pas passée, vous pouvez la déplacer autant de fois que nécessaire : chaque report est conservé dans l'historique.`}
          </p>

          {scheduledAt && (
            <Button
              variant="ghost"
              tone="danger"
              size="xs"
              onClick={onClearSchedule}
              disabled={schedulePending}
              className="h-auto px-0 py-0.5 text-[11px] hover:bg-transparent hover:underline"
            >
              {t`Annuler la programmation`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
