import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvenanceBlock } from '../ProvenanceBlock';
import type { ProvenanceBreakdown } from '../../actions';

describe('ProvenanceBlock', () => {
  it('returns null when all counts are 0', () => {
    const emptyProvenance: ProvenanceBreakdown = {
      bySource: [],
      byHostname: [],
      byReferrer: [],
    };

    const { container } = render(<ProvenanceBlock provenance={emptyProvenance} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly with source and hostname breakdown', () => {
    const mockProvenance: ProvenanceBreakdown = {
      bySource: [
        { key: 'feed', count: 120 },
        { key: 'subdomain', count: 80 },
      ],
      byHostname: [
        { key: 'blog.qoe.fi', count: 50 },
        { key: 'tech.qoe.fi', count: 30 },
      ],
      byReferrer: [{ key: '@alice', count: 40 }],
    };

    render(<ProvenanceBlock provenance={mockProvenance} />);

    // Title
    expect(screen.getByText('Provenance des vues')).toBeInTheDocument();

    // Source labels
    expect(screen.getByText('Feed qoefi')).toBeInTheDocument();
    expect(screen.getByText('Tenants (sous-domaines)')).toBeInTheDocument();

    // Counts
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();

    // Hostnames & Referrers sections
    expect(screen.getByText('blog.qoe.fi')).toBeInTheDocument();
    expect(screen.getByText('tech.qoe.fi')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });

  it('trie l’affichage sans réordonner les données reçues', () => {
    const provenance: ProvenanceBreakdown = {
      bySource: [
        { key: 'direct', count: 2 },
        { key: 'feed', count: 120 },
      ],
      byHostname: [
        { key: 'tech.qoe.fi', count: 3 },
        { key: 'blog.qoe.fi', count: 50 },
      ],
      byReferrer: [
        { key: '@bob', count: 1 },
        { key: '@alice', count: 40 },
      ],
    };
    const snapshot = JSON.stringify(provenance);

    render(<ProvenanceBlock provenance={provenance} period="30d" />);

    // Les props viennent de l'état du tableau de bord : les trier en place
    // réécrit la source et fait diverger l'écran des données réellement reçues.
    expect(JSON.stringify(provenance)).toBe(snapshot);
  });

  it('affiche la période réellement demandée, pas « 7 derniers jours »', () => {
    const provenance: ProvenanceBreakdown = {
      bySource: [{ key: 'feed', count: 12 }],
      byHostname: [],
      byReferrer: [],
    };

    render(<ProvenanceBlock provenance={provenance} period="90d" />);

    expect(screen.getByText(/90 derniers jours/)).toBeInTheDocument();
    expect(screen.queryByText(/7 derniers jours/)).toBeNull();
  });
});
