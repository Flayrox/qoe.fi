'use client';

import React, { useRef } from 'react';
import {
  AlertTriangle,
  AtSign,
  BarChart2,
  Calendar as CalendarIcon,
  Globe,
  Image,
  Loader2,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { Calendar } from '@qoe/ui/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@qoe/ui/ui/popover';
import { TimePickerInput } from '@qoe/ui/ui/time-picker-input';
import { CHAR_LIMIT } from './composer-text';

interface ComposerToolbarProps {
  postText: string;
  imagesCount: number;
  currentLength: number;
  charsRemaining: number;
  isOverLimit: boolean;
  isPublishable: boolean;
  isSubmitting: boolean;
  isReply: boolean;
  threadNodesCount: number;

  visibility: string;
  onVisibilityChange: (visibility: string) => void;
  showVisibilityDropdown: boolean;
  onShowVisibilityDropdownChange: (open: boolean) => void;

  replyRestriction: string;
  onReplyRestrictionChange: (restriction: string) => void;
  showReplyRestrictionDropdown: boolean;
  onShowReplyRestrictionDropdownChange: (open: boolean) => void;

  isScheduled: boolean;
  onIsScheduledChange: (scheduled: boolean) => void;
  scheduledDate: Date | undefined;
  onScheduledDateChange: (date: Date | undefined) => void;
  showScheduleDropdown: boolean;
  onShowScheduleDropdownChange: (open: boolean) => void;

  isTriggerWarning: boolean;
  onIsTriggerWarningChange: (enabled: boolean) => void;
  triggerWarning: string;
  onTriggerWarningChange: (reason: string) => void;
  showWarningDropdown: boolean;
  onShowWarningDropdownChange: (open: boolean) => void;

  showPollEditor: boolean;
  onTogglePollEditor: () => void;

  showDraftPopover: boolean;
  onShowDraftPopoverChange: (open: boolean) => void;
  onOpenDrafts: () => void;
  onSaveDraft: (e: React.MouseEvent<HTMLButtonElement>) => void;

  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAddThreadNode: () => void;
}

export function ComposerToolbar({
  postText,
  imagesCount,
  currentLength,
  charsRemaining,
  isOverLimit,
  isPublishable,
  isSubmitting,
  isReply,
  threadNodesCount,
  visibility,
  onVisibilityChange,
  showVisibilityDropdown,
  onShowVisibilityDropdownChange,
  replyRestriction,
  onReplyRestrictionChange,
  showReplyRestrictionDropdown,
  onShowReplyRestrictionDropdownChange,
  isScheduled,
  onIsScheduledChange,
  scheduledDate,
  onScheduledDateChange,
  showScheduleDropdown,
  onShowScheduleDropdownChange,
  isTriggerWarning,
  onIsTriggerWarningChange,
  triggerWarning,
  onTriggerWarningChange,
  showWarningDropdown,
  onShowWarningDropdownChange,
  showPollEditor,
  onTogglePollEditor,
  showDraftPopover,
  onShowDraftPopoverChange,
  onOpenDrafts,
  onSaveDraft,
  onImageUpload,
  onAddThreadNode,
}: ComposerToolbarProps) {
  const hourRef = useRef<HTMLInputElement>(null);
  const minuteRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]/60 text-xs">
        <Popover
          open={showReplyRestrictionDropdown}
          onOpenChange={onShowReplyRestrictionDropdownChange}
        >
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  'px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold h-[auto] hover:bg-transparent',
                  replyRestriction !== 'everyone'
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
                title={t`Qui peut répondre`}
              >
                <Globe className="w-3 h-3 text-primary" />
                <span>
                  {replyRestriction === 'everyone' && t`Tout le monde peut répondre`}
                  {replyRestriction === 'subscribers' && t`Abonnés uniquement`}
                  {replyRestriction === 'following' && t`Personnes suivies`}
                  {replyRestriction === 'mentioned' && t`Personnes mentionnées`}
                </span>
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="w-56 p-1.5 space-y-0.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
          >
            <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Qui peut répondre ?
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                onReplyRestrictionChange('everyone');
                onShowReplyRestrictionDropdownChange(false);
              }}
              className={cn(
                'w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-2 cursor-pointer h-[auto] hover:bg-transparent',
                replyRestriction === 'everyone'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Tout le monde</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onReplyRestrictionChange('subscribers');
                onShowReplyRestrictionDropdownChange(false);
              }}
              className={cn(
                'w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-2 cursor-pointer h-[auto] hover:bg-transparent',
                replyRestriction === 'subscribers'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>{t`Abonnés uniquement`}</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onReplyRestrictionChange('following');
                onShowReplyRestrictionDropdownChange(false);
              }}
              className={cn(
                'w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-2 cursor-pointer h-[auto] hover:bg-transparent',
                replyRestriction === 'following'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Personnes suivies</span>
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onReplyRestrictionChange('mentioned');
                onShowReplyRestrictionDropdownChange(false);
              }}
              className={cn(
                'w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors flex items-center gap-2 cursor-pointer h-[auto] hover:bg-transparent',
                replyRestriction === 'mentioned'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              <AtSign className="w-3.5 h-3.5" />
              <span>{t`Personnes mentionnées`}</span>
            </Button>
          </PopoverContent>
        </Popover>

        <Popover open={showVisibilityDropdown} onOpenChange={onShowVisibilityDropdownChange}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                className={cn(
                  'px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-[11px] font-semibold h-[auto] hover:bg-transparent [&_svg]:size-3',
                  visibility !== 'public'
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <Globe className="w-3 h-3" />
                <span>{visibility === 'public' ? 'Public' : 'Followers'}</span>
              </Button>
            }
          />
          <PopoverContent
            align="start"
            className="w-44 p-1.5 space-y-0.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
          >
            <Button
              variant="ghost"
              onClick={() => {
                onVisibilityChange('public');
                onShowVisibilityDropdownChange(false);
              }}
              className={cn(
                'w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer h-[auto] hover:bg-transparent',
                visibility === 'public'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              Tout le monde
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onVisibilityChange('followers');
                onShowVisibilityDropdownChange(false);
              }}
              className={cn(
                'w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors cursor-pointer h-[auto] hover:bg-transparent',
                visibility === 'followers'
                  ? 'bg-accent text-accent-foreground font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
              )}
            >
              Followers uniquement
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-1.5">
          <label
            className="cursor-pointer p-2 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center active:scale-95"
            title="Ajouter des images"
          >
            <Image className="w-4 h-4" />
            <Input
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={onImageUpload}
              disabled={isSubmitting || imagesCount >= 4}
            />
          </label>

          <Button
            variant="ghost"
            onClick={onTogglePollEditor}
            className={cn(
              'p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95 h-[auto] hover:bg-transparent [&_svg]:size-4',
              showPollEditor
                ? 'bg-primary/15 border-primary text-primary font-bold'
                : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
            title="Ajouter un sondage"
          >
            <BarChart2 className="w-4 h-4" />
          </Button>

          <Popover
            open={showScheduleDropdown}
            onOpenChange={(open: boolean) => {
              onShowScheduleDropdownChange(open);
              if (open && !scheduledDate) {
                onScheduledDateChange(new Date());
                onIsScheduledChange(true);
              }
            }}
          >
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  className={cn(
                    'p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95 h-[auto] hover:bg-transparent [&_svg]:size-4',
                    isScheduled
                      ? 'bg-primary/15 border-primary text-primary font-bold'
                      : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                  title="Planifier"
                >
                  <CalendarIcon className="w-4 h-4" />
                </Button>
              }
            />
            <PopoverContent
              align="start"
              className="w-auto p-3.5 flex flex-col gap-3.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
            >
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground block font-bold">
                  Date de publication
                </span>
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={(dateVal: Date | undefined) => {
                    if (!dateVal) {
                      onScheduledDateChange(undefined);
                      return;
                    }
                    if (!scheduledDate) {
                      const now = new Date();
                      const newDate = new Date(dateVal);
                      newDate.setHours(now.getHours());
                      newDate.setMinutes(now.getMinutes());
                      onScheduledDateChange(newDate);
                    } else {
                      const newDate = new Date(dateVal);
                      newDate.setHours(scheduledDate.getHours());
                      newDate.setMinutes(scheduledDate.getMinutes());
                      newDate.setSeconds(scheduledDate.getSeconds());
                      onScheduledDateChange(newDate);
                    }
                    onIsScheduledChange(true);
                  }}
                  disabled={{ before: new Date() }}
                  className="rounded-xl border border-border bg-card"
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs gap-4">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                  Heure
                </span>
                <div className="flex items-center gap-1">
                  <TimePickerInput
                    picker="hours"
                    date={scheduledDate}
                    setDate={onScheduledDateChange}
                    ref={hourRef}
                    onRightFocus={() => minuteRef.current?.focus()}
                    className="w-10 h-7 text-xs border-border bg-muted/40 rounded-lg text-center focus:border-primary outline-none"
                  />
                  <span className="text-muted-foreground">:</span>
                  <TimePickerInput
                    picker="minutes"
                    date={scheduledDate}
                    setDate={onScheduledDateChange}
                    ref={minuteRef}
                    onLeftFocus={() => hourRef.current?.focus()}
                    className="w-10 h-7 text-xs border-border bg-muted/40 rounded-lg text-center focus:border-primary outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
                <Button
                  variant="ghost"
                  onClick={() => {
                    onIsScheduledChange(false);
                    onScheduledDateChange(undefined);
                    onShowScheduleDropdownChange(false);
                  }}
                  className="px-3 py-1.5 border border-border rounded-lg text-[10px] font-semibold hover:bg-muted text-muted-foreground h-[auto]"
                >
                  Réinitialiser
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onShowScheduleDropdownChange(false)}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[10px] font-bold h-[auto] hover:bg-transparent"
                >
                  Valider
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={showWarningDropdown} onOpenChange={onShowWarningDropdownChange}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  className={cn(
                    'p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center text-xs active:scale-95 h-[auto] hover:bg-transparent [&_svg]:size-4',
                    isTriggerWarning
                      ? 'bg-highlight/10 border-highlight text-highlight font-bold'
                      : 'border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  )}
                  title="Avertissement de contenu"
                >
                  <AlertTriangle className="w-4 h-4" />
                </Button>
              }
            />
            <PopoverContent
              align="start"
              className="w-60 p-3.5 space-y-3 bg-popover border border-border rounded-xl shadow-xl z-[150] text-xs"
            >
              <label className="flex items-center justify-between cursor-pointer text-xs text-foreground font-medium">
                <span>Masquer le contenu</span>
                <Input
                  type="checkbox"
                  checked={isTriggerWarning}
                  onChange={(e) => onIsTriggerWarningChange(e.target.checked)}
                  className="accent-primary cursor-pointer h-[auto] w-auto rounded-none border-0 bg-transparent p-0"
                />
              </label>
              {isTriggerWarning && (
                <Input
                  type="text"
                  placeholder="Motif (ex: Spoilers, Sensible)"
                  value={triggerWarning}
                  onChange={(e) => onTriggerWarningChange(e.target.value)}
                  className="w-full bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary mt-1.5 h-[auto]"
                />
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {postText.length > 0 && (
            <div className="flex items-center gap-1 pr-1">
              {charsRemaining <= 30 && (
                <span
                  className={cn(
                    'text-[10px] font-mono font-bold transition-colors',
                    isOverLimit ? 'text-destructive-text' : 'text-highlight'
                  )}
                >
                  {charsRemaining}
                </span>
              )}
              <svg className="w-4 h-4 transform -rotate-90">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  className="stroke-border/60"
                  strokeWidth="2"
                  fill="transparent"
                />
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  className={cn(
                    'transition-all duration-150',
                    isOverLimit
                      ? 'stroke-destructive'
                      : charsRemaining <= 30
                        ? 'stroke-amber-500'
                        : 'stroke-primary'
                  )}
                  strokeWidth="2"
                  strokeDasharray={2 * Math.PI * 6}
                  strokeDashoffset={
                    2 * Math.PI * 6 - (currentLength / CHAR_LIMIT) * (2 * Math.PI * 6)
                  }
                  strokeLinecap="round"
                  fill="transparent"
                />
              </svg>
            </div>
          )}

          <Button
            variant="ghost"
            onClick={onAddThreadNode}
            disabled={isSubmitting}
            className="p-2 rounded-xl border border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all cursor-pointer flex items-center justify-center active:scale-95 shrink-0 h-[auto] [&_svg]:size-4"
            title={t`Ajouter une autre pensée à ce fil de discussion`}
          >
            <Plus className="w-4 h-4 text-primary" />
          </Button>

          <Popover open={showDraftPopover} onOpenChange={onShowDraftPopoverChange}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  className="px-2.5 py-1.5 border border-border/60 rounded-xl text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer outline-none transition-colors h-[auto]"
                >
                  Brouillons
                </Button>
              }
            />
            <PopoverContent
              align="end"
              className="w-56 p-1.5 space-y-0.5 bg-popover border border-border rounded-xl shadow-xl z-[150]"
            >
              <Button
                variant="ghost"
                disabled={!postText.trim() && imagesCount === 0}
                onClick={(e) => {
                  onShowDraftPopoverChange(false);
                  onSaveDraft(e);
                }}
                className="w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors hover:bg-muted/60 text-foreground disabled:pointer-events-none cursor-pointer h-[auto]"
              >
                Enregistrer le brouillon de fil
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  onShowDraftPopoverChange(false);
                  onOpenDrafts();
                }}
                className="w-full text-left justify-start px-2.5 py-1.5 rounded-lg text-[12px] transition-colors hover:bg-muted/60 text-foreground cursor-pointer h-[auto]"
              >
                Voir tous les brouillons
              </Button>
            </PopoverContent>
          </Popover>

          <Button
            type="submit"
            variant="ghost"
            disabled={!isPublishable || isSubmitting || isOverLimit}
            className="bg-primary text-primary-foreground hover:opacity-95 hover:bg-primary disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground transition-all duration-150 px-4 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1.5 cursor-pointer outline-none shadow-sm shrink-0 active:scale-[0.98] h-[auto] [&_svg]:size-3"
          >
            {isSubmitting ? (
              <>
                Envoi... <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </>
            ) : (
              <>
                {isReply ? 'Répondre' : threadNodesCount > 1 ? 'Tout publier' : 'Publier'}{' '}
                <Send className="w-3 h-3" />
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
