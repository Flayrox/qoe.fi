// @vitest-environment jsdom
// =====================================================================
// 🧪 ReaderPreviewDialog — aperçu lecteur et limite Premium
// =====================================================================
// L'aperçu sert à vérifier ce que voit un lecteur : couverture, longueur,
// largeur d'appareil et surtout l'endroit exact où le paywall coupe le
// texte. On teste le contenu réellement injecté, pas seulement les libellés.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { PaywallDivider } from '../../extensions/PaywallDivider';

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

import { ReaderPreviewDialog } from '../ReaderPreviewDialog';

let editor: Editor | null = null;

function createEditor(html: string) {
  editor = new Editor({
    extensions: [StarterKit, PaywallDivider],
    content: html,
    element: document.createElement('div'),
  });
  return editor;
}

/** Document coupé par une limite Premium : contenu public puis contenu payant. */
function createPremiumEditor() {
  return createEditor(
    '<p>Partie publique.</p><div data-type="paywall-divider"></div><p>Partie abonnés secrète.</p>'
  );
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof ReaderPreviewDialog>> = {},
  html = '<p>Le début de l’article pour tout le monde.</p>'
) {
  const instance = props.editor ?? createEditor(html);
  const onClose = vi.fn();
  render(<ReaderPreviewDialog open onClose={onClose} editor={instance} title="Essai" {...props} />);
  return { onClose, editor: instance };
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('ReaderPreviewDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne rend rien quand la boîte est fermée', () => {
    render(
      <ReaderPreviewDialog
        open={false}
        onClose={vi.fn()}
        editor={createEditor('<p>Texte</p>')}
        title="Essai"
      />
    );
    expect(screen.queryByText('Aperçu lecteur')).toBeNull();
  });

  it('affiche le titre, le corps et le temps de lecture', () => {
    const words = Array.from({ length: 401 }, (_, i) => `mot${i}`).join(' ');
    renderDialog({}, `<p>${words}</p>`);

    expect(screen.getByText('Essai')).toBeDefined();
    expect(screen.getByText('3 min de lecture')).toBeDefined();
    expect(screen.getByText(/mot0/)).toBeDefined();
  });

  it('replie sur un titre générique quand le champ est vide', () => {
    renderDialog({ title: '   ' });
    expect(screen.getByText("Titre de l'article")).toBeDefined();
  });

  it('change de largeur selon l’appareil choisi', () => {
    renderDialog();

    const desktop = screen.getByRole('button', { name: 'Bureau' });
    const mobile = screen.getByRole('button', { name: 'Mobile' });
    expect(desktop.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(mobile);

    expect(mobile.getAttribute('aria-pressed')).toBe('true');
    expect(desktop.getAttribute('aria-pressed')).toBe('false');
    // La carte d'aperçu suit la largeur mobile.
    const card = document.querySelector('.max-w-\\[390px\\]');
    expect(card).not.toBeNull();
  });

  it('décrit la couverture avec le titre, sauf si elle est décorative', () => {
    const { rerender } = render(
      <ReaderPreviewDialog
        open
        onClose={vi.fn()}
        editor={createEditor('<p>Texte</p>')}
        title="Essai"
        imageUrl="https://cdn.qoe.fi/a.jpg"
      />
    );
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('Essai');

    // Une couverture décorative ne doit pas être annoncée aux lecteurs d'écran.
    rerender(
      <ReaderPreviewDialog
        open
        onClose={vi.fn()}
        editor={editor!}
        title="Essai"
        imageUrl="https://cdn.qoe.fi/a.jpg"
        coverDecorative
      />
    );
    // `alt=""` rend l'image décorative : plus de rôle `img`, mais un alt vide.
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('');
  });

  it('coupe le contenu à la limite Premium et annonce les mots restants', () => {
    renderDialog({ isPremium: true, editor: createPremiumEditor() });

    expect(screen.getByText('La suite est réservée aux abonnés')).toBeDefined();
    expect(screen.getByText(/partie publique/i)).toBeDefined();
    expect(screen.queryByText(/secrète/)).toBeNull();
  });

  it('révèle la suite pour l’auteur sans quitter l’aperçu', () => {
    renderDialog({ isPremium: true, editor: createPremiumEditor() });

    fireEvent.click(screen.getByRole('button', { name: 'Afficher la suite (aperçu auteur)' }));

    expect(screen.getByText(/Partie abonnés secrète/)).toBeDefined();
    expect(screen.queryByText('La suite est réservée aux abonnés')).toBeNull();
  });

  it('ne coupe rien pour un article non Premium', () => {
    renderDialog({ isPremium: false, editor: createPremiumEditor() });

    expect(screen.getByText(/Partie abonnés secrète/)).toBeDefined();
    expect(screen.queryByText('La suite est réservée aux abonnés')).toBeNull();
  });

  it('affiche tout quand aucune limite n’est posée, même en Premium', () => {
    renderDialog({ isPremium: true }, '<p>Article entier sans limite.</p>');

    expect(screen.getByText(/Article entier sans limite/)).toBeDefined();
    expect(screen.queryByText('La suite est réservée aux abonnés')).toBeNull();
  });

  it('referme la boîte sur demande', () => {
    const { onClose } = renderDialog();

    // La boîte de dialogue a aussi sa croix : on vise le bouton du pied.
    const closeButtons = screen.getAllByRole('button', { name: 'Fermer' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    // Le dialogue peut signaler sa fermeture deux fois (bouton + état) :
    // ce qui compte est que la fermeture soit demandée.
    expect(onClose).toHaveBeenCalled();
  });
});
