import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationsTab } from '../recommendations';
import type { CreatorProfile } from '../../types';
import {
  getRecommendationsAction,
  addRecommendationAction,
  removeRecommendationAction,
  lookupPublisherByDomainAction,
} from '@qoe/sdk/actions/recommendations';

vi.mock('@qoe/sdk/actions/recommendations', () => ({
  getRecommendationsAction: vi.fn(),
  addRecommendationAction: vi.fn(),
  removeRecommendationAction: vi.fn(),
  lookupPublisherByDomainAction: vi.fn(),
}));

describe('RecommendationsTab', () => {
  const mockCurrent = {
    id: 'pub-1',
    name: 'Ma Publication',
    username: 'mapub',
    email: 'pub@qoe.fi',
    heroText: null,
    accentColor: null,
    fontFamily: null,
    themeMode: null,
    layoutStyle: null,
    logoUrl: null,
    coverUrl: null,
    bio: null,
    subdomain: null,
    customDomain: null,
    badgeText: null,
    badgeColor: null,
    feedStyle: null,
    headerStyle: null,
    pinnedArticleIds: [],
    categories: [],
    customLinks: [],
    socialLinks: [],
    onboardingStep: 'COMPLETED',
    type: 'MEDIA',
    membershipPlan: 'FREE',
    defaultAllowComments: true,
    defaultAllowAnnotations: true,
    watermarkAuthorship: true,
    protectSubscriberContent: false,
    rssEnabled: true,
  } as unknown as CreatorProfile;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state and then empty list', async () => {
    vi.mocked(getRecommendationsAction).mockResolvedValueOnce({
      ok: true,
      data: [],
    });

    render(<RecommendationsTab current={mockCurrent} setCurrent={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Aucune recommandation configurée/i)).toBeInTheDocument();
    });
  });

  it('renders existing recommendations list', async () => {
    vi.mocked(getRecommendationsAction).mockResolvedValueOnce({
      ok: true,
      data: [
        {
          id: 'rec-1',
          publisherId: 'pub-target',
          publisherName: 'Revue Amie',
          publisherSlug: 'revue-amie',
          publisherSubdomain: 'revue',
          publisherCustomDomain: null,
          publicationBio: 'Une belle revue indépendante',
          publisherLogoUrl: null,
          description: 'Lecture incontournable',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    render(<RecommendationsTab current={mockCurrent} setCurrent={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Revue Amie')).toBeInTheDocument();
      expect(screen.getByText(/Lecture incontournable/i)).toBeInTheDocument();
    });
  });

  it('allows searching and adding a publication', async () => {
    const user = userEvent.setup();
    vi.mocked(getRecommendationsAction).mockResolvedValue({
      ok: true,
      data: [],
    });
    vi.mocked(lookupPublisherByDomainAction).mockResolvedValueOnce({
      ok: true,
      data: {
        id: 'pub-found',
        name: 'Partenaire Média',
        slug: 'partenaire-media',
        subdomain: 'partenaire',
        logoUrl: null,
        bio: 'Média de référence',
      },
    });
    vi.mocked(addRecommendationAction).mockResolvedValueOnce({
      ok: true,
      data: { success: true },
    });

    render(<RecommendationsTab current={mockCurrent} setCurrent={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Domaine ou nom/i)).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText(/Domaine ou nom/i);
    await user.type(input, 'partenaire');
    await user.click(screen.getByRole('button', { name: /^Trouver/i }));

    await waitFor(() => {
      expect(screen.getByText('Partenaire Média')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^Ajouter/i }));

    await waitFor(() => {
      expect(addRecommendationAction).toHaveBeenCalledWith({
        recommendedId: 'pub-found',
        description: undefined,
      });
    });
  });

  it('handles removal confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(getRecommendationsAction).mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'rec-del',
          publisherId: 'pub-del',
          publisherName: 'Publication A Supprimer',
          publisherSlug: 'pub-del',
          publisherSubdomain: null,
          publisherCustomDomain: null,
          publicationBio: null,
          publisherLogoUrl: null,
          description: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });
    vi.mocked(removeRecommendationAction).mockResolvedValueOnce({
      ok: true,
      data: { success: true },
    });

    render(<RecommendationsTab current={mockCurrent} setCurrent={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Publication A Supprimer')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: /Retirer la recommandation/i });
    await user.click(deleteBtn);

    const confirmBtn = await screen.findByRole('button', { name: /^Retirer/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(removeRecommendationAction).toHaveBeenCalledWith({ recommendedId: 'rec-del' });
    });
  });
});
