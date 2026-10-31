// @vitest-environment jsdom
// =====================================================================
// 🗂️ tiroir d'annotation — les gestes qu'on ne peut pas vérifier à l'œil
// =====================================================================
// 📖 Trois comportements ont une conséquence qu'une capture ne montre pas :
//    une suppression qui ne passe plus par un dialogue natif bloquant, un
//    lien « Voir » qui mène au fil de l'application principale (et non à un
//    `/feed` inexistant sur le domaine d'un blog), et une confirmation dont
//    le premier focus est « Annuler ».
// =====================================================================

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { AnnotationSideDrawer } from '../AnnotationSideDrawer';
import type { AnnotationItem } from '../types';

const annotation: AnnotationItem = {
  id: 'hl-1',
  text: 'La lenteur change la phrase',
  note: 'À reprendre en ouverture',
  isPublic: true,
  isOfficial: false,
  upvotesCount: 4,
  createdAt: '2026-09-04T18:40:00.000Z',
  reader: { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null },
};

function renderDrawer(overrides: Partial<React.ComponentProps<typeof AnnotationSideDrawer>> = {}) {
  return render(
    <AnnotationSideDrawer
      articleId="article-1"
      annotation={annotation}
      isAuthenticated
      currentUserId="reader-1"
      mainAppUrl="https://qoe.fi"
      onClose={() => {}}
      {...overrides}
    />
  );
}

describe('AnnotationSideDrawer — confirmation de suppression', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  it('confirme DANS le tiroir, sans dialogue natif', async () => {
    const onDelete = vi.fn().mockResolvedValue({ ok: true });
    const nativeConfirm = vi.spyOn(window, 'confirm');

    renderDrawer({ callbacks: { onDelete } });

    fireEvent.click(screen.getByTitle('Supprimer cette annotation'));

    const confirmation = screen.getByRole('group', { name: 'Confirmer la suppression' });
    expect(confirmation).toBeTruthy();
    // Le geste destructeur n'est pas encore parti : il attend le second clic.
    expect(onDelete).not.toHaveBeenCalled();
    expect(nativeConfirm).not.toHaveBeenCalled();

    // Le premier focus est la sortie, pas la destruction.
    expect(document.activeElement).toBe(
      within(confirmation).getByRole('button', { name: 'Annuler' })
    );

    fireEvent.click(within(confirmation).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('hl-1'));
    nativeConfirm.mockRestore();
  });

  it('referme la confirmation sans rien supprimer', () => {
    const onDelete = vi.fn();
    renderDrawer({ callbacks: { onDelete } });

    fireEvent.click(screen.getByTitle('Supprimer cette annotation'));
    const confirmation = screen.getByRole('group', { name: 'Confirmer la suppression' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('group', { name: 'Confirmer la suppression' })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('ne propose ni modification ni suppression sur l’annotation d’un autre', () => {
    renderDrawer({ currentUserId: 'reader-2' });

    expect(screen.queryByTitle('Supprimer cette annotation')).toBeNull();
    expect(screen.queryByTitle('Modifier cette annotation')).toBeNull();
  });

  it('ne verrouille le défilement de l’arrière-plan que tant que le tiroir est ouvert', () => {
    const { unmount } = renderDrawer();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('AnnotationSideDrawer — surlignage ou annotation', () => {
  const bareHighlight: AnnotationItem = {
    id: 'hl-2',
    text: 'Une phrase repère',
    note: null,
    isPublic: false,
    isOfficial: false,
    upvotesCount: 0,
    createdAt: '2026-09-04T18:40:00.000Z',
    reader: { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null },
  };

  it('n’annonce pas un surlignage comme une annotation', () => {
    renderDrawer({ annotation: bareHighlight });

    expect(screen.getByText('Surlignage')).toBeTruthy();
    expect(screen.getByText('Ce passage est surligné.')).toBeTruthy();
    // Ni note vide, ni discussion, ni vote : un trait n’a rien à dire.
    expect(screen.queryByText(/Discussion/)).toBeNull();
    expect(screen.queryByRole('button', { name: /utile/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajouter une note' })).toBeTruthy();
  });

  it('ne propose pas de publier un surlignage nu en citation', () => {
    renderDrawer({ annotation: bareHighlight });

    expect(screen.queryByRole('button', { name: /Citer cette annotation/ })).toBeNull();
    expect(screen.getByText(/Un surlignage n’a pas de texte à citer/)).toBeTruthy();
  });

  it('ne propose pas de publier une annotation privée en citation', () => {
    renderDrawer({
      annotation: { ...annotation, isPublic: false },
      currentUserId: 'reader-1',
    });

    expect(screen.queryByRole('button', { name: /Citer cette annotation/ })).toBeNull();
    expect(screen.getByText(/Cette annotation est privée/)).toBeTruthy();
  });

  it('promeut le surlignage en annotation quand on y ajoute un texte', async () => {
    const onUpdateNote = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        highlight: {
          ...bareHighlight,
          note: 'À creuser en deuxième lecture',
          isPublic: false,
        },
      },
    });
    renderDrawer({ annotation: bareHighlight, callbacks: { onUpdateNote } });

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une note' }));

    const field = screen.getByRole('textbox', { name: 'Ajouter une note à ce surlignage' });
    fireEvent.change(field, { target: { value: 'À creuser en deuxième lecture' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annoter' }));

    await waitFor(() =>
      expect(onUpdateNote).toHaveBeenCalledWith({
        highlightId: 'hl-2',
        note: 'À creuser en deuxième lecture',
      })
    );

    // Le même objet est devenu une annotation : libellé et note.
    expect(await screen.findByText('Annotation')).toBeTruthy();
    expect(screen.getByText('À creuser en deuxième lecture')).toBeTruthy();
    // …mais privée : personne d'autre ne la voit, donc pas de fil à tenir.
    expect(screen.queryByText(/Discussion/)).toBeNull();
  });

  it('ouvre la discussion seulement quand l’annotation est partagée', () => {
    const { rerender } = renderDrawer({ annotation: bareHighlight });
    expect(screen.queryByText(/Discussion/)).toBeNull();

    rerender(
      <AnnotationSideDrawer
        articleId="article-1"
        annotation={{ ...bareHighlight, isPublic: true, note: 'Note publique' }}
        isAuthenticated
        currentUserId="reader-1"
        mainAppUrl="https://qoe.fi"
        onClose={() => {}}
      />
    );

    expect(screen.getByText(/Discussion/)).toBeTruthy();
  });

  it('rend la note renvoyée par le serveur, pas le brouillon local', async () => {
    const serverAnnotation = {
      ...bareHighlight,
      note: 'Version validée par le serveur',
      isPublic: true,
      updatedAt: '2026-09-06T10:00:00.000Z',
    };
    const onUpdateNote = vi.fn().mockResolvedValue({
      ok: true,
      data: { highlight: serverAnnotation },
    });
    const onUpdateAnnotation = vi.fn();

    renderDrawer({
      annotation: bareHighlight,
      callbacks: { onUpdateNote },
      onUpdateAnnotation,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une note' }));
    const field = screen.getByRole('textbox', { name: 'Ajouter une note à ce surlignage' });
    fireEvent.change(field, { target: { value: 'Brouillon local qui ne doit pas gagner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annoter' }));

    expect(await screen.findByText('Version validée par le serveur')).toBeTruthy();
    expect(screen.queryByText('Brouillon local qui ne doit pas gagner')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Ajouter une note à ce surlignage' })).toBeNull();
    expect(onUpdateAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'hl-2',
        note: 'Version validée par le serveur',
        isPublic: true,
        updatedAt: '2026-09-06T10:00:00.000Z',
      })
    );
  });

  it('garde l’annotation intacte et affiche le refus du serveur', async () => {
    const onUpdateNote = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'HIGHLIGHT_UPDATE_FAILED', message: 'Le serveur a refusé cette note.' },
    });
    const onUpdateAnnotation = vi.fn();

    renderDrawer({
      annotation: bareHighlight,
      callbacks: { onUpdateNote },
      onUpdateAnnotation,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une note' }));
    const field = screen.getByRole('textbox', { name: 'Ajouter une note à ce surlignage' });
    fireEvent.change(field, { target: { value: 'Brouillon refusé' } });
    fireEvent.click(screen.getByRole('button', { name: 'Annoter' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Le serveur a refusé cette note.');
    expect(onUpdateAnnotation).not.toHaveBeenCalled();

    // Rien n’a été promu : le passage reste un surlignage, le brouillon est
    // conservé dans le formulaire pour une nouvelle tentative.
    expect(screen.getByText('Surlignage')).toBeTruthy();
    expect(screen.queryByText('Brouillon refusé', { selector: 'p' })).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Brouillon refusé');
  });

  it('n’envoie pas une note vide (elle ne promouvrait rien)', () => {
    const onUpdateNote = vi.fn();
    renderDrawer({ annotation: bareHighlight, callbacks: { onUpdateNote } });

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une note' }));
    const field = screen.getByRole('textbox', { name: 'Ajouter une note à ce surlignage' });
    fireEvent.change(field, { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Annoter' })).toHaveProperty('disabled', true);
    expect(onUpdateNote).not.toHaveBeenCalled();
  });

  it('garde les flèches de pagination dans l’en-tête, même sur un seul passage', () => {
    renderDrawer({ annotation: bareHighlight });

    expect(screen.getByText('1 / 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annotation précédente' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('button', { name: 'Annotation suivante' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('lit le même accent que la marque, privée comprise', () => {
    const { rerender } = renderDrawer({
      annotation: { ...annotation, note: 'Note privée', isPublic: false },
    });
    const accent = () =>
      screen.getByRole('dialog').style.getPropertyValue('--qoe-annotation-accent');

    expect(accent()).toBe('var(--annotation-private)');

    const props = (next: Partial<AnnotationItem>) => (
      <AnnotationSideDrawer
        articleId="article-1"
        annotation={{ ...annotation, ...next }}
        isAuthenticated
        currentUserId="reader-1"
        mainAppUrl="https://qoe.fi"
        onClose={() => {}}
      />
    );

    rerender(props({ note: 'Note publique', isPublic: true }));
    expect(accent()).toBe('var(--annotation-public)');

    rerender(props({ isOfficial: true }));
    expect(accent()).toBe('var(--annotation-official)');

    rerender(props({ note: null, isPublic: false, isOfficial: false }));
    expect(accent()).toBe('var(--annotation-highlight)');
  });

  it('garde le carré à bords arrondis d’un compte média', () => {
    renderDrawer({
      annotation: {
        ...annotation,
        reader: { ...annotation.reader, name: 'Camille', type: 'MEDIA' },
      },
    });

    const avatar = document.querySelector('[data-account-type="MEDIA"]');
    expect(avatar).not.toBeNull();
    expect(avatar!.getAttribute('data-avatar-shape')).toBe('square');
    expect(avatar!.getAttribute('data-avatar-entity')).toBe('media');
    expect(avatar!.className).toContain('rounded-[var(--radius-sm)]');
    expect(avatar!.className).not.toContain('rounded-full');
  });

  it('donne une fiche de profil au survol de l’auteur et des réponses', () => {
    renderDrawer({
      annotation: {
        ...annotation,
        reader: { ...annotation.reader, name: 'Camille', username: 'camille', type: 'MEDIA' },
        comments: [
          {
            id: 'comment-1',
            content: 'Le décalage entre les deux occurrences est tout l’article.',
            createdAt: '2026-09-05T09:02:00.000Z',
            author: {
              id: 'reader-2',
              name: 'Noé',
              username: 'noe',
              logoUrl: null,
              type: 'PERSONAL',
            },
          },
        ],
      },
    });

    // La carte est branchée sur l’identité de l’auteur ET sur celle de la
    // réponse : sans elle, un nom dans le tiroir n’ouvre aucune fiche.
    const triggers = document.querySelectorAll('[data-slot="hover-card-trigger"]');
    expect(triggers.length).toBeGreaterThanOrEqual(3);
    expect([...triggers].some((trigger) => trigger.textContent?.includes('Camille'))).toBe(true);
    expect([...triggers].some((trigger) => trigger.textContent?.includes('Noé'))).toBe(true);
  });
});

describe('AnnotationSideDrawer — citation d’une annotation', () => {
  const anchored: AnnotationItem = {
    ...annotation,
    quoteOrdinal: 1,
    canonicalStart: 420,
    canonicalEnd: 450,
    contentSha: 'sha-1',
    reader: { id: 'reader-2', name: 'Camille', username: 'camille', logoUrl: null },
  };

  it('cite la note, le passage et son auteur — pas un commentaire libre', async () => {
    const onCiteAnnotation = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { url: '/camille/thought/p1' } });
    renderDrawer({
      annotation: anchored,
      callbacks: { onCiteAnnotation },
      mainAppUrl: 'https://qoe.fi',
    });

    fireEvent.click(screen.getByRole('button', { name: /Citer cette annotation/ }));

    // L'aperçu dit ce qui part : l'attribution et la note.
    expect(screen.getByText('Sera publié sur Qoefi')).toBeTruthy();
    expect(screen.getByText(/Annotation de Camille/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Publier la citation/ }));

    await waitFor(() => expect(onCiteAnnotation).toHaveBeenCalledTimes(1));
    const payload = onCiteAnnotation.mock.calls[0][0];
    expect(payload.articleId).toBe('article-1');
    expect(payload.citation).toMatchObject({
      id: 'hl-1',
      note: 'À reprendre en ouverture',
      excerpt: 'La lenteur change la phrase',
      quoteOrdinal: 1,
      canonicalStart: 420,
      canonicalEnd: 450,
      contentSha: 'sha-1',
      reader: { username: 'camille' },
    });

    // « Voir » mène à la citation publiée, sur l'application principale.
    const link = await screen.findByRole('link', { name: 'Voir' });
    expect(link.getAttribute('href')).toBe('https://qoe.fi/camille/thought/p1');
  });

  it('dit pourquoi le serveur refuse une citation qu’il ne juge plus publiable', async () => {
    const onCiteAnnotation = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'ANNOTATION_NOT_CITABLE' },
    });
    renderDrawer({ callbacks: { onCiteAnnotation } });

    fireEvent.click(screen.getByRole('button', { name: /Citer cette annotation/ }));
    fireEvent.click(screen.getByRole('button', { name: /Publier la citation/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Cette annotation ne peut pas être citée');
    // Le formulaire reste ouvert : rien n'a été publié.
    expect(screen.getByRole('button', { name: /Publier la citation/ })).toBeTruthy();
  });

  it('replie sur l’accueil de l’application principale sans lien de post', async () => {
    const onCiteAnnotation = vi.fn().mockResolvedValue({ ok: true });
    renderDrawer({ callbacks: { onCiteAnnotation }, mainAppUrl: 'https://qoe.fi' });

    fireEvent.click(screen.getByRole('button', { name: /Citer cette annotation/ }));
    fireEvent.click(screen.getByRole('button', { name: /Publier la citation/ }));

    const link = await screen.findByRole('link', { name: 'Voir' });
    expect(link.getAttribute('href')).toBe('https://qoe.fi/home');
  });

  it('replie sur le chemin relatif quand aucun domaine principal n’est fourni', async () => {
    const onCiteAnnotation = vi.fn().mockResolvedValue({ ok: true });
    renderDrawer({ callbacks: { onCiteAnnotation }, mainAppUrl: '' });

    fireEvent.click(screen.getByRole('button', { name: /Citer cette annotation/ }));
    fireEvent.click(screen.getByRole('button', { name: /Publier la citation/ }));

    const link = await screen.findByRole('link', { name: 'Voir' });
    expect(link.getAttribute('href')).toBe('/home');
  });
});

describe('AnnotationSideDrawer — navigation multi-annotations (allArticleAnnotations)', () => {
  const officialAnnotation: AnnotationItem = {
    id: 'hl-nav-official',
    text: 'Passage officiel de l’auteur',
    note: 'Note officielle certifiée',
    isOfficial: true,
    isPublic: true,
    upvotesCount: 5,
    createdAt: '2026-09-01T10:00:00.000Z',
    reader: { id: 'author-1', name: 'Auteur', username: 'author', logoUrl: null },
  };

  const publicAnnotation: AnnotationItem = {
    id: 'hl-nav-public',
    text: 'Passage public d’un lecteur',
    note: 'Note publique partagée',
    isOfficial: false,
    isPublic: true,
    upvotesCount: 2,
    createdAt: '2026-09-02T10:00:00.000Z',
    reader: { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null },
  };

  const privateAnnotation: AnnotationItem = {
    id: 'hl-nav-private',
    text: 'Passage privé personnel',
    note: 'Note confidentielle',
    isOfficial: false,
    isPublic: false,
    upvotesCount: 0,
    createdAt: '2026-09-03T10:00:00.000Z',
    reader: { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null },
  };

  const bareHighlight: AnnotationItem = {
    id: 'hl-nav-highlight',
    text: 'Passage simple surligné',
    note: null,
    isOfficial: false,
    isPublic: false,
    upvotesCount: 0,
    createdAt: '2026-09-04T10:00:00.000Z',
    reader: { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null },
  };

  const allAnnotations = [officialAnnotation, publicAnnotation, privateAnnotation, bareHighlight];

  it('cliquer sur Annotation précédente / Annotation suivante met à jour l’annotation active, le compteur et le jeton d’accent', () => {
    renderDrawer({
      annotation: officialAnnotation,
      allArticleAnnotations: allAnnotations,
      currentUserId: 'reader-1',
    });

    const dialog = screen.getByRole('dialog');
    const prevBtn = screen.getByRole('button', { name: 'Annotation précédente' });
    const nextBtn = screen.getByRole('button', { name: 'Annotation suivante' });

    // Index 0: Officielle
    expect(screen.getByText('1 / 4')).toBeTruthy();
    expect(screen.getByText('Officielle')).toBeTruthy();
    expect(screen.getByText('« Passage officiel de l’auteur »')).toBeTruthy();
    expect(dialog.style.getPropertyValue('--qoe-annotation-accent')).toBe(
      'var(--annotation-official)'
    );
    expect(prevBtn.hasAttribute('disabled')).toBe(true);
    expect(nextBtn.hasAttribute('disabled')).toBe(false);

    // Suivant -> Index 1: Publique
    fireEvent.click(nextBtn);
    expect(screen.getByText('2 / 4')).toBeTruthy();
    expect(screen.getByText('Annotation')).toBeTruthy();
    expect(screen.getByText('« Passage public d’un lecteur »')).toBeTruthy();
    expect(dialog.style.getPropertyValue('--qoe-annotation-accent')).toBe(
      'var(--annotation-public)'
    );
    expect(prevBtn.hasAttribute('disabled')).toBe(false);
    expect(nextBtn.hasAttribute('disabled')).toBe(false);

    // Suivant -> Index 2: Privée
    fireEvent.click(nextBtn);
    expect(screen.getByText('3 / 4')).toBeTruthy();
    expect(screen.getByText('Annotation')).toBeTruthy();
    expect(screen.getByText('« Passage privé personnel »')).toBeTruthy();
    expect(dialog.style.getPropertyValue('--qoe-annotation-accent')).toBe(
      'var(--annotation-private)'
    );
    expect(nextBtn.hasAttribute('disabled')).toBe(false);

    // Suivant -> Index 3: Surlignage
    fireEvent.click(nextBtn);
    expect(screen.getByText('4 / 4')).toBeTruthy();
    expect(screen.getByText('Surlignage')).toBeTruthy();
    expect(screen.getByText('« Passage simple surligné »')).toBeTruthy();
    expect(dialog.style.getPropertyValue('--qoe-annotation-accent')).toBe(
      'var(--annotation-highlight)'
    );
    expect(nextBtn.hasAttribute('disabled')).toBe(true);

    // Précédent -> Retour à Index 2: Privée
    fireEvent.click(prevBtn);
    expect(screen.getByText('3 / 4')).toBeTruthy();
    expect(dialog.style.getPropertyValue('--qoe-annotation-accent')).toBe(
      'var(--annotation-private)'
    );
  });

  it('navigue au clavier avec ArrowLeft / ArrowRight, mais ignore la navigation quand le focus est dans un champ de saisie', () => {
    renderDrawer({
      annotation: officialAnnotation,
      allArticleAnnotations: allAnnotations,
      currentUserId: 'reader-1',
    });

    expect(screen.getByText('1 / 4')).toBeTruthy();

    // ArrowRight sur window avance à 2 / 4
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 4')).toBeTruthy();

    // ArrowRight sur window avance à 3 / 4
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('3 / 4')).toBeTruthy();

    // ArrowLeft sur window recule à 2 / 4
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('2 / 4')).toBeTruthy();

    // Focus sur le champ de réponse de la discussion (présent sur l'annotation publique)
    const replyInput = screen.getByLabelText('Votre réponse');
    replyInput.focus();

    // La frappe d'ArrowRight / ArrowLeft dans le champ de saisie ne doit PAS naviguer
    fireEvent.keyDown(replyInput, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 4')).toBeTruthy();

    fireEvent.keyDown(replyInput, { key: 'ArrowLeft' });
    expect(screen.getByText('2 / 4')).toBeTruthy();

    // Après blur, ArrowRight refonctionne
    replyInput.blur();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('3 / 4')).toBeTruthy();
  });

  it('réinitialise l’état de l’UI (formulaire de citation, confirmation de suppression, édition de note) lors du changement d’annotation', () => {
    renderDrawer({
      annotation: publicAnnotation,
      allArticleAnnotations: allAnnotations,
      currentUserId: 'reader-1',
    });

    const nextBtn = screen.getByRole('button', { name: 'Annotation suivante' });
    const prevBtn = screen.getByRole('button', { name: 'Annotation précédente' });

    // Initialement sur l'annotation publique (2 / 4)
    expect(screen.getByText('2 / 4')).toBeTruthy();

    // 1. Ouvrir le formulaire de citation
    fireEvent.click(screen.getByRole('button', { name: /Citer cette annotation/ }));
    expect(screen.getByText('Sera publié sur Qoefi')).toBeTruthy();

    // Naviguer vers la suivante (3 / 4 - privée) : le formulaire de citation se referme
    fireEvent.click(nextBtn);
    expect(screen.getByText('3 / 4')).toBeTruthy();
    expect(screen.queryByText('Sera publié sur Qoefi')).toBeNull();

    // 2. Ouvrir la confirmation de suppression sur l'annotation privée
    fireEvent.click(screen.getByTitle('Supprimer cette annotation'));
    expect(screen.getByRole('group', { name: 'Confirmer la suppression' })).toBeTruthy();

    // Naviguer vers la précédente (2 / 4) : la confirmation de suppression se referme
    fireEvent.click(prevBtn);
    expect(screen.getByText('2 / 4')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Confirmer la suppression' })).toBeNull();

    // Naviguer vers l'annotation privée (3 / 4)
    fireEvent.click(nextBtn);
    expect(screen.getByText('3 / 4')).toBeTruthy();

    // 3. Ouvrir l'édition de la note
    fireEvent.click(screen.getByTitle('Modifier cette annotation'));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();

    // Naviguer vers le surlignage (4 / 4) : le mode édition se referme
    fireEvent.click(nextBtn);
    expect(screen.getByText('4 / 4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
  });
});
