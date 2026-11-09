'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bulkUpdateArticlesAction,
  getArticleByIdAction,
  getWorkspacesAction,
  saveArticleAction,
  scheduleArticleAction,
  setArticleAllowDownloadAction,
  transferArticleAction,
  unpublishArticleAction,
} from '@qoe/sdk/actions/articles';
import { toast } from '@qoe/ui/toast';
import { t } from '@lingui/core/macro';
import {
  articleSettingsFingerprint,
  buildArticleSettingsDraft,
  buildArticleSettingsSavePayload,
  parseFutureScheduleDraft,
  type ArticleSettingsDraft,
  type ArticleWorkspaceOption,
} from '../lib/article-settings';
import { toDateTimeLocalValue } from '../lib/datetime';

type SettingsLoadState = 'loading' | 'ready' | 'error';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useArticleSettings({
  articleId,
  onSaved,
}: {
  articleId: string;
  onSaved?: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<ArticleSettingsDraft | null>(null);
  const [workspaces, setWorkspaces] = useState<ArticleWorkspaceOption[]>([]);
  const [loadState, setLoadState] = useState<SettingsLoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [downloadSaving, setDownloadSaving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [crosspostSaving, setCrosspostSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [baselineFingerprint, setBaselineFingerprint] = useState('');

  const baselineRef = useRef<ArticleSettingsDraft | null>(null);
  const requestRef = useRef(0);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  const load = useCallback(async () => {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoadState('loading');
    setError(null);
    setDraft(null);

    try {
      const [res, wsRes] = await Promise.all([
        getArticleByIdAction(articleId),
        getWorkspacesAction(),
      ]);
      if (request !== requestRef.current) return;
      if (!res.ok || !res.data) {
        throw new Error(res.ok ? t`Article introuvable.` : res.error.message);
      }

      if (wsRes.ok && wsRes.data) {
        setWorkspaces([wsRes.data.personal, ...(wsRes.data.medias ?? [])]);
      }

      const next = buildArticleSettingsDraft(res.data);
      baselineRef.current = next;
      setDraft(next);
      setBaselineFingerprint(articleSettingsFingerprint(next));
      setLastSavedAt(null);
      setLoadState('ready');
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(getErrorMessage(err, t`Impossible de charger les paramètres de l'article.`));
      setLoadState('error');
    }
  }, [articleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(
    () => (draft ? articleSettingsFingerprint(draft) !== baselineFingerprint : false),
    [draft, baselineFingerprint]
  );

  const patchDraft = useCallback((patch: Partial<ArticleSettingsDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const resetDraft = useCallback(() => {
    if (!baselineRef.current) return;
    setDraft({
      ...baselineRef.current,
      attributions: [...baselineRef.current.attributions],
    });
    setError(null);
  }, []);

  const syncBaseline = useCallback((patch: Partial<ArticleSettingsDraft>) => {
    if (!baselineRef.current) return;
    const nextBaseline = { ...baselineRef.current, ...patch };
    baselineRef.current = nextBaseline;
    setBaselineFingerprint(articleSettingsFingerprint(nextBaseline));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    if (!draft || saving) return false;
    setSaving(true);
    setError(null);

    try {
      const res = await saveArticleAction(buildArticleSettingsSavePayload(draft));
      if (!res.ok) throw new Error(res.error.message);

      baselineRef.current = draft;
      setBaselineFingerprint(articleSettingsFingerprint(draft));
      setLastSavedAt(new Date());
      await onSavedRef.current?.();
      toast.success(t`Paramètres de l'article enregistrés.`);
      return true;
    } catch (err) {
      const message = getErrorMessage(err, t`Échec de l'enregistrement.`);
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, saving]);

  const schedule = useCallback(async (): Promise<boolean> => {
    if (!draft || scheduling) return false;
    const { date, reason } = parseFutureScheduleDraft(draft.scheduleDraft);
    if (!date) {
      setError(
        reason === 'past'
          ? t`La date de programmation doit être dans le futur.`
          : t`Choisissez une date de programmation.`
      );
      return false;
    }

    setScheduling(true);
    setError(null);
    try {
      const iso = date.toISOString();
      const res = await scheduleArticleAction({ id: draft.id, scheduledAt: iso });
      if (!res.ok) throw new Error(res.error.message);

      const patch: Partial<ArticleSettingsDraft> = {
        scheduledAt: iso,
        scheduleDraft: toDateTimeLocalValue(iso),
        status: 'SCHEDULED',
        published: false,
      };
      setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
      syncBaseline(patch);
      setLastSavedAt(new Date());
      await onSavedRef.current?.();
      toast.success(t`Publication programmée`);
      return true;
    } catch (err) {
      const message = getErrorMessage(err, t`Échec de la programmation.`);
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setScheduling(false);
    }
  }, [draft, scheduling, syncBaseline]);

  const clearSchedule = useCallback(async (): Promise<boolean> => {
    if (!draft || scheduling) return false;
    setScheduling(true);
    setError(null);
    try {
      const res = await scheduleArticleAction({ id: draft.id, scheduledAt: null });
      if (!res.ok) throw new Error(res.error.message);

      const patch: Partial<ArticleSettingsDraft> = {
        scheduledAt: null,
        scheduleDraft: '',
        status: 'DRAFT',
        published: false,
      };
      setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
      syncBaseline(patch);
      setLastSavedAt(new Date());
      await onSavedRef.current?.();
      toast.success(t`Programmation annulée`);
      return true;
    } catch (err) {
      const message = getErrorMessage(err, t`Échec de l'annulation.`);
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setScheduling(false);
    }
  }, [draft, scheduling, syncBaseline]);

  const unpublish = useCallback(async (): Promise<boolean> => {
    if (!draft) return false;
    setError(null);
    try {
      const res = await unpublishArticleAction(draft.id);
      if (!res.ok) throw new Error(res.error.message);

      const patch: Partial<ArticleSettingsDraft> = {
        published: false,
        status: 'DRAFT',
        scheduledAt: null,
        scheduleDraft: '',
      };
      setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
      syncBaseline(patch);
      setLastSavedAt(new Date());
      await onSavedRef.current?.();
      toast.success(t`Article dépublié.`);
      return true;
    } catch (err) {
      const message = getErrorMessage(err, t`Échec de la dépublication.`);
      setError(message);
      toast.error(message);
      return false;
    }
  }, [draft, syncBaseline]);

  const toggleDownload = useCallback(
    async (value: boolean) => {
      if (!draft || downloadSaving) return;
      setDownloadSaving(true);
      setError(null);
      try {
        const res = await setArticleAllowDownloadAction({
          articleId: draft.id,
          allowDownload: value,
        });
        if (!res.ok) throw new Error(res.error.message);

        const allowDownload = res.data.allowDownload;
        setDraft((prev) => (prev ? { ...prev, allowDownload } : prev));
        syncBaseline({ allowDownload });
        toast.success(allowDownload ? t`Téléchargement autorisé` : t`Téléchargement refusé`);
      } catch (err) {
        const message = getErrorMessage(err, t`Action impossible`);
        setError(message);
        toast.error(message);
      } finally {
        setDownloadSaving(false);
      }
    },
    [draft, downloadSaving, syncBaseline]
  );

  const transferPublication = useCallback(
    async (targetPublicationId: string) => {
      if (!draft || transferring || !targetPublicationId) return false;
      setTransferring(true);
      setError(null);
      try {
        const res = await transferArticleAction({
          articleId: draft.id,
          targetPublicationId,
          showOnPersonalProfile: draft.showOnPersonalProfile,
        });
        if (!res.ok || !res.data) {
          throw new Error(res.ok ? t`Échec du transfert.` : res.error.message);
        }

        const next = buildArticleSettingsDraft(res.data);
        baselineRef.current = next;
        setDraft(next);
        setBaselineFingerprint(articleSettingsFingerprint(next));
        setLastSavedAt(new Date());
        await onSavedRef.current?.();
        const destName = res.data.publication?.name || t`la publication sélectionnée`;
        toast.success(t`Article transféré vers ${destName}.`);
        return true;
      } catch (err) {
        const message = getErrorMessage(err, t`Échec du transfert de l'article.`);
        setError(message);
        toast.error(message);
        return false;
      } finally {
        setTransferring(false);
      }
    },
    [draft, transferring]
  );

  const toggleShowOnPersonalProfile = useCallback(
    async (value: boolean) => {
      if (!draft || crosspostSaving) return;
      setCrosspostSaving(true);
      setError(null);
      setDraft((prev) => (prev ? { ...prev, showOnPersonalProfile: value } : prev));
      try {
        const res = await bulkUpdateArticlesAction({
          ids: [draft.id],
          showOnPersonalProfile: value,
        });
        if (!res.ok || res.data.failed.includes(draft.id)) {
          throw new Error(!res.ok ? res.error.message : t`Action impossible`);
        }
        syncBaseline({ showOnPersonalProfile: value });
        setLastSavedAt(new Date());
        await onSavedRef.current?.();
        toast.success(
          value
            ? t`Affiché sur votre profil et blog personnel`
            : t`Masqué de votre profil et blog personnel`
        );
      } catch (err) {
        setDraft((prev) => (prev ? { ...prev, showOnPersonalProfile: !value } : prev));
        const message = getErrorMessage(err, t`Action impossible`);
        setError(message);
        toast.error(message);
      } finally {
        setCrosspostSaving(false);
      }
    },
    [crosspostSaving, draft, syncBaseline]
  );

  return {
    draft,
    workspaces,
    loadState,
    error,
    saving,
    scheduling,
    downloadSaving,
    transferring,
    crosspostSaving,
    lastSavedAt,
    dirty,
    patchDraft,
    resetDraft,
    save,
    schedule,
    clearSchedule,
    unpublish,
    toggleDownload,
    transferPublication,
    toggleShowOnPersonalProfile,
    retry: load,
  };
}
