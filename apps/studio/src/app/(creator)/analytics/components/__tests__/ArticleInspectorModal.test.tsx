// =====================================================================
// 🧪 ArticleInspectorDrawer — fraîcheur de la période affichée
// =====================================================================
// Le tiroir charge une série par période. Deux requêtes peuvent se croiser
// quand l'utilisateur change de période : la réponse de la période
// abandonnée ne doit jamais écraser celle de la période demandée.
// =====================================================================

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const analytics = vi.hoisted(() => ({ getArticleAnalyticsDetail: vi.fn() }));

vi.mock('../../actions', () => analytics);

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

/** Listbox portail : hors sujet, on ne teste que la période passée en prop. */
vi.mock('@qoe/ui/select', async () => {
  const react = await import('react');
  return {
    Select: ({ label, value }: { label: string; value?: string }) =>
      react.createElement('span', { 'data-testid': 'period', 'aria-label': label }, value),
  };
});

import { ArticleInspectorDrawer } from '../ArticleInspectorModal';

const base = {
  url: '/articles/essai',
  timeseries: [],
  referrers: [],
  likes: 0,
  bookmarks: 0,
  comments: 0,
  highlights: 0,
  highlightsPublic: 0,
  highlightsPrivate: 0,
  annotations: 0,
  reposts: 0,
  totalInteractions: 0,
  completionRate: 0,
};

describe('ArticleInspectorDrawer', () => {
  it('ignore la réponse de la période abandonnée', async () => {
    const pending: Array<(value: unknown) => void> = [];
    analytics.getArticleAnalyticsDetail.mockImplementation(
      () => new Promise((resolve) => pending.push(resolve))
    );

    const { rerender } = render(
      <ArticleInspectorDrawer urlPath="/articles/essai" period="30d" onClose={() => {}} />
    );
    rerender(<ArticleInspectorDrawer urlPath="/articles/essai" period="90d" onClose={() => {}} />);

    expect(pending).toHaveLength(2);

    // La période demandée répond d'abord, l'ancienne ensuite.
    await act(async () => {
      pending[1]({ data: { ...base, title: 'Période 90 jours', totalViews: 90 } });
    });
    await act(async () => {
      pending[0]({ data: { ...base, title: 'Période 30 jours', totalViews: 30 } });
    });

    expect(screen.getByText('Période 90 jours')).toBeDefined();
    expect(screen.queryByText('Période 30 jours')).toBeNull();
  });
});
