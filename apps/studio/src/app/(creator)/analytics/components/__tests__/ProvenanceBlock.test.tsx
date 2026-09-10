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
    expect(screen.getByText('Feed qoe.fi')).toBeInTheDocument();
    expect(screen.getByText('Tenants (sous-domaines)')).toBeInTheDocument();

    // Counts
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();

    // Hostnames & Referrers sections
    expect(screen.getByText('blog.qoe.fi')).toBeInTheDocument();
    expect(screen.getByText('tech.qoe.fi')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });
});
