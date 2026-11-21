// @vitest-environment jsdom
// =====================================================================
// 🧪 Editor — les bascules enregistrent le NOUVEL état
// =====================================================================
// Rouge mesuré avant correctif : « Published »/« Premium » appelaient
// `setPublished(!published)` puis une sauvegarde différée qui relisait l'état
// capturé à la génération précédente — la bascule partait donc en base un clic
// en retard. « Dispatch » faisait la même chose : il annonçait publier et
// sauvait un brouillon.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { editorStub, calls } = vi.hoisted(() => {
  const calls: string[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_target, prop) => {
        calls.push(String(prop));
        return prop === 'run' ? () => true : () => chain;
      },
    }
  );
  return {
    calls,
    editorStub: {
      chain: () => chain,
      isActive: () => false,
      getHTML: () => '<p>corps</p>',
    },
  };
});

vi.mock('@tiptap/react', () => ({ useEditor: () => editorStub, EditorContent: () => null }));
vi.mock('@qoe/ui/ui/ImageEditorDialog', () => ({ ImageEditorDialog: () => null }));

import { Editor } from '../components/Editor';

describe('Editor', () => {
  afterEach(() => {
    cleanup();
    calls.length = 0;
    vi.unstubAllGlobals();
  });

  it('publie l’état cliqué, pas l’état précédent', async () => {
    const onSave = vi.fn(async () => {});
    render(
      <Editor
        initialTitle="Titre"
        initialSlug="titre"
        initialContent="<p>corps</p>"
        isSaving={false}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ published: true }));
  });

  it('« Dispatch » sauvegarde bien une publication', async () => {
    vi.stubGlobal('alert', vi.fn());
    const onSave = vi.fn(async () => {});
    render(
      <Editor
        initialTitle="Titre"
        initialSlug="titre"
        initialContent="<p>corps</p>"
        isSaving={false}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Dispatch/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ published: true }));
  });

  it('le bouton de coupure paywall insère le nœud', () => {
    const onSave = vi.fn(async () => {});
    render(
      <Editor
        initialTitle="Titre"
        initialSlug="titre"
        initialContent="<p>corps</p>"
        isSaving={false}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByTitle('Insert Paywall Cut'));

    expect(calls).toContain('setPaywallDivider');
  });
});
