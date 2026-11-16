// @vitest-environment jsdom
// =====================================================================
// 🧪 EditorToolbar — état des boutons et commandes réellement appliquées
// =====================================================================
// La barre doit dire la vérité : un bouton allumé quand la marque est active,
// bloqué quand la commande n'a pas de sens (code, titre, hors liste). On la
// teste contre un vrai éditeur Tiptap et les extensions du projet.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ArticleImage } from '../../extensions/ArticleImage';
import { AnnotationMark } from '../../extensions/AnnotationMark';
import { GalleryImage, ImageGallery } from '../../extensions/ImageGallery';
import { ParagraphFormatting } from '../../extensions/ParagraphFormatting';
import { PaywallDivider } from '../../extensions/PaywallDivider';
import { EditorToolbar } from '../EditorToolbar';

let editor: Editor | null = null;

function createEditor(content = '<p>Bonjour le monde</p>') {
  editor = new Editor({
    extensions: [
      StarterKit,
      ArticleImage,
      AnnotationMark,
      GalleryImage,
      ImageGallery,
      ParagraphFormatting,
      PaywallDivider,
    ],
    content,
    element: document.createElement('div'),
  });
  return editor;
}

function renderToolbar(
  props: Partial<React.ComponentProps<typeof EditorToolbar>> = {},
  content?: string
) {
  const instance = props.editor ?? createEditor(content);
  const callbacks = {
    onPickImage: vi.fn(),
    onPickGallery: vi.fn(),
    onAnnotation: vi.fn(),
    onLink: vi.fn(),
    onImageDetails: vi.fn(),
  };
  render(
    <EditorToolbar
      editor={instance}
      docked={false}
      isUploading={false}
      uploadCount={0}
      {...callbacks}
      {...props}
    />
  );
  return { ...callbacks, editor: instance };
}

const button = (name: RegExp | string) => screen.getByRole('button', { name });

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('EditorToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('expose une barre ARIA unique avec ses groupes', () => {
    renderToolbar();

    expect(screen.getByRole('toolbar', { name: 'Mise en forme' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Historique' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Style de texte' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Médias' })).toBeDefined();
  });

  it('bloque « Annuler » sans historique puis l’active après une frappe', () => {
    const { editor: instance } = renderToolbar({}, '<p></p>');

    expect(button(/Annuler/).getAttribute('aria-disabled')).toBe('true');

    act(() => {
      instance.commands.setContent('<p>Nouveau texte</p>');
    });
    expect(button(/Annuler/).getAttribute('aria-disabled')).toBe('false');

    fireEvent.click(button(/Annuler/));
    expect(instance.getText()).not.toContain('Nouveau texte');
  });

  it('reflète puis applique les marques de texte', () => {
    const { editor: instance } = renderToolbar();
    instance.chain().setTextSelection({ from: 1, to: 8 }).run();

    expect(button(/Gras/).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button(/Gras/));
    expect(instance.isActive('bold')).toBe(true);
    expect(button(/Gras/).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button(/Italique/));
    expect(instance.isActive('italic')).toBe(true);

    fireEvent.click(button(/Gras/));
    expect(instance.isActive('bold')).toBe(false);
  });

  it('applique les niveaux de titre', () => {
    const { editor: instance } = renderToolbar();

    fireEvent.click(button(/Titre 2/));

    expect(instance.isActive('heading', { level: 2 })).toBe(true);
    expect(button(/Titre 2/).getAttribute('aria-pressed')).toBe('true');
  });

  it('désactive les commandes de paragraphe hors d’un paragraphe', () => {
    renderToolbar({}, '<h1>Titre</h1>');

    expect(button(/Alinéa de première ligne/).getAttribute('aria-disabled')).toBe('true');
    expect(button(/Lettrine/).getAttribute('aria-disabled')).toBe('true');
  });

  it('désactive les marques dans un bloc de code', () => {
    const { editor: instance } = renderToolbar();
    instance.commands.setTextSelection(3);
    fireEvent.click(button(/Bloc de code/));

    expect(instance.isActive('codeBlock')).toBe(true);
    expect(button(/Gras/).getAttribute('aria-disabled')).toBe('true');
    expect(button(/Effacer la mise en forme/).getAttribute('aria-disabled')).toBe('true');
  });

  it('bloque l’imbrication de liste hors d’une liste', () => {
    renderToolbar();

    expect(button(/Imbriquer l'élément/).getAttribute('aria-disabled')).toBe('true');
    expect(button(/Désimbriquer l'élément/).getAttribute('aria-disabled')).toBe('true');
  });

  it('insère une limite Paywall une seule fois', () => {
    const { editor: instance } = renderToolbar();

    fireEvent.click(button(/Insérer la limite Paywall/));

    expect(
      instance.state.doc.content.content.some((node) => node.type.name === 'paywallDivider')
    ).toBe(true);
    const paywallButton = button(/Une limite Paywall est déjà placée/);
    expect(paywallButton.getAttribute('aria-disabled')).toBe('true');
  });

  it('branche les actions médias', () => {
    const { onPickImage, onPickGallery } = renderToolbar();

    fireEvent.click(button(/Insérer une image/));
    fireEvent.click(button(/Insérer une galerie/));

    expect(onPickImage).toHaveBeenCalledTimes(1);
    expect(onPickGallery).toHaveBeenCalledTimes(1);
  });

  it('cache les médiathèque, tableau et sources quand rien n’est branché', () => {
    renderToolbar();

    expect(screen.queryByRole('button', { name: /médiathèque/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Insérer un tableau/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /notes et sources/ })).toBeNull();
  });

  it('expose les actions optionnelles quand elles sont fournies', () => {
    const onOpenMediaLibrary = vi.fn();
    const onInsertTable = vi.fn();
    const onOpenSources = vi.fn();
    renderToolbar({ onOpenMediaLibrary, onInsertTable, onOpenSources });

    fireEvent.click(screen.getByRole('button', { name: /médiathèque/ }));
    fireEvent.click(button(/Insérer un tableau/));
    fireEvent.click(button(/notes et sources/));

    expect(onOpenMediaLibrary).toHaveBeenCalledTimes(1);
    expect(onInsertTable).toHaveBeenCalledTimes(1);
    expect(onOpenSources).toHaveBeenCalledTimes(1);
  });

  it('affiche l’avancement de l’envoi et permet de l’interrompre', () => {
    const onCancelUpload = vi.fn();
    renderToolbar({
      isUploading: true,
      uploadCount: 3,
      uploadProgress: { current: 2, total: 3, fileName: 'photo.jpg' },
      onCancelUpload,
    });

    const status = screen.getByRole('status');
    expect(status.textContent).toContain('2/3');
    expect(status.textContent).toContain('photo.jpg');

    fireEvent.click(screen.getByRole('button', { name: "Annuler l'envoi" }));
    expect(onCancelUpload).toHaveBeenCalledTimes(1);
  });

  it('bloque les insertions média pendant un envoi', () => {
    renderToolbar({ isUploading: true, uploadCount: 2 });

    expect(button(/Envoi en cours \(2\)/).getAttribute('aria-disabled')).toBe('true');
    expect(button(/Insérer une galerie/).getAttribute('aria-disabled')).toBe('true');
  });

  it('n’active la légende d’image que sur une image sélectionnée', () => {
    const { editor: instance, onImageDetails } = renderToolbar(
      {},
      '<p>Texte</p><img src="https://cdn.qoe.fi/a.jpg" alt="Une photo">'
    );

    expect(
      screen.getByRole('button', { name: /Sélectionnez une image/ }).getAttribute('aria-disabled')
    ).toBe('true');

    let imagePos: number | null = null;
    instance.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return true;
    });
    act(() => {
      instance.commands.setNodeSelection(imagePos as unknown as number);
    });

    const details = screen.getByRole('button', { name: /Légende et crédit de l'image/ });
    expect(details.getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(details);
    expect(onImageDetails).toHaveBeenCalledTimes(1);
  });

  it('parcourt la barre au clavier avec une seule tabulation', () => {
    renderToolbar();
    const toolbar = screen.getByRole('toolbar');
    const items = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('[data-toolbar-item]'));
    expect(items.length).toBeGreaterThan(2);
    expect(items.filter((item) => item.tabIndex === 0)).toHaveLength(1);

    items[0].focus();
    fireEvent.keyDown(items[0], { key: 'ArrowRight' });

    expect(document.activeElement).toBe(items[1]);
    expect(items.filter((item) => item.tabIndex === 0)).toEqual([items[1]]);
  });

  it('n’applique pas les boutons désactivés au clic', () => {
    const { editor: instance } = renderToolbar({}, '<p></p>');

    const historyLength = instance.state.doc.content.size;
    fireEvent.click(button(/Annuler/));

    expect(instance.state.doc.content.size).toBe(historyLength);
  });
});
