'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { t } from '@lingui/core/macro';
import { useI18n } from '@qoe/i18n';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import {
  Accessibility,
  Bell,
  Check,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  Lock,
  LogOut,
  ShieldCheck,
  Palette,
  Shield,
  Trash2,
  UserRound,
  X,
  Plus,
} from 'lucide-react';
import { NotificationSettingsForm } from '@/components/notifications/NotificationSettingsForm';
import SecuritySettings from './SecuritySettings';
import {
  cancelAccountDeletionAction,
  changePasswordAction,
  exportAccountDataAction,
  logoutAccountAction,
  requestAccountDeletionAction,
  toggleMutedWordAction,
  updateAccountSettingsAction,
  getBlockedUsersAction,
  getMutedUsersAction,
  toggleBlockedUserAction,
  toggleMutedUserAction,
  type AccountSettingsPatch,
} from './actions';

export type AccountSettingsData = Awaited<
  ReturnType<typeof import('./actions').getAccountSettingsAction>
>;

type SettingsSection = 'account' | 'notifications' | 'privacy' | 'appearance' | 'data' | 'security';

// Libellés résolus au rendu pour suivre la langue active (tableau au module = figé).
const sections: Array<{ id: SettingsSection; label: () => string; icon: typeof UserRound }> = [
  { id: 'account', label: () => t`Compte`, icon: UserRound },
  { id: 'notifications', label: () => t`Notifications`, icon: Bell },
  { id: 'privacy', label: () => t`Confidentialité`, icon: Shield },
  { id: 'appearance', label: () => t`Apparence & lecture`, icon: Palette },
  { id: 'data', label: () => t`Données & sécurité`, icon: Lock },
  { id: 'security', label: () => t`Sécurité`, icon: ShieldCheck },
];

const roleLabel = (role: string): string => {
  if (role === 'user') return t`Lecteur`;
  if (role === 'creator') return t`Créateur`;
  if (role === 'admin') return t`Administrateur`;
  if (role === 'superadmin') return t`Super administrateur`;
  return role;
};

export default function AccountSettingsPage({
  initialData,
}: {
  initialData?: AccountSettingsData;
}) {
  // The server page wrapper supplies this in production; keeping a small loading
  // fallback makes the component easy to mount in isolated UI tests.
  const [data, setData] = useState<AccountSettingsData | null>(initialData || null);
  const pathname = usePathname();
  const router = useRouter();
  const sectionFromPath = pathname.match(/^\/settings(?:\/([^/]+))?/)?.[1] as
    SettingsSection | undefined;
  const [activeSection, setActiveSection] = useState<SettingsSection>(sectionFromPath ?? 'account');

  useEffect(() => {
    const nextSection = sectionFromPath ?? 'account';
    if (nextSection !== activeSection) setActiveSection(nextSection);
  }, [sectionFromPath, activeSection]);

  const navigateToSection = (section: SettingsSection) => {
    setActiveSection(section);
    router.push(section === 'account' ? '/settings' : `/settings/${section}`);
  };
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const i18n = useI18n();
  const locale = i18n.getLanguage() || 'fr';
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (activeSection !== 'privacy') return;
    Promise.all([getBlockedUsersAction(), getMutedUsersAction()])
      .then(([blocked, muted]) => setSocialUsers({ blocked: blocked.users, muted: muted.users }))
      .catch((error) => {
        showMessage(
          error instanceof Error ? error.message : t`Impossible de charger vos contrôles sociaux.`
        );
      });
  }, [activeSection]);

  const [deletionConfirmation, setDeletionConfirmation] = useState('');

  // Mots masqués (section Confidentialité).
  const [mutedWords, setMutedWords] = useState<string[]>(() => initialData?.mutedWords ?? []);
  const [mutedInput, setMutedInput] = useState('');
  const [socialUsers, setSocialUsers] = useState<{
    blocked: Array<{ id: string; username: string | null; name: string | null }>;
    muted: Array<{ id: string; username: string | null; name: string | null }>;
  }>({ blocked: [], muted: [] });

  // Sécurité / mot de passe.
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwMessage, setPwMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const showMessage = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(null), 3500);
  };

  const patchSettings = (patch: AccountSettingsPatch) => {
    if (!data) return;
    startTransition(async () => {
      try {
        const result = await updateAccountSettingsAction(patch);
        setData((current) => (current ? { ...current, settings: result.settings } : current));
        showMessage(t`Réglage enregistré.`);
      } catch (error) {
        showMessage(
          error instanceof Error ? error.message : t`Impossible d’enregistrer ce réglage.`
        );
      }
    });
  };

  const addMutedWord = () => {
    const word = mutedInput.trim();
    if (!word) return;
    startTransition(async () => {
      try {
        const res = await toggleMutedWordAction(word);
        setMutedWords((cur) =>
          res.muted
            ? [res.word, ...cur.filter((w) => w !== res.word)]
            : cur.filter((w) => w !== res.word)
        );
        setMutedInput('');
        showMessage(res.muted ? t`Mot masqué ajouté.` : t`Mot retiré de la liste.`);
      } catch (error) {
        showMessage(error instanceof Error ? error.message : t`Impossible de gérer ce mot masqué.`);
      }
    });
  };

  const removeMutedWord = (word: string) => {
    startTransition(async () => {
      try {
        const res = await toggleMutedWordAction(word);
        setMutedWords((cur) => cur.filter((w) => w !== res.word));
      } catch (error) {
        showMessage(error instanceof Error ? error.message : t`Impossible de retirer ce mot.`);
      }
    });
  };

  const changePassword = () => {
    if (pw.next !== pw.confirm) {
      setPwMessage({ type: 'err', text: t`Les mots de passe ne correspondent pas.` });
      return;
    }
    startTransition(async () => {
      try {
        await changePasswordAction(pw.current, pw.next);
        setPw({ current: '', next: '', confirm: '' });
        setPwMessage({ type: 'ok', text: t`Mot de passe mis à jour.` });
      } catch (error) {
        setPwMessage({
          type: 'err',
          text: error instanceof Error ? error.message : t`Impossible de changer le mot de passe.`,
        });
      }
    });
  };

  const exportData = () => {
    startTransition(async () => {
      try {
        const payload = await exportAccountDataAction();
        const blob = new Blob([payload], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `qoe-fi-export-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        showMessage(t`Export téléchargé.`);
      } catch (error) {
        showMessage(error instanceof Error ? error.message : t`Export impossible.`);
      }
    });
  };

  const cancelDeletion = () => {
    startTransition(async () => {
      try {
        await cancelAccountDeletionAction();
        setData((current) => (current ? { ...current, deletionRequest: null } : current));
        showMessage(t`Demande de suppression annulée.`);
      } catch (error) {
        showMessage(error instanceof Error ? error.message : t`Impossible d’annuler la demande.`);
      }
    });
  };

  const requestDeletion = () => {
    startTransition(async () => {
      try {
        await requestAccountDeletionAction(deletionConfirmation);
        setDeletionConfirmation('');
        setData((current) =>
          current
            ? {
                ...current,
                deletionRequest: {
                  id: 'local-pending',
                  status: 'PENDING',
                  requestedAt: new Date().toISOString(),
                },
              }
            : current
        );
        showMessage(t`Demande de suppression enregistrée.`);
      } catch (error) {
        showMessage(error instanceof Error ? error.message : t`Demande refusée.`);
      }
    });
  };

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl p-8 text-sm text-muted-foreground">
        {t`Chargement de vos réglages…`}
      </div>
    );
  }

  const settings = data.settings;
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <main className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8 pb-32 md:px-8">
      <aside className="hidden w-56 shrink-0 md:block">
        <div className="sticky top-8 space-y-5">
          <div>
            <Link
              href="/home"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              ← {t`Retour au feed`}
            </Link>
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{t`Réglages`}</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t`Votre compte, votre espace, vos règles.`}
            </p>
          </div>
          <nav className="space-y-1" aria-label={t`Sections des réglages`}>
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => navigateToSection(section.id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.7} />
                  {section.label()}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-5 md:hidden">
          <div>
            <Link href="/home" className="text-xs text-muted-foreground">
              ← {t`Retour au feed`}
            </Link>
            <h1 className="mt-3 text-2xl font-bold">{t`Réglages`}</h1>
          </div>
          <select
            value={activeSection}
            onChange={(event) => navigateToSection(event.target.value as SettingsSection)}
            className="rounded-lg border border-border bg-background px-2 py-2 text-xs"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label()}
              </option>
            ))}
          </select>
        </div>

        {message && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
            <Check className="h-4 w-4" /> {message}
          </div>
        )}

        {activeSection === 'security' && <SecuritySettings />}

        {activeSection === 'account' && (
          <SettingsPanel
            title={t`Compte`}
            description={t`Les informations de base et les accès à votre compte.`}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField label={t`Adresse email`} value={data.user.email} />
              <ReadOnlyField label={t`Type de compte`} value={roleLabel(data.user.role)} />
              <ReadOnlyField label={t`Membre depuis`} value={formatDate(data.user.createdAt)} />
              <ReadOnlyField label={t`Identifiant`} value={data.user.id.slice(0, 12) + '…'} />
            </div>

            <div className="rounded-xl border border-border/60 px-4 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <KeyRound className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t`Mot de passe`}</p>
                  <p className="text-xs text-muted-foreground">
                    {t`Mettez à jour le mot de passe de votre compte.`}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">{t`Nouveau mot de passe`}</span>
                  <input
                    type="password"
                    value={pw.next}
                    onChange={(event) => setPw({ ...pw, next: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium">{t`Confirmer le mot de passe`}</span>
                  <input
                    type="password"
                    value={pw.confirm}
                    onChange={(event) => setPw({ ...pw, confirm: event.target.value })}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  />
                </label>
              </div>
              {pwMessage && (
                <p
                  className={`mt-3 text-xs ${
                    pwMessage.type === 'ok' ? 'text-success' : 'text-destructive'
                  }`}
                >
                  {pwMessage.text}
                </p>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  disabled={isPending || pw.next.length < 8}
                  onClick={changePassword}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {t`Changer le mot de passe`}
                </button>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t`Un email de confirmation peut vous être demandé selon la configuration de la plateforme.`}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium">{t`Session actuelle`}</p>
                <p className="text-xs text-muted-foreground">
                  {t`Connectée avec`} {data.user.email}
                </p>
              </div>
              <form action={logoutAccountAction}>
                <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10">
                  <LogOut className="h-3.5 w-3.5" /> {t`Se déconnecter`}
                </button>
              </form>
            </div>
          </SettingsPanel>
        )}

        {activeSection === 'notifications' && (
          <div>
            <SettingsHeader
              title={t`Notifications`}
              description={t`Choisissez ce qui mérite votre attention.`}
            />
            <NotificationSettingsForm />
          </div>
        )}

        {activeSection === 'privacy' && (
          <SettingsPanel
            title={t`Confidentialité`}
            description={t`Décidez qui peut vous trouver, vous mentionner et vous inviter.`}
          >
            <SelectRow
              label={t`Visibilité du profil`}
              description={t`Contrôle la visibilité de votre profil public.`}
              value={settings.profileVisibility}
              options={[
                ['PUBLIC', t`Public`],
                ['FOLLOWERS', t`Abonnés uniquement`],
                ['PRIVATE', t`Privé`],
              ]}
              onChange={(value) =>
                patchSettings({
                  profileVisibility: value as AccountSettingsPatch['profileVisibility'],
                })
              }
            />
            <ToggleRow
              label={t`Autoriser les mentions`}
              description={t`Les autres membres peuvent vous mentionner dans une pensée.`}
              checked={settings.allowMentions}
              onChange={(value) => patchSettings({ allowMentions: value })}
            />
            <ToggleRow
              label={t`Recevoir les invitations de collaboration`}
              description={t`Les auteurs peuvent vous proposer d’être cité dans un article.`}
              checked={settings.allowCollaborationInvites}
              onChange={(value) => patchSettings({ allowCollaborationInvites: value })}
            />
            <ToggleRow
              label={t`Afficher les contenus sensibles`}
              description={t`Masque les avertissements uniquement lorsque vous le désactivez.`}
              checked={settings.showSensitiveContent}
              onChange={(value) => patchSettings({ showSensitiveContent: value })}
            />
            <SelectRow
              label={t`Visibilité de mes likes`}
              description={t`Choisissez si votre identité apparaît dans les listes de personnes ayant aimé une pensée.`}
              value={settings.likeVisibility}
              options={[
                ['PUBLIC', t`Publique`],
                ['PRIVATE', t`Privée`],
              ]}
              onChange={(value) =>
                patchSettings({ likeVisibility: value as AccountSettingsPatch['likeVisibility'] })
              }
            />

            <div className="rounded-xl border border-border/60 p-4">
              <h3 className="text-sm font-semibold">{t`Contrôles sociaux`}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t`Gérez les personnes dont le contenu ou les interactions doivent être limités.`}</p>
              <div className="mt-3 space-y-2">
                {[
                  ['blocked', t`Utilisateurs bloqués`],
                  ['muted', t`Utilisateurs masqués`],
                ].map(([kind, label]) => (
                  <div
                    key={kind}
                    className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span>{label}</span>
                    <span className="text-xs text-muted-foreground">
                      {socialUsers[kind as 'blocked' | 'muted'].length}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {socialUsers.blocked.map((user) => (
                  <button
                    key={`b-${user.id}`}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const result = await toggleBlockedUserAction(user.id);
                          if (!result.blocked) {
                            setSocialUsers((s) => ({
                              ...s,
                              blocked: s.blocked.filter((u) => u.id !== user.id),
                            }));
                          }
                          showMessage(t`Utilisateur débloqué.`);
                        } catch (error) {
                          showMessage(
                            error instanceof Error
                              ? error.message
                              : t`Impossible de modifier le blocage.`
                          );
                        }
                      })
                    }
                    className="rounded-full border border-destructive/30 px-3 py-1.5 text-xs text-destructive"
                  >
                    {user.name || user.username || user.id} ×
                  </button>
                ))}
                {socialUsers.muted.map((user) => (
                  <button
                    key={`m-${user.id}`}
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const result = await toggleMutedUserAction(user.id);
                          if (!result.muted) {
                            setSocialUsers((s) => ({
                              ...s,
                              muted: s.muted.filter((u) => u.id !== user.id),
                            }));
                          }
                          showMessage(t`Utilisateur masqué retiré.`);
                        } catch (error) {
                          showMessage(
                            error instanceof Error
                              ? error.message
                              : t`Impossible de modifier le masquage.`
                          );
                        }
                      })
                    }
                    className="rounded-full border border-border px-3 py-1.5 text-xs"
                  >
                    {user.name || user.username || user.id} ×
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-4">
              <div className="flex items-start gap-3">
                <Accessibility className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">{t`Mots masqués`}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t`Le contenu contenant ces mots sera filtré de votre fil d’actualité et de vos recommandations.`}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  value={mutedInput}
                  onChange={(event) => setMutedInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addMutedWord();
                  }}
                  placeholder={t`Ajouter un mot à masquer`}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={isPending || mutedInput.trim() === ''}
                  onClick={addMutedWord}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> {t`Ajouter`}
                </button>
              </div>
              {mutedWords.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {mutedWords.map((word) => (
                    <li
                      key={word}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs"
                    >
                      {word}
                      <button
                        type="button"
                        aria-label={t`Retirer ${word}`}
                        onClick={() => removeMutedWord(word)}
                        disabled={isPending}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-xs text-muted-foreground">
                  {t`Aucun mot masqué pour le moment.`}
                </p>
              )}
            </div>
          </SettingsPanel>
        )}

        {activeSection === 'appearance' && (
          <SettingsPanel
            title={t`Apparence & lecture`}
            description={t`Une expérience calme, lisible et adaptée à votre attention.`}
          >
            <SelectRow
              label={t`Thème`}
              description={t`Choisissez la teinte de l’interface (clair ou sombre).`}
              value={mounted ? (theme ?? 'light') : 'light'}
              options={[
                ['light', t`Clair`],
                ['dark', t`Sombre`],
              ]}
              onChange={(value) => setTheme(value)}
            />
            <SelectRow
              label={t`Feed par défaut`}
              description={t`La vue ouverte lorsque vous arrivez sur l’accueil.`}
              value={settings.defaultFeed}
              options={[
                ['FOLLOWING', t`Abonnements`],
                ['DISCOVER', t`Découvrir`],
              ]}
              onChange={(value) =>
                patchSettings({ defaultFeed: value as AccountSettingsPatch['defaultFeed'] })
              }
            />
            <SelectRow
              label={t`Taille du texte`}
              description={t`Ajuste la taille de lecture dans l’application.`}
              value={String(settings.fontScale)}
              options={[
                ['90', t`Petite`],
                ['100', t`Standard`],
                ['110', t`Grande`],
                ['125', t`Très grande`],
              ]}
              onChange={(value) => patchSettings({ fontScale: Number(value) })}
            />
            <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t`Aperçu de la lecture`}
              </p>
              <article className="mt-2 space-y-2" style={{ fontSize: `${settings.fontScale}%` }}>
                <h4 className="font-bold">{t`Le temps long de la lecture attentive.`}</h4>
                <p className="leading-relaxed text-muted-foreground">
                  {t`Une taille de texte confortable réduit la fatigue et prolonge l’attention portée à chaque idée.`}
                </p>
                {settings.highContrast && (
                  <p className="text-xs font-medium text-primary">
                    {t`Contraste renforcé activé.`}
                  </p>
                )}
              </article>
            </div>
            <ToggleRow
              label={t`Lecture automatique des médias`}
              description={t`Lance automatiquement les vidéos et contenus animés.`}
              checked={settings.autoplayMedia}
              onChange={(value) => patchSettings({ autoplayMedia: value })}
            />
            <ToggleRow
              label={t`Réduire les animations`}
              description={t`Respecte votre préférence pour une interface plus stable.`}
              checked={settings.reduceMotion}
              onChange={(value) => patchSettings({ reduceMotion: value })}
            />
            <ToggleRow
              label={t`Contraste renforcé`}
              description={t`Améliore la lisibilité des éléments d’interface.`}
              checked={settings.highContrast}
              onChange={(value) => patchSettings({ highContrast: value })}
            />
          </SettingsPanel>
        )}

        {activeSection === 'data' && (
          <SettingsPanel
            title={t`Données & sécurité`}
            description={t`Exportez vos données ou demandez la suppression de votre compte.`}
          >
            <SettingsLink
              icon={Download}
              title={t`Exporter mes données`}
              description={t`Téléchargez vos pensées, articles, signets, surlignages et préférences.`}
              onClick={exportData}
            />
            <SettingsLink
              icon={Accessibility}
              title={t`Mots masqués`}
              description={t`Gérez les mots filtrés de votre fil d’actualité.`}
              onClick={() => navigateToSection('privacy')}
            />
            <SettingsLink
              icon={Palette}
              title={t`Accessibilité`}
              description={t`Les réglages de lecture sont disponibles dans Apparence & lecture.`}
              onClick={() => navigateToSection('appearance')}
            />
            {data.deletionRequest?.status === 'PENDING' && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-highlight/25 bg-highlight/[0.05] px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">{t`Suppression en attente`}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t`Demandée le`} {formatDate(data.deletionRequest.requestedAt)}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelDeletion}
                  disabled={isPending}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {t`Annuler`}
                </button>
              </div>
            )}
            <div className="rounded-xl border border-destructive/25 bg-destructive/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <h3 className="text-sm font-semibold text-destructive">
                    {t`Supprimer le compte`}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t`Votre demande sera traitée par l’équipe. Cette action est irréversible après validation.`}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  value={deletionConfirmation}
                  onChange={(event) => setDeletionConfirmation(event.target.value)}
                  placeholder={t`Écrivez DELETE`}
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <button
                  disabled={isPending || deletionConfirmation !== 'DELETE'}
                  onClick={requestDeletion}
                  className="rounded-lg bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground disabled:opacity-40"
                >
                  {t`Demander la suppression`}
                </button>
              </div>
            </div>
          </SettingsPanel>
        )}

        {isPending && (
          <p className="mt-4 text-center text-xs text-muted-foreground">{t`Enregistrement…`}</p>
        )}

        <nav
          aria-label={t`Navigation rapide des réglages`}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2 py-2 backdrop-blur md:hidden"
        >
          <div className="mx-auto flex max-w-2xl items-center justify-around gap-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => navigateToSection(section.id)}
                  aria-label={section.label()}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                  className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[10px] ${activeSection === section.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground'}`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="max-w-full truncate">{section.label()}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}

function SettingsHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 border-b border-border pb-5">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
function SettingsPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <SettingsHeader title={title} description={description} />
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3 hover:bg-muted/30">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-primary"
      />
    </label>
  );
}
function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  options: string[][];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-4 py-3">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[170px] rounded-lg border border-border bg-background px-2 py-2 text-xs"
      >
        <>
          {options.map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </>
      </select>
    </label>
  );
}
function SettingsLink({
  icon: Icon,
  title,
  description,
  onClick,
  disabled = false,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border/60 px-4 py-3 text-left hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-70"
    >
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      {!disabled && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
