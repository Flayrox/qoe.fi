// @vitest-environment jsdom
// =====================================================================
// 🔁 passer un surlignage en public, puis le rouvrir
// =====================================================================
// 📖 Le tiroir reconstruit sa liste de navigation à partir des marques du
//    corps. Pour un surlignage du lecteur, il recréait l'objet avec
//    `isPublic: false` en dur. Conséquence : la marque venait de passer au
//    vermillon, mais le tiroir se rouvrait sur « Privée », sans discussion
//    ni vote. Le test verrouille l'aller-retour complet.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TextHighlighter } from '../TextHighlighter';
import type { HighlightItem } from '../types';
import type { CanonicalDocument } from '../canonical-document';

const PASSAGE = 'On ne corrige bien que ce qu’on a oublié d’avoir écrit.';

const READER = {
  id: 'reader-1',
  name: 'Lila',
  username: 'lila',
  logoUrl: null,
  type: 'PERSONAL' as const,
};

function buildDocument(): CanonicalDocument {
  return {
    blocks: [{ kind: 'p', text: PASSAGE }],
    segments: [{ blockIdx: 0, itemIdx: 0, text: PASSAGE, start: 0, end: PASSAGE.length }],
    text: PASSAGE,
    sha: 'sha-de-test',
  };
}

const privateHighlight: HighlightItem = {
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
};

const markOf = (id: string) => document.querySelector(`mark[data-highlight-id="${id}"]`);

describe('annotation privée → publique', () => {
  it('rouvre le tiroir sur la nouvelle visibilité, avec sa discussion', async () => {
    const onTogglePrivacy = vi.fn().mockResolvedValue({ ok: true });

    render(
      <TextHighlighter
        articleId="article-1"
        creatorName="Fay Moreau"
        allowPublicAnnotations
        isAuthenticated
        currentUserId={READER.id}
        initialHighlights={[privateHighlight]}
        publicHighlights={[]}
        mainAppUrl=""
        containerId="article-body"
        canonicalDocument={buildDocument()}
        callbacks={{ onTogglePrivacy }}
      />
    );

    // 1. La marque est privée au départ.
    expect(markOf('hl-1')!.getAttribute('class')).toContain('qoe-mark-private');

    fireEvent.click(markOf('hl-1')!);
    await screen.findByRole('dialog');
    expect(screen.getByText('Privée')).toBeTruthy();

    // 2. Le passage devient public.
    fireEvent.click(screen.getByRole('button', { name: 'Privée' }));
    await waitFor(() =>
      expect(onTogglePrivacy).toHaveBeenCalledWith({ highlightId: 'hl-1', isPublic: true })
    );

    // La peau de la marque suit immédiatement.
    await waitFor(() => {
      expect(markOf('hl-1')!.getAttribute('class')).toContain('qoe-mark-public');
    });

    // 3. On ferme, puis on rouvre le même passage.
    fireEvent.click(screen.getByRole('button', { name: /Fermer l.annotation/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(markOf('hl-1')!);
    const drawer = await screen.findByRole('dialog');

    // 4. Le tiroir lit la visibilité de l'objet : « Publique », et la
    //    discussion existe désormais (note + partage).
    expect(screen.getByText('Publique')).toBeTruthy();
    expect(screen.queryByText('Privée')).toBeNull();
    expect(drawer.textContent).toContain('Discussion');
  });
});
