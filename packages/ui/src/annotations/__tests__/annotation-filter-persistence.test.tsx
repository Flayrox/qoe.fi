// @vitest-environment jsdom
// =====================================================================
// 🎚️ Filtre d'annotations — le choix enregistré doit revenir
// =====================================================================
// 📖 Le mode est persisté dans `localStorage`, mais la whitelist de
//    relecture omettait `mine` : un lecteur qui avait choisi « Mes
//    annotations » retrouvait « Toutes » à chaque rechargement, sans rien
//    avoir demandé. Le test pose le choix enregistré puis vérifie l'état
//    réellement coché dans le rail.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TextHighlighter } from '../TextHighlighter';

const STORAGE_KEY = 'qoe_annotation_filter_mode';

/**
 * Ce Node n'expose pas `localStorage` (il exige `--localstorage-file`) :
 * l'environnement de test n'en fournit donc aucun, et le composant retombe
 * silencieusement sur son `try/catch`. On installe un stockage mémoire pour
 * éprouver réellement la relecture — pas une simulation du comportement.
 */
function installMemoryStorage(): Map<string, string> {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
  return store;
}

function mountArticle() {
  document.body.innerHTML = `<div id="article-content"><p>La lenteur change la phrase.</p></div>`;
}

function renderHighlighter() {
  return render(
    <TextHighlighter
      articleId="article-1"
      creatorName="Auteur"
      allowPublicAnnotations
      isAuthenticated
      initialHighlights={[]}
      publicHighlights={[]}
      mainAppUrl=""
      containerId="article-content"
      currentUserId="reader-1"
    />
  );
}

describe('TextHighlighter — filtre d’annotations persisté', () => {
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = installMemoryStorage();
    mountArticle();
  });

  it('restaure le mode « mes annotations » enregistré', () => {
    storage.set(STORAGE_KEY, 'mine');

    renderHighlighter();

    expect(
      screen.getByRole('radio', { name: /mes annotations/i }).getAttribute('aria-checked')
    ).toBe('true');
    expect(screen.getByRole('radio', { name: /toutes/i }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('restaure aussi le mode « aucune » enregistré', () => {
    storage.set(STORAGE_KEY, 'none');

    renderHighlighter();

    expect(screen.getByRole('radio', { name: /aucune/i }).getAttribute('aria-checked')).toBe(
      'true'
    );
  });

  it('ignore une valeur inconnue plutôt que de laisser un rail sans sélection', () => {
    storage.set(STORAGE_KEY, 'n-importe-quoi');

    renderHighlighter();

    expect(screen.getByRole('radio', { name: /toutes/i }).getAttribute('aria-checked')).toBe(
      'true'
    );
  });
});
