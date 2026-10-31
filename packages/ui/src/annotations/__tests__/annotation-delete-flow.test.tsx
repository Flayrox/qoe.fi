// @vitest-environment jsdom
// =====================================================================
// 🗑️ supprimer une annotation en mode document — sans casser React
// =====================================================================
// 📖 En mode canonique, c'est React qui possède le corps de l'article :
//    chaque `<mark>` est un élément de son arbre. Le moteur retirait la
//    marque À LA MAIN après une suppression (insérer ses enfants dans le
//    parent, puis la retirer), ce que React voyait comme une disparition
//    inexpliquée. Au commit suivant il tentait de retirer un nœud qui
//    n'était plus son enfant :
//
//        NotFoundError: Failed to execute 'removeChild' on 'Node':
//        The node to be removed is not a child of this node.
//
// 🎯 Conséquence réelle : après un clic sur « Supprimer », la page
//    entière tombait sur l'écran d'erreur de Next — pas seulement le
//    tiroir. Ce fichier verrouille les trois choses qui doivent être
//    vraies ensemble : la marque disparaît, le tiroir se referme, et
//    React n'a jamais à retirer un nœud qu'on lui a volé.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { TextHighlighter } from '../TextHighlighter';
import type { AnnotationItem, HighlightItem } from '../types';
import type { CanonicalDocument } from '../canonical-document';

const PASSAGE = 'Un écrivain ne devrait publier que ce qu’il relirait deux fois.';

/** Un bloc, un segment : le minimum pour que les offsets désignent le passage. */
function buildDocument(): CanonicalDocument {
  return {
    blocks: [{ kind: 'p', text: PASSAGE }],
    segments: [{ blockIdx: 0, itemIdx: 0, text: PASSAGE, start: 0, end: PASSAGE.length }],
    text: PASSAGE,
    sha: 'sha-de-test',
  };
}

const READER = { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null };

function privateHighlight(): HighlightItem {
  return {
    id: 'hl-1',
    text: PASSAGE,
    note: 'Ma note',
    isPublic: false,
    isOfficial: false,
    upvotesCount: 0,
    createdAt: '2026-09-04T18:40:00.000Z',
    canonicalStart: 0,
    canonicalEnd: PASSAGE.length,
    contentSha: 'sha-de-test',
    quoteOrdinal: 0,
    reader: READER,
  } as HighlightItem;
}

function publicAnnotation(): AnnotationItem {
  return {
    id: 'pub-1',
    text: PASSAGE,
    note: 'Note publique',
    isPublic: true,
    isOfficial: false,
    upvotesCount: 0,
    createdAt: '2026-09-04T18:40:00.000Z',
    canonicalStart: 0,
    canonicalEnd: PASSAGE.length,
    contentSha: 'sha-de-test',
    quoteOrdinal: 0,
    reader: READER,
  };
}

const markOf = (id: string) => document.querySelector(`mark[data-highlight-id="${id}"]`);

describe('supprimer une annotation en mode document', () => {
  const onDelete = vi.fn().mockResolvedValue({ ok: true });

  function renderEngine() {
    return render(
      <TextHighlighter
        articleId="article-1"
        creatorName="Fay Moreau"
        allowPublicAnnotations
        isAuthenticated
        currentUserId={READER.id}
        initialHighlights={[privateHighlight()]}
        publicHighlights={[publicAnnotation()]}
        mainAppUrl="https://qoe.fi"
        containerId="article-body"
        canonicalDocument={buildDocument()}
        callbacks={{ onDelete }}
      />
    );
  }

  it('retire la marque, referme le tiroir et ne laisse pas React retirer un nœud absent', async () => {
    renderEngine();

    // Deux marques distinctes : la privée (la nôtre) et la publique.
    expect(markOf('hl-1')).not.toBeNull();
    expect(markOf('pub-1')).not.toBeNull();

    fireEvent.click(markOf('hl-1')!);
    const drawer = await screen.findByRole('dialog');
    expect(drawer.textContent).toContain('Ma note');

    fireEvent.click(screen.getByTitle('Supprimer cette annotation'));
    const confirmation = screen.getByRole('group', { name: 'Confirmer la suppression' });
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('hl-1'));

    // 1. La marque a disparu du corps rendu par React.
    await waitFor(() => expect(markOf('hl-1')).toBeNull());
    // 2. L'autre annotation reste peinte : on n'a pas vidé l'article.
    expect(markOf('pub-1')).not.toBeNull();
    // 3. Le tiroir ne se rouvre pas sur l'annotation suivante avec un
    //    compteur faux (« 1 / 2 » pour une seule restante).
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
