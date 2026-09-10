import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  ArticleAttributionEditor,
  type ArticleAttributionDraft,
} from '../ArticleAttributionEditor';

const mockSearchAction = vi.fn();
vi.mock('@qoe/sdk/actions/articles', () => ({
  searchArticleContributorsAction: (...args: unknown[]) => mockSearchAction(...args),
}));

describe('ArticleAttributionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const primaryAuthor: ArticleAttributionDraft = {
    userId: 'usr_owner',
    name: 'Alice Dupont',
    username: 'alice',
    logoUrl: null,
    role: 'PRIMARY_AUTHOR',
    order: 0,
    isVisible: true,
    consentStatus: 'ACCEPTED',
  };

  const coAuthor: ArticleAttributionDraft = {
    userId: 'usr_collab',
    name: 'Bob Martin',
    username: 'bob',
    logoUrl: null,
    role: 'CO_AUTHOR',
    order: 1,
    isVisible: false,
    consentStatus: 'PENDING',
  };

  it('renders empty placeholder when value is empty', () => {
    const onChange = vi.fn();
    render(<ArticleAttributionEditor value={[]} onChange={onChange} />);

    expect(
      screen.getByText('Vous serez ajouté comme auteur principal à la sauvegarde.')
    ).toBeInTheDocument();
  });

  it('renders primary and secondary contributors', () => {
    const onChange = vi.fn();
    render(<ArticleAttributionEditor value={[primaryAuthor, coAuthor]} onChange={onChange} />);

    expect(screen.getByText('Alice Dupont')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('Bob Martin')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();
    expect(screen.getByText('Invitation à accepter')).toBeInTheDocument();
  });

  it('does not allow editing role or deleting the primary author', () => {
    const onChange = vi.fn();
    render(<ArticleAttributionEditor value={[primaryAuthor, coAuthor]} onChange={onChange} />);

    const primarySelect = screen.getByLabelText('Rôle de Alice Dupont');
    expect(primarySelect).toBeDisabled();

    // No delete button for Alice
    expect(screen.queryByLabelText('Retirer Alice Dupont')).toBeNull();

    // Delete button exists for Bob
    expect(screen.getByLabelText('Retirer Bob Martin')).toBeInTheDocument();
  });

  it('calls onChange with updated role when changing secondary author role', () => {
    const onChange = vi.fn();
    render(<ArticleAttributionEditor value={[primaryAuthor, coAuthor]} onChange={onChange} />);

    const bobSelect = screen.getByLabelText('Rôle de Bob Martin');
    fireEvent.change(bobSelect, { target: { value: 'EDITOR' } });

    expect(onChange).toHaveBeenCalledWith([primaryAuthor, { ...coAuthor, role: 'EDITOR' }]);
  });

  it('calls onChange removing the secondary author when remove button is clicked', () => {
    const onChange = vi.fn();
    render(<ArticleAttributionEditor value={[primaryAuthor, coAuthor]} onChange={onChange} />);

    const removeBtn = screen.getByLabelText('Retirer Bob Martin');
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledWith([{ ...primaryAuthor, order: 0 }]);
  });

  it('searches and adds a contributor', async () => {
    const onChange = vi.fn();
    mockSearchAction.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'usr_new',
          name: 'Charlie Smith',
          username: 'charlie',
          logoUrl: null,
          isCertified: false,
        },
      ],
    });

    render(<ArticleAttributionEditor value={[primaryAuthor]} onChange={onChange} />);

    const searchInput = screen.getByTestId('attribution-search');
    fireEvent.change(searchInput, { target: { value: 'charlie' } });

    await waitFor(() => {
      expect(screen.getByText('Charlie Smith')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Charlie Smith'));

    expect(onChange).toHaveBeenCalledWith([
      primaryAuthor,
      expect.objectContaining({
        userId: 'usr_new',
        name: 'Charlie Smith',
        username: 'charlie',
        role: 'CO_AUTHOR',
        order: 1,
        isVisible: false,
        consentStatus: 'PENDING',
      }),
    ]);
  });

  it('reorders secondary contributors up and down', () => {
    const onChange = vi.fn();
    const thirdAuthor: ArticleAttributionDraft = {
      userId: 'usr_third',
      name: 'Clara Oswald',
      username: 'clara',
      logoUrl: null,
      role: 'CONTRIBUTOR',
      order: 2,
      isVisible: true,
      consentStatus: 'ACCEPTED',
    };

    render(
      <ArticleAttributionEditor
        value={[primaryAuthor, coAuthor, thirdAuthor]}
        onChange={onChange}
      />
    );

    const downBtns = screen.getAllByLabelText('Descendre le contributeur');
    // Bob is at index 1, can move down to index 2
    fireEvent.click(downBtns[1]);
    expect(onChange).toHaveBeenCalledWith([
      primaryAuthor,
      { ...thirdAuthor, order: 1 },
      { ...coAuthor, order: 2 },
    ]);
  });
});
