'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { t } from '@lingui/core/macro';
import Link from 'next/link';
import Image from 'next/image';
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
  Palette,
  Shield,
  Trash2,
  UserRound,
} from 'lucide-react';
import { NotificationSettingsForm } from '@/components/notifications/NotificationSettingsForm';
import {
  cancelAccountDeletionAction,
  exportAccountDataAction,
  logoutAccountAction,
  requestAccountDeletionAction,
  updateAccountProfileAction,
  updateAccountSettingsAction,
  type AccountSettingsPatch,
} from './actions';

export type AccountSettingsData = Awaited<
  ReturnType<typeof import('./actions').getAccountSettingsAction>
>;

type SettingsSection = 'account' | 'profile' | 'notifications' | 'privacy' | 'appearance' | 'data';

// Libellés résolus au rendu pour suivre la langue active (tableau au module = figé).
const sections: Array<{ id: SettingsSection; label: () => string; icon: typeof UserRound }> = [
  { id: 'account', label: () => t`Compte`, icon: UserRound },
  { id: 'profile', label: () => t`Profil public`, icon: UserRound },
  { id: 'notifications', label: () => t`Notifications`, icon: Bell },
  { id: 'privacy', label: () => t`Confidentialité`, icon: Shield },
  { id: 'appearance', label: () => t`Apparence & lecture`, icon: Palette },
  { id: 'data', label: () => t`Données & sécurité`, icon: Lock },
];

export default function AccountSettingsPage({
  initialData,
}: {
  initialData?: AccountSettingsData;
}) {
  // The server page wrapper supplies this in production; keeping a small loading
  // fallback makes the component easy to mount in isolated UI tests.
  const [data, setData] = useState<AccountSettingsData | null>(initialData || null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [profile, setProfile] = useState(() => ({
    name: initialData?.user.name || '',
    username: initialData?.user.username || '',
    onboardingText: initialData?.user.onboardingText || '',
    logoUrl: initialData?.user.logoUrl || '',
    pronouns: initialData?.user.pronouns || '',
  }));
  const [deletionConfirmation, setDeletionConfirmation] = useState('');

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

  const saveProfile = () => {
    startTransition(async () => {
      try {
        await updateAccountProfileAction(profile);
        setData((current) =>
          current ? { ...current, user: { ...current.user, ...profile } } : current
        );
        showMessage(t`Profil mis à jour.`);
      } catch (error) {
        showMessage(
          error instanceof Error ? error.message : t`Impossible de mettre à jour le profil.`
        );
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
        showMessage(error instanceof Error ? error.message : 'Export impossible.');
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
        showMessage(error instanceof Error ? error.message : 'Impossible d’annuler la demande.');
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
        Chargement de vos réglages…
      </div>
    );
  }

  const settings = data.settings;

  return (
    <main className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8 pb-24 md:px-8">
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
              Votre compte, votre espace, vos règles.
            </p>
          </div>
          <nav className="space-y-1" aria-label={t`Sections des réglages`}>
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
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
            onChange={(event) => setActiveSection(event.target.value as SettingsSection)}
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

        {activeSection === 'account' && (
          <SettingsPanel
            title="Compte"
            description="Les informations de base et les accès à votre compte."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField label="Adresse email" value={data.user.email} />
              <ReadOnlyField
                label="Type de compte"
                value={data.user.role === 'user' ? 'Lecteur' : data.user.role}
              />
              <ReadOnlyField
                label="Membre depuis"
                value={new Date(data.user.createdAt).toLocaleDateString('fr-FR')}
              />
              <ReadOnlyField label="Identifiant" value={data.user.id.slice(0, 12) + '…'} />
            </div>
            <SettingsLink
              icon={KeyRound}
              title={t`Sécurité et sessions`}
              description="Votre mot de passe est géré par Supabase Auth."
              disabled
            />
            <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Session actuelle</p>
                <p className="text-xs text-muted-foreground">Connectée avec {data.user.email}</p>
              </div>
              <form action={logoutAccountAction}>
                <button className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10">
                  <LogOut className="h-3.5 w-3.5" /> Se déconnecter
                </button>
              </form>
            </div>
          </SettingsPanel>
        )}

        {activeSection === 'profile' && (
          <SettingsPanel
            title="Profil public"
            description="Ce que les autres membres peuvent voir sur votre identité qoe.fi."
          >
            <div className="flex items-center gap-4 rounded-xl bg-muted/40 p-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-lg font-bold text-primary">
                {profile.logoUrl ? (
                  <Image
                    src={profile.logoUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (profile.name || profile.username || 'Q').slice(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <p className="font-semibold">{profile.name || 'Votre nom'}</p>
                <p className="text-xs text-muted-foreground">
                  @{profile.username || 'nom_utilisateur'}
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <LabeledInput
                label={t`Nom affiché`}
                value={profile.name}
                onChange={(value) => setProfile({ ...profile, name: value })}
              />
              <LabeledInput
                label="Nom d’utilisateur"
                prefix="@"
                value={profile.username}
                onChange={(value) => setProfile({ ...profile, username: value })}
              />
              <LabeledInput
                label="Pronoms"
                value={profile.pronouns}
                onChange={(value) => setProfile({ ...profile, pronouns: value })}
                placeholder="ex: iel, il/lui, elle, they/them"
              />
            </div>
            <LabeledInput
              label="URL de la photo de profil"
              value={profile.logoUrl}
              onChange={(value) => setProfile({ ...profile, logoUrl: value })}
              placeholder="https://…"
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Présentation</span>
              <textarea
                value={profile.onboardingText}
                onChange={(event) => setProfile({ ...profile, onboardingText: event.target.value })}
                maxLength={500}
                rows={4}
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="Quelques mots sur vous…"
              />
              <span className="block text-right text-[11px] text-muted-foreground">
                {profile.onboardingText.length}/500
              </span>
            </label>
            <div className="flex justify-end">
              <button
                disabled={isPending}
                onClick={saveProfile}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Enregistrer le profil
              </button>
            </div>
          </SettingsPanel>
        )}

        {activeSection === 'notifications' && (
          <div>
            <SettingsHeader
              title="Notifications"
              description="Choisissez ce qui mérite votre attention."
            />
            <NotificationSettingsForm />
          </div>
        )}

        {activeSection === 'privacy' && (
          <SettingsPanel
            title={t`Confidentialité`}
            description="Décidez qui peut vous trouver, vous mentionner et vous inviter."
          >
            <SelectRow
              label={t`Visibilité du profil`}
              description="Contrôle la visibilité de votre profil public."
              value={settings.profileVisibility}
              options={[
                ['PUBLIC', 'Public'],
                ['FOLLOWERS', 'Abonnés uniquement'],
                ['PRIVATE', 'Privé'],
              ]}
              onChange={(value) =>
                patchSettings({
                  profileVisibility: value as AccountSettingsPatch['profileVisibility'],
                })
              }
            />
            <ToggleRow
              label="Autoriser les mentions"
              description="Les autres membres peuvent vous mentionner dans une pensée."
              checked={settings.allowMentions}
              onChange={(value) => patchSettings({ allowMentions: value })}
            />
            <ToggleRow
              label="Recevoir les invitations de collaboration"
              description="Les auteurs peuvent vous proposer d’être cité dans un article."
              checked={settings.allowCollaborationInvites}
              onChange={(value) => patchSettings({ allowCollaborationInvites: value })}
            />
            <ToggleRow
              label="Afficher les contenus sensibles"
              description="Masque les avertissements uniquement lorsque vous le désactivez."
              checked={settings.showSensitiveContent}
              onChange={(value) => patchSettings({ showSensitiveContent: value })}
            />
          </SettingsPanel>
        )}

        {activeSection === 'appearance' && (
          <SettingsPanel
            title="Apparence & lecture"
            description="Une expérience calme, lisible et adaptée à votre attention."
          >
            <SelectRow
              label={t`Feed par défaut`}
              description="La vue ouverte lorsque vous arrivez sur l’accueil."
              value={settings.defaultFeed}
              options={[
                ['FOLLOWING', 'Abonnements'],
                ['DISCOVER', 'Découvrir'],
              ]}
              onChange={(value) =>
                patchSettings({ defaultFeed: value as AccountSettingsPatch['defaultFeed'] })
              }
            />
            <SelectRow
              label="Taille du texte"
              description="Ajuste la taille de lecture dans l’application."
              value={String(settings.fontScale)}
              options={[
                ['90', 'Petite'],
                ['100', 'Standard'],
                ['110', 'Grande'],
                ['125', 'Très grande'],
              ]}
              onChange={(value) => patchSettings({ fontScale: Number(value) })}
            />
            <ToggleRow
              label={t`Lecture automatique des médias`}
              description="Lance automatiquement les vidéos et contenus animés."
              checked={settings.autoplayMedia}
              onChange={(value) => patchSettings({ autoplayMedia: value })}
            />
            <ToggleRow
              label={t`Réduire les animations`}
              description="Respecte votre préférence pour une interface plus stable."
              checked={settings.reduceMotion}
              onChange={(value) => patchSettings({ reduceMotion: value })}
            />
            <ToggleRow
              label={t`Contraste renforcé`}
              description="Améliore la lisibilité des éléments d’interface."
              checked={settings.highContrast}
              onChange={(value) => patchSettings({ highContrast: value })}
            />
          </SettingsPanel>
        )}

        {activeSection === 'data' && (
          <SettingsPanel
            title={t`Données & sécurité`}
            description="Exportez vos données ou demandez la suppression de votre compte."
          >
            <SettingsLink
              icon={Download}
              title={t`Exporter mes données`}
              description="Téléchargez vos pensées, articles, signets, surlignages et préférences."
              onClick={exportData}
            />
            <SettingsLink
              icon={Accessibility}
              title={t`Accessibilité`}
              description="Les réglages de lecture sont disponibles dans Apparence & lecture."
              onClick={() => setActiveSection('appearance')}
            />
            {data.deletionRequest?.status === 'PENDING' && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-highlight/25 bg-highlight/[0.05] px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-foreground">Suppression en attente</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Demandée le{' '}
                    {new Date(data.deletionRequest.requestedAt).toLocaleDateString('fr-FR')}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelDeletion}
                  disabled={isPending}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  Annuler
                </button>
              </div>
            )}
            <div className="rounded-xl border border-destructive/25 bg-destructive/[0.03] p-4">
              <div className="flex items-start gap-3">
                <Trash2 className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <h3 className="text-sm font-semibold text-destructive">Supprimer le compte</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Votre demande sera traitée par l’équipe. Cette action est irréversible après
                    validation.
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
                  Demander la suppression
                </button>
              </div>
            </div>
          </SettingsPanel>
        )}

        {isPending && (
          <p className="mt-4 text-center text-xs text-muted-foreground">Enregistrement…</p>
        )}
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
function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center rounded-xl border border-border bg-background focus-within:border-primary">
        {prefix && <span className="pl-3 text-sm text-muted-foreground">{prefix}</span>}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
        />
      </div>
    </label>
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
