// =====================================================================
// 🧪 MediaStudioClient — piloter une publication
// =====================================================================
// Le studio Média est le seul endroit où l'on gère une équipe, des liens
// d'invitation, le journal d'audit et les réglages d'une publication. On
// vérifie ce que chaque rôle voit, ce que les actions envoient au serveur et
// ce que l'écran affiche quand ça se passe mal.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mediaActions = vi.hoisted(() => ({
  createMediaAction: vi.fn(),
  getMediaByIdAction: vi.fn(),
  inviteMediaMemberAction: vi.fn(),
  updateMediaMemberRoleAction: vi.fn(),
  updateMediaMemberPermissionsAction: vi.fn(),
  removeMediaMemberAction: vi.fn(),
  updateMediaSettingsAction: vi.fn(),
  createMediaInviteLinkAction: vi.fn(),
  listMediaInviteLinksAction: vi.fn(),
  revokeMediaInviteLinkAction: vi.fn(),
  listMediaAuditLogAction: vi.fn(),
}));
const articleActions = vi.hoisted(() => ({ searchArticleContributorsAction: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
const nav = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  useSearchParams: () => nav.params,
}));
vi.mock('next/image', async () => {
  const react = await import('react');
  return {
    default: ({ src, alt }: { src?: unknown; alt?: string }) =>
      react.createElement('img', { src: typeof src === 'string' ? src : '', alt: alt ?? '' }),
  };
});
vi.mock('../actions', () => mediaActions);
vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));
vi.mock('../PendingInvites', () => ({
  PendingInvites: () => <div data-testid="pending-invites" />,
}));
vi.mock('../MediaApiKeysTab', () => ({
  MediaApiKeysTab: ({ mediaId }: { mediaId: string }) => (
    <div data-testid="api-keys-tab">clés de {mediaId}</div>
  ),
}));
vi.mock('@qoe/supabase/storage', () => ({
  uploadImageToRoute: vi.fn(),
  IMAGE_FOLDERS: { avatars: 'avatars', banners: 'banners' },
}));
vi.mock('@qoe/ui/ui/ImageUploader', () => ({
  ImageUploader: () => <div data-testid="image-uploader" />,
}));
/** Étape de vérification d'identité : hors sujet ici, on exécute l'action. */
vi.mock('@/lib/authz-feedback', () => ({
  attemptWithStepUp: (run: () => Promise<unknown>) => run(),
}));
/** Popover/react-aria n'ouvre pas de portail en jsdom : double en ligne. */
vi.mock('@qoe/ui/ui/popover', () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children, ...rest }: React.ComponentProps<'button'>) => (
    <button type="button" {...rest}>
      {children}
    </button>
  ),
  PopoverContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
/** Listbox portail : on ne teste que le contrat valeur → onValueChange. */
vi.mock('@qoe/ui/select', async () => {
  const react = await import('react');
  return {
    Select: ({
      label,
      value,
      options,
      onValueChange,
    }: {
      label: string;
      value?: string;
      options: { id: string; label: string }[];
      onValueChange?: (value: string) => void;
    }) =>
      react.createElement(
        'select',
        {
          'aria-label': label,
          value: value ?? '',
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            onValueChange?.(event.target.value),
        },
        options.map((option) =>
          react.createElement('option', { key: option.id, value: option.id }, option.label)
        )
      ),
  };
});

import { MediaStudioClient } from '../MediaStudioClient';

const mediaSummary = (id: string, name: string) => ({
  id,
  name,
  slug: id,
  subdomain: id,
  bio: null,
  logoUrl: null,
  role: 'owner',
  membersCount: 3,
});

const detail = {
  id: 'media-1',
  publisher: {
    id: 'media-1',
    name: 'La Revue',
    slug: 'la-revue',
    subdomain: 'revue',
    customDomain: null,
    bio: 'Revue de critique',
    logoUrl: null,
    heroText: null,
    headerImageUrl: null,
    footerText: null,
    accentColor: '#000000',
    themeMode: 'light',
    layoutStyle: 'magazine',
    seoTitle: null,
    seoDescription: null,
    allowIndexing: true,
    supportUrl: null,
    fontFamily: 'sans',
    _count: { articles: 42 },
  },
  members: [
    {
      id: 'm-owner',
      role: 'owner',
      permissions: [],
      status: 'active',
      joinedAt: '2026-01-01T00:00:00.000Z',
      user: { id: 'u-owner', name: 'Ada', username: 'ada', logoUrl: null },
    },
    {
      id: 'm-writer',
      role: 'writer',
      permissions: [],
      status: 'active',
      joinedAt: '2026-02-01T00:00:00.000Z',
      user: { id: 'u-writer', name: 'Blaise', username: 'blaise', logoUrl: null },
    },
    {
      id: 'm-viewer',
      role: 'viewer',
      permissions: ['media:review'],
      status: 'pending',
      joinedAt: '2026-03-01T00:00:00.000Z',
      user: { id: 'u-viewer', name: null, username: null, logoUrl: null },
    },
  ],
};

function mediaDetail(overrides: Record<string, unknown> = {}) {
  return { ...detail, ...overrides };
}

function grantResult(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    media: detail,
    myRole: 'owner',
    canManageApiKeys: true,
    canViewAudit: true,
    ...overrides,
  };
}

function renderStudio(props: Partial<React.ComponentProps<typeof MediaStudioClient>> = {}) {
  const rendered = render(
    <MediaStudioClient
      medias={[mediaSummary('media-1', 'La Revue'), mediaSummary('media-2', 'Le Quotidien')]}
      activeMediaId="media-1"
      {...props}
    />
  );
  return rendered;
}

/** Attend que la fiche média soit rendue (titre + onglets). */
async function waitForStudio() {
  await waitFor(() => expect(screen.getByRole('heading', { name: 'La Revue' })).toBeDefined());
}

const select = (label: string) => screen.getByLabelText(label) as HTMLSelectElement;

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = new URLSearchParams();
  mediaActions.getMediaByIdAction.mockResolvedValue(grantResult());
  mediaActions.listMediaInviteLinksAction.mockResolvedValue({ success: true, links: [] });
  mediaActions.listMediaAuditLogAction.mockResolvedValue({ success: true, entries: [], total: 0 });
  articleActions.searchArticleContributorsAction.mockResolvedValue({ ok: true, data: [] });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MediaStudioClient — chargement et coquille', () => {
  it('affiche le chargement pendant la récupération du Média', () => {
    mediaActions.getMediaByIdAction.mockReturnValue(new Promise(() => {}));
    renderStudio();

    expect(screen.getByText('Chargement du studio...')).toBeDefined();
  });

  it('signale un échec de chargement avec le motif serveur', async () => {
    mediaActions.getMediaByIdAction.mockResolvedValue({
      success: false,
      error: 'Accès refusé',
    });
    renderStudio();

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Accès refusé'));
  });

  it('ouvre directement le formulaire de création quand aucun Média n’existe', () => {
    renderStudio({ medias: [], activeMediaId: null });

    expect(screen.getByRole('heading', { name: 'Créer un média' })).toBeDefined();
    expect(screen.getByText('Votre Média')).toBeDefined();
    expect(mediaActions.getMediaByIdAction).not.toHaveBeenCalled();
  });

  it('affiche l’état vide quand un média est connu mais que sa fiche ne charge pas', async () => {
    mediaActions.getMediaByIdAction.mockResolvedValue({ success: false, error: 'Perdu' });
    render(
      <MediaStudioClient medias={[mediaSummary('media-1', 'La Revue')]} activeMediaId="media-1" />
    );

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Perdu'));
    expect(mediaActions.getMediaByIdAction).toHaveBeenCalledWith('media-1');
  });

  it('affiche l’identité de la publication et ses compteurs', async () => {
    renderStudio();
    await waitForStudio();

    expect(screen.getByText('revue.qoe.fi')).toBeDefined();
    // Le rôle apparaît dans le hero et dans la ligne du propriétaire.
    expect(screen.getAllByText('Propriétaire').length).toBeGreaterThan(0);
    expect(screen.getByText('42')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('Revue de critique')).toBeDefined();
  });

  it('n’affiche « Ouvrir cet espace » que pour un autre média sélectionné', async () => {
    renderStudio();
    await waitForStudio();
    expect(screen.queryByRole('button', { name: /Ouvrir cet espace/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Le Quotidien/ }));
    await waitFor(() => expect(mediaActions.getMediaByIdAction).toHaveBeenCalledWith('media-2'));

    fireEvent.click(screen.getByRole('button', { name: /Ouvrir cet espace/ }));
    expect(nav.push).toHaveBeenCalledWith('/');
    expect(nav.refresh).toHaveBeenCalled();
    expect(document.cookie).toContain('media-2');
  });
});

describe('MediaStudioClient — membres', () => {
  it('trie les membres par rang de rôle', async () => {
    renderStudio();
    await waitForStudio();

    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.textContent ?? '');

    expect(names[0]).toContain('Ada');
    expect(names[1]).toContain('Blaise');
    expect(names[2]).toContain('Inconnu');
  });

  it('réserve le propriétaire à un affichage sans action', async () => {
    renderStudio();
    await waitForStudio();

    expect(screen.getAllByText('Créateur')).toHaveLength(1);
    expect(screen.queryByLabelText('Rôle de Ada')).toBeNull();
    expect(screen.getByLabelText('Rôle de Blaise')).toBeDefined();
  });

  it('change le rôle d’un membre puis recharge la fiche', async () => {
    mediaActions.updateMediaMemberRoleAction.mockResolvedValue({ success: true });
    renderStudio();
    await waitForStudio();

    fireEvent.change(select('Rôle de Blaise'), { target: { value: 'editor' } });

    await waitFor(() =>
      expect(mediaActions.updateMediaMemberRoleAction).toHaveBeenCalledWith(
        'media-1',
        'u-writer',
        'editor'
      )
    );
    expect(toastMock.success).toHaveBeenCalledWith('Rôle mis à jour.');
    expect(mediaActions.getMediaByIdAction).toHaveBeenCalledTimes(2);
  });

  it('demande confirmation avant de retirer un membre', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderStudio();
    await waitForStudio();

    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer du Média' })[0]);
    expect(confirmSpy).toHaveBeenCalledWith('Retirer Blaise du Média ?');
    expect(mediaActions.removeMediaMemberAction).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    mediaActions.removeMediaMemberAction.mockResolvedValue({ success: true });
    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer du Média' })[0]);

    await waitFor(() =>
      expect(mediaActions.removeMediaMemberAction).toHaveBeenCalledWith('media-1', 'u-writer')
    );
    expect(toastMock.success).toHaveBeenCalledWith('Membre retiré.');
    confirmSpy.mockRestore();
  });

  it('bascule une permission et envoie la liste complète', async () => {
    mediaActions.updateMediaMemberPermissionsAction.mockResolvedValue({ success: true });
    renderStudio();
    await waitForStudio();

    // Blaise est rédacteur : il n'a que deux permissions par défaut.
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);

    await waitFor(() =>
      expect(mediaActions.updateMediaMemberPermissionsAction).toHaveBeenCalledWith(
        'media-1',
        'u-writer',
        ['media:create_articles', 'media:edit_own', 'media:manage_members']
      )
    );
  });

  it('explique qu’un rédacteur ne gère pas l’équipe', async () => {
    mediaActions.getMediaByIdAction.mockResolvedValue(grantResult({ myRole: 'writer' }));
    renderStudio();
    await waitForStudio();

    expect(
      screen.getByText(/seuls les propriétaires et éditeurs peuvent gérer l'équipe/)
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Retirer du Média' })).toBeNull();
  });
});

describe('MediaStudioClient — onglets et droits', () => {
  it('masque les onglets réservés faute de droits', async () => {
    mediaActions.getMediaByIdAction.mockResolvedValue(
      grantResult({ myRole: 'writer', canManageApiKeys: false, canViewAudit: false })
    );
    renderStudio();
    await waitForStudio();

    expect(screen.queryByRole('tab', { name: /Clés API/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Activité/ })).toBeNull();
  });

  it('ouvre l’onglet des clés API quand il est autorisé', async () => {
    renderStudio();
    await waitForStudio();

    fireEvent.click(screen.getByRole('tab', { name: /Clés API/ }));

    expect(screen.getByTestId('api-keys-tab').textContent).toBe('clés de media-1');
  });
});

describe('MediaStudioClient — invitations', () => {
  const link = (overrides: Record<string, unknown>) => ({
    id: 'link-1',
    mediaId: 'media-1',
    token: 'tok-1',
    role: 'writer',
    expiresAt: null,
    maxUses: 1,
    usedCount: 0,
    isRevoked: false,
    createdAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  });

  async function openInvites() {
    await waitForStudio();
    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }));
  }

  it('affiche le statut exact de chaque lien', async () => {
    mediaActions.listMediaInviteLinksAction.mockResolvedValue({
      success: true,
      links: [
        link({ id: 'l-active', token: 'a' }),
        link({ id: 'l-expired', token: 'b', expiresAt: '2020-01-01T00:00:00.000Z' }),
        link({ id: 'l-used', token: 'c', usedCount: 1, maxUses: 1 }),
        link({ id: 'l-revoked', token: 'd', isRevoked: true }),
      ],
    });
    renderStudio();
    await openInvites();

    await waitFor(() => expect(screen.getByText('Actif')).toBeDefined());
    expect(screen.getByText('Expiré')).toBeDefined();
    expect(screen.getByText('Épuisé')).toBeDefined();
    expect(screen.getByText('Révoqué')).toBeDefined();
    expect(screen.getByText('1 / 1')).toBeDefined();
    // Actif, expiré et révoqué : trois liens encore à 0 utilisation.
    expect(screen.getAllByText('0 / 1')).toHaveLength(3);
  });

  it('explique l’absence de lien', async () => {
    renderStudio();
    await openInvites();

    await waitFor(() =>
      expect(screen.getByText("Aucun lien d'invitation généré pour ce Média.")).toBeDefined()
    );
  });

  it('signale un échec de chargement des liens', async () => {
    mediaActions.listMediaInviteLinksAction.mockResolvedValue({
      success: false,
      error: 'Interdit',
    });
    renderStudio();
    await openInvites();

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Interdit'));
  });

  it('génère un lien avec le rôle et les limites choisis puis le copie', async () => {
    mediaActions.createMediaInviteLinkAction.mockResolvedValue({
      success: true,
      link: link({ id: 'link-new', token: 'tok-new' }),
    });
    renderStudio();
    await openInvites();
    await waitFor(() => expect(screen.getByText(/Générer le lien/)).toBeDefined());

    fireEvent.change(select('Rôle accordé'), { target: { value: 'editor' } });
    fireEvent.change(select('Durée de validité'), { target: { value: '168' } });
    fireEvent.change(select('Utilisations max'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Générer le lien/ }));

    await waitFor(() =>
      expect(mediaActions.createMediaInviteLinkAction).toHaveBeenCalledWith(
        'media-1',
        'editor',
        168,
        5
      )
    );
    expect(toastMock.success).toHaveBeenCalledWith("Lien d'invitation généré.");
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
  });

  it('copie un lien existant et le confirme dans le bouton', async () => {
    mediaActions.listMediaInviteLinksAction.mockResolvedValue({
      success: true,
      links: [link({ id: 'l-active', token: 'abc' })],
    });
    renderStudio();
    await openInvites();

    await waitFor(() => expect(screen.getByRole('button', { name: /Copier/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Copier/ }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/media/join?token=abc`
      )
    );
    // Le bouton doit basculer sur « Copié » (régression : la ligne du tableau
    // gardait l'ancien libellé faute de voir le nouvel état).
    await waitFor(() => expect(screen.getByText('Copié')).toBeDefined());
  });

  it('rapporte un presse-papiers indisponible', async () => {
    mediaActions.listMediaInviteLinksAction.mockResolvedValue({
      success: true,
      links: [link({ id: 'l-active', token: 'abc' })],
    });
    (navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('refus')
    );
    renderStudio();
    await openInvites();

    await waitFor(() => expect(screen.getByRole('button', { name: /Copier/ })).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /Copier/ }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Impossible de copier le lien.')
    );
  });

  it('révoque un lien et retire sa ligne', async () => {
    mediaActions.listMediaInviteLinksAction.mockResolvedValue({
      success: true,
      links: [link({ id: 'l-active', token: 'abc' })],
    });
    mediaActions.revokeMediaInviteLinkAction.mockResolvedValue({ success: true });
    renderStudio();
    await openInvites();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Révoquer le lien' })).toBeDefined()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Révoquer le lien' }));

    await waitFor(() =>
      expect(mediaActions.revokeMediaInviteLinkAction).toHaveBeenCalledWith('media-1', 'l-active')
    );
    await waitFor(() =>
      expect(screen.getByText("Aucun lien d'invitation généré pour ce Média.")).toBeDefined()
    );
  });

  it('cherche un créateur avec un délai puis l’invite avec le rôle choisi', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    articleActions.searchArticleContributorsAction.mockResolvedValue({
      ok: true,
      data: [{ id: 'u-new', name: 'Camille', username: 'camille', logoUrl: null }],
    });
    mediaActions.inviteMediaMemberAction.mockResolvedValue({ success: true });
    renderStudio();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('tab', { name: /Invitations/ }));

    const input = screen.getByPlaceholderText(/Rechercher un créateur/);
    fireEvent.change(input, { target: { value: 'cam' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Camille')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Camille/ }));
    fireEvent.change(select('Rôle à accorder'), { target: { value: 'editor' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(mediaActions.inviteMediaMemberAction).toHaveBeenCalledWith(
      'media-1',
      'camille',
      'editor'
    );
  });

  it('refuse d’inviter sans créateur sélectionné', async () => {
    renderStudio();
    await openInvites();

    const add = screen.getByRole('button', { name: /Ajouter/ }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(mediaActions.inviteMediaMemberAction).not.toHaveBeenCalled();
  });
});

describe('MediaStudioClient — journal d’activité', () => {
  const entries = [
    {
      id: 'a1',
      action: 'media.article_published',
      metadata: { title: 'La ville breathe' },
      createdAt: '2026-11-15T09:00:00.000Z',
      actor: { id: 'u1', name: 'Ada', username: 'ada', logoUrl: null },
    },
    {
      id: 'a2',
      action: 'media.settings_updated',
      metadata: { fields: ['name'] },
      createdAt: '2026-11-14T09:00:00.000Z',
      actor: null,
    },
  ];

  async function openActivity() {
    await waitForStudio();
    fireEvent.click(screen.getByRole('tab', { name: /Activité/ }));
    await waitFor(() => expect(mediaActions.listMediaAuditLogAction).toHaveBeenCalled());
  }

  it('décrit chaque entrée avec son acteur', async () => {
    mediaActions.listMediaAuditLogAction.mockResolvedValue({
      success: true,
      entries,
      total: 2,
    });
    renderStudio();
    await openActivity();

    await waitFor(() =>
      expect(screen.getByText("a publié l'article « La ville breathe »")).toBeDefined()
    );
    expect(screen.getByText('Ada')).toBeDefined();
    // Un acteur supprimé reste lisible.
    expect(screen.getByText('Membre supprimé')).toBeDefined();
    expect(screen.getByText('nom')).toBeDefined();
    expect(screen.getByText('2 / 2')).toBeDefined();
  });

  it('charge la suite du journal', async () => {
    mediaActions.listMediaAuditLogAction.mockResolvedValueOnce({
      success: true,
      entries: [entries[0]],
      total: 3,
    });
    mediaActions.listMediaAuditLogAction.mockResolvedValueOnce({
      success: true,
      entries: [entries[1]],
      total: 3,
    });
    renderStudio();
    await openActivity();
    await waitFor(() => expect(screen.getByText('1 / 3')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Charger plus' }));

    await waitFor(() => expect(screen.getByText('2 / 3')).toBeDefined());
    expect(mediaActions.listMediaAuditLogAction).toHaveBeenLastCalledWith('media-1', {
      category: 'all',
      query: '',
      offset: 1,
    });
  });

  it('filtre le journal par catégorie', async () => {
    mediaActions.listMediaAuditLogAction.mockResolvedValue({ success: true, entries, total: 2 });
    renderStudio();
    await openActivity();

    fireEvent.click(screen.getByRole('button', { name: 'Équipe' }));

    await waitFor(() =>
      expect(mediaActions.listMediaAuditLogAction).toHaveBeenCalledWith('media-1', {
        category: 'team',
        query: '',
      })
    );
  });

  it('différencie un journal vide d’un filtre sans résultat', async () => {
    renderStudio();
    await openActivity();

    await waitFor(() =>
      expect(screen.getByText('Aucune activité enregistrée pour ce Média.')).toBeDefined()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Articles' }));
    await waitFor(() =>
      expect(screen.getByText('Aucune activité ne correspond à ces filtres.')).toBeDefined()
    );
  });

  it('rapporte un échec de chargement du journal', async () => {
    mediaActions.listMediaAuditLogAction.mockResolvedValue({ success: false, error: 'Journal KO' });
    renderStudio();
    await openActivity();

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Journal KO'));
  });

  it('ne relance la recherche qu’après le délai', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mediaActions.listMediaAuditLogAction.mockResolvedValue({ success: true, entries, total: 2 });
    renderStudio();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('tab', { name: /Activité/ }));
    await act(async () => {
      await Promise.resolve();
    });
    const callsAfterLoad = mediaActions.listMediaAuditLogAction.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Rechercher dans le journal'), {
      target: { value: 'ada' },
    });
    expect(mediaActions.listMediaAuditLogAction).toHaveBeenCalledTimes(callsAfterLoad);

    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(mediaActions.listMediaAuditLogAction).toHaveBeenLastCalledWith('media-1', {
        category: 'all',
        query: 'ada',
      })
    );
  });
});

describe('MediaStudioClient — création et réglages', () => {
  it('exige un nom et un permalien avant de créer', async () => {
    renderStudio({ medias: [], activeMediaId: null });
    fireEvent.click(screen.getByRole('button', { name: /Créer le Média/ }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Le nom et le permalien sont requis.')
    );
    expect(mediaActions.createMediaAction).not.toHaveBeenCalled();
  });

  it('crée le Média puis bascule l’espace de travail', async () => {
    mediaActions.createMediaAction.mockResolvedValue({ success: true, media: { id: 'media-9' } });
    renderStudio({ medias: [], activeMediaId: null });

    fireEvent.change(screen.getByPlaceholderText('Nom du média'), {
      target: { value: 'Nouvelle Revue' },
    });
    fireEvent.change(screen.getByPlaceholderText('nom-du-media'), {
      target: { value: 'nouvelle-revue' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer le Média/ }));

    await waitFor(() =>
      expect(mediaActions.createMediaAction).toHaveBeenCalledWith(
        'Nouvelle Revue',
        'nouvelle-revue',
        undefined,
        undefined
      )
    );
    expect(toastMock.success).toHaveBeenCalledWith('Média créé.');
    expect(nav.push).toHaveBeenCalledWith('/media');
    expect(document.cookie).toContain('media-9');
  });

  it('ne bascule rien quand la création échoue', async () => {
    mediaActions.createMediaAction.mockResolvedValue({ success: false, error: 'Refusé' });
    renderStudio({ medias: [], activeMediaId: null });

    fireEvent.change(screen.getByPlaceholderText('Nom du média'), { target: { value: 'X' } });
    fireEvent.change(screen.getByPlaceholderText('nom-du-media'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer le Média/ }));

    await waitFor(() => expect(mediaActions.createMediaAction).toHaveBeenCalled());
    expect(nav.push).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('enregistre les réglages du Média', async () => {
    mediaActions.updateMediaSettingsAction.mockResolvedValue({ success: true });
    renderStudio();
    await waitForStudio();

    fireEvent.click(screen.getByRole('tab', { name: /Réglages/ }));
    fireEvent.change(screen.getAllByDisplayValue('La Revue')[0], {
      target: { value: 'La Revue littéraire' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer les réglages/ }));

    await waitFor(() =>
      expect(mediaActions.updateMediaSettingsAction).toHaveBeenCalledWith(
        'media-1',
        expect.objectContaining({ name: 'La Revue littéraire', allowIndexing: true })
      )
    );
    expect(toastMock.success).toHaveBeenCalledWith('Réglages du Média enregistrés.');
  });
});
