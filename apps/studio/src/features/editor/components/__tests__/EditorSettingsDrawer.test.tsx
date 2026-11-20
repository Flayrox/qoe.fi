// =====================================================================
// 🧪 EditorSettingsDrawer — paramètres d'article et transferts
// =====================================================================
// Le tiroir regroupe les réglages qui changent la vie de l'article :
// publication, transfert vers un média, catégorie, URL, SEO, accès.
// On vérifie les gardes (ce qui ne s'affiche que si autorisé), les payloads
// réellement envoyés et les retours arrière quand le serveur refuse.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const articleActions = vi.hoisted(() => ({
  bulkUpdateArticlesAction: vi.fn(),
  getArticleByIdAction: vi.fn(),
  getWorkspacesAction: vi.fn(),
  transferArticleAction: vi.fn(),
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@qoe/sdk/actions/articles', () => articleActions);
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));
vi.mock('../../../editor/components/ArticleAttributionEditor', () => ({
  ArticleAttributionEditor: () => <div data-testid="attributions" />,
}));
vi.mock('../ArticleScheduleSection', () => ({
  ArticleScheduleSection: () => <div data-testid="schedule" />,
}));

import { EditorSettingsDrawer } from '../EditorSettingsDrawer';
import type { ArticleWorkspaceOption } from '../../lib/article-settings';

const personal: ArticleWorkspaceOption = {
  id: 'pub-1',
  name: 'Ada',
  slug: 'ada',
  logoUrl: null,
  type: 'PERSONAL',
};
const media: ArticleWorkspaceOption = {
  id: 'pub-2',
  name: 'La Revue',
  slug: 'la-revue',
  logoUrl: null,
  type: 'MEDIA',
  role: 'owner',
};
const viewerMedia: ArticleWorkspaceOption = {
  id: 'pub-3',
  name: 'Média lecture seule',
  slug: 'lecture',
  logoUrl: null,
  type: 'MEDIA',
  role: 'viewer',
};

function baseProps(overrides: Partial<React.ComponentProps<typeof EditorSettingsDrawer>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onScheduleDraftChange: vi.fn(),
    onSchedule: vi.fn(),
    onClearSchedule: vi.fn(),
    onTogglePremium: vi.fn(),
    onCategoryChange: vi.fn(),
    onSlugChange: vi.fn(),
    onAttributionsChange: vi.fn(),
    onSeoTitleChange: vi.fn(),
    onSeoDescriptionChange: vi.fn(),
    onTogglePublicAnnotations: vi.fn(),
    onToggleComments: vi.fn(),
    onToggleDownload: vi.fn(),
    onUnpublish: vi.fn(),
  };
  const props: React.ComponentProps<typeof EditorSettingsDrawer> = {
    open: true,
    published: false,
    status: 'DRAFT',
    scheduledAt: null,
    scheduleDraft: '',
    timeZoneLabel: 'Europe/Paris',
    schedulePending: false,
    isPremium: false,
    categories: [{ id: 'cat-1', name: 'Ville', slug: 'ville' }],
    categoryId: 'cat-1',
    slug: 'mon-article',
    attributions: [],
    seoTitle: '',
    seoDescription: '',
    autoSeoTitle: 'Titre auto',
    autoSeoDescription: 'Description auto',
    allowPublicAnnotations: true,
    allowComments: true,
    allowDownload: true,
    downloadSaving: false,
    canPublish: true,
    workspaces: [personal, media, viewerMedia],
    publisherId: 'pub-1',
    publisherName: 'Ada',
    publisherType: 'PERSONAL',
    ...handlers,
    ...overrides,
  };
  return { props, handlers };
}

/** react-aria expose l'état du Switch via `checked` (input) ou `aria-checked`. */
function switchState(element: HTMLElement): boolean {
  const aria = element.getAttribute('aria-checked');
  if (aria !== null) return aria === 'true';
  return (element as HTMLInputElement).checked === true;
}

function renderDrawer(overrides: Partial<React.ComponentProps<typeof EditorSettingsDrawer>> = {}) {
  const { props, handlers } = baseProps(overrides);
  const rendered = render(<EditorSettingsDrawer {...props} />);
  return { ...rendered, props, ...handlers };
}

describe('EditorSettingsDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    articleActions.getWorkspacesAction.mockResolvedValue({
      ok: true,
      data: { personal, medias: [media] },
    });
    articleActions.getArticleByIdAction.mockResolvedValue({
      ok: true,
      data: {
        publisherId: 'pub-2',
        publisher: { id: 'pub-2', name: 'La Revue', slug: 'la-revue', type: 'MEDIA' },
        showOnPersonalProfile: false,
      },
    });
    articleActions.transferArticleAction.mockResolvedValue({
      ok: true,
      data: {
        publisherId: 'pub-2',
        publisher: { id: 'pub-2', name: 'La Revue', slug: 'la-revue', type: 'MEDIA' },
        categoryId: 'cat-media',
        slug: 'slug-media',
      },
    });
    articleActions.bulkUpdateArticlesAction.mockResolvedValue({ ok: true, data: { failed: [] } });
  });

  it('n’annonce pas une copie réussie quand le presse-papiers refuse', async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error('permission refusée'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: { writeText },
    });
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: /Copier le lien/ }));

    // Même exigence que la modale d'invitation : un échec de copie doit être
    // visible, pas masqué par un « Copié ! » mensonger.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/copie impossible/i));
    expect(writeText).toHaveBeenCalledTimes(1);
  });

  it('ne rend rien quand le tiroir est fermé', () => {
    renderDrawer({ open: false });
    expect(screen.queryByText("Paramètres de l'article")).toBeNull();
    expect(articleActions.getWorkspacesAction).not.toHaveBeenCalled();
  });

  it('affiche l’état éditorial réel de l’article', () => {
    renderDrawer({ published: true, status: 'PUBLISHED' });
    expect(screen.getByText('En ligne (Publié)')).toBeDefined();

    renderDrawer({ published: false, scheduledAt: '2026-12-01T09:00:00.000Z' });
    expect(screen.getByText('Programmé')).toBeDefined();

    renderDrawer({ published: false, status: 'SUBMITTED' });
    expect(screen.getByText('En revue')).toBeDefined();

    renderDrawer({ published: false, status: 'DRAFT' });
    expect(screen.getByText('Brouillon privé')).toBeDefined();
  });

  it('charge les espaces de publication quand l’appelant ne les fournit pas', async () => {
    renderDrawer({
      workspaces: undefined,
      articleId: 'art-1',
      publisherId: undefined,
      publisherName: undefined,
      publisherType: undefined,
    });

    await waitFor(() => expect(articleActions.getWorkspacesAction).toHaveBeenCalled());
    // Deux occurrences attendues : la ligne « Publié dans » et la cible de transfert.
    expect((await screen.findAllByText('La Revue')).length).toBeGreaterThan(0);
  });

  it('déduit l’éditeur courant de l’article quand le parent ne le fournit pas', async () => {
    renderDrawer({
      articleId: 'art-1',
      publisherId: undefined,
      publisherName: undefined,
      publisherType: undefined,
      workspaces: [personal, media],
    });

    await waitFor(() => expect(articleActions.getArticleByIdAction).toHaveBeenCalledWith('art-1'));
    await waitFor(() => expect(screen.getByText('Publié dans')).toBeDefined());
  });

  it('ne propose un transfert qu’aux rôles autorisés et désactive l’espace courant', async () => {
    renderDrawer({
      articleId: 'art-1',
      canPublish: true,
      workspaces: [personal, media, viewerMedia],
    });

    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());
    // Le média où l'auteur n'est que lecteur ne peut pas recevoir l'article.
    expect(screen.queryByText('Média lecture seule')).toBeNull();

    const current = screen.getByRole('button', { name: /Ada/ });
    expect((current as HTMLButtonElement).disabled).toBe(true);
  });

  it('transfère l’article : payload, catégorie et slug mis à jour', async () => {
    const { onCategoryChange, onSlugChange } = renderDrawer({
      articleId: 'art-1',
      workspaces: [personal, media],
    });

    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));

    await waitFor(() =>
      expect(articleActions.transferArticleAction).toHaveBeenCalledWith({
        articleId: 'art-1',
        targetPublisherId: 'pub-2',
        showOnPersonalProfile: true,
      })
    );
    expect(onCategoryChange).toHaveBeenCalledWith('cat-media');
    expect(onSlugChange).toHaveBeenCalledWith('slug-media');
    expect(toastMock.success).toHaveBeenCalledWith('Article transféré vers La Revue.');
  });

  it('signale un refus de transfert sans changer d’espace', async () => {
    articleActions.transferArticleAction.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Droits insuffisants' },
    });
    const { onCategoryChange } = renderDrawer({
      articleId: 'art-1',
      workspaces: [personal, media],
    });

    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Droits insuffisants'));
    expect(onCategoryChange).not.toHaveBeenCalled();
  });

  it('délègue le transfert au parent quand un handler est fourni', async () => {
    const onTransferPublisher = vi.fn().mockResolvedValue(true);
    renderDrawer({ articleId: 'art-1', onTransferPublisher, workspaces: [personal, media] });

    await waitFor(() => expect(screen.getByText('La Revue')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: /La Revue/ }));

    await waitFor(() => expect(onTransferPublisher).toHaveBeenCalledWith('pub-2'));
    expect(articleActions.transferArticleAction).not.toHaveBeenCalled();
  });

  it('applique la bascule « profil personnel » et revient en arrière si elle échoue', async () => {
    articleActions.bulkUpdateArticlesAction.mockResolvedValueOnce({
      ok: true,
      data: { failed: ['art-1'] },
    });
    renderDrawer({ articleId: 'art-1', workspaces: [personal, media] });

    const toggle = screen.getByRole('switch', {
      name: 'Afficher aussi sur mon profil et mon blog personnel',
    });
    expect(switchState(toggle)).toBe(true);

    fireEvent.click(toggle);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Action impossible'));
    expect(
      switchState(
        screen.getByRole('switch', {
          name: 'Afficher aussi sur mon profil et mon blog personnel',
        })
      )
    ).toBe(true);
  });

  it('nettoie la saisie de slug (minuscules, séparateurs)', () => {
    const { onSlugChange } = renderDrawer();

    fireEvent.change(screen.getByPlaceholderText('mon-titre-article'), {
      target: { value: 'Mon Titre À Moi !' },
    });

    expect(onSlugChange).toHaveBeenCalledWith('mon-titre-moi-');
  });

  it('copie l’URL complète, sous-domaine compris', async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    renderDrawer({ subdomain: 'ada', slug: 'mon-article' });

    fireEvent.click(screen.getByRole('button', { name: /Copier le lien/ }));

    expect(writeText).toHaveBeenCalledWith('https://ada.qoe.fi/ville/mon-article');
    // La copie attend désormais la promesse du presse-papiers : le retour
    // visuel arrive au tour suivant, pas de façon optimiste.
    await waitFor(() => expect(screen.getByText('Copié !')).toBeDefined());
  });

  it('montre l’aperçu SEO et révèle les champs avancés', () => {
    renderDrawer();

    expect(screen.getByText('Titre auto')).toBeDefined();
    expect(screen.getByText('Description auto')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Personnaliser le SEO' }));
    expect(screen.getByPlaceholderText('Titre auto')).toBeDefined();
    expect(screen.getByPlaceholderText('Description auto')).toBeDefined();
  });

  it('préfère le SEO saisi à l’auto-généré', () => {
    renderDrawer({ seoTitle: '  Mon titre SEO  ', seoDescription: 'Ma description' });
    expect(screen.getByText('Mon titre SEO')).toBeDefined();
    // La description apparaît dans l'aperçu et dans le champ avancé.
    expect(screen.getAllByText('Ma description').length).toBeGreaterThan(0);
  });

  it('désactive la génération IA pendant qu’elle tourne', () => {
    renderDrawer({ onGenerateSeo: vi.fn(), seoAiLoading: true, seoTitle: 'Déjà là' });
    const button = screen.getByRole('button', { name: /Générer avec l'IA/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('branche les bascules d’accès et de monétisation', () => {
    const { onTogglePremium, onToggleComments, onTogglePublicAnnotations, onToggleDownload } =
      renderDrawer({ articleId: 'art-1' });

    fireEvent.click(screen.getByRole('switch', { name: 'Article Paywall Premium' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Annotations publiques' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Espace commentaires' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Téléchargement hors-ligne' }));

    expect(onTogglePremium).toHaveBeenCalledWith(true);
    expect(onTogglePublicAnnotations).toHaveBeenCalledWith(false);
    expect(onToggleComments).toHaveBeenCalledWith(false);
    expect(onToggleDownload).toHaveBeenCalledWith(false);
  });

  it('cache le téléchargement hors-ligne avant le premier enregistrement', () => {
    renderDrawer();
    expect(screen.queryByRole('switch', { name: 'Téléchargement hors-ligne' })).toBeNull();
  });

  it('garde les actions destructives derrière leurs conditions', () => {
    const onDiscardDraft = vi.fn();
    const { rerender, onUnpublish } = renderDrawer({
      published: false,
      onDiscardDraft,
    });
    expect(screen.queryByRole('button', { name: /Dépublier l'article/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Abandonner les modifications/ })).toBeNull();

    rerender(
      <EditorSettingsDrawer
        {...baseProps({
          published: true,
          onDiscardDraft,
          hasUnpublishedChanges: true,
          onUnpublish,
        }).props}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Dépublier l'article/ }));
    fireEvent.click(screen.getByRole('button', { name: /Abandonner les modifications/ }));

    expect(onUnpublish).toHaveBeenCalledTimes(1);
    expect(onDiscardDraft).toHaveBeenCalledTimes(1);
  });

  it('n’affiche la programmation que si l’auteur peut publier', () => {
    const { rerender } = renderDrawer({ canPublish: false });
    expect(screen.queryByTestId('schedule')).toBeNull();

    rerender(<EditorSettingsDrawer {...baseProps({ canPublish: true }).props} />);
    expect(screen.getByTestId('schedule')).toBeDefined();
  });

  it('propage la catégorie choisie', async () => {
    const { onCategoryChange } = renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: /Catégorie/ }));
    await act(async () => {
      fireEvent.click(await screen.findByRole('option', { name: 'Non catégorisé' }));
    });

    expect(onCategoryChange).toHaveBeenCalledWith(null);
  });
});
