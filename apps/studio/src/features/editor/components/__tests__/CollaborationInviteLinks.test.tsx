import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollaborationInviteLinks } from '../CollaborationInviteLinks';

const listMock = vi.fn();
const createMock = vi.fn();
const revokeMock = vi.fn();

vi.mock('@qoe/sdk/actions/articles', () => ({
  listCollaborationInviteLinksAction: (...args: unknown[]) => listMock(...args),
  createCollaborationInviteLinkAction: (...args: unknown[]) => createMock(...args),
  revokeCollaborationInviteLinkAction: (...args: unknown[]) => revokeMock(...args),
}));

const activeLink = {
  id: 'lnk_active',
  token: 'active-token',
  role: 'CONTRIBUTOR',
  expiresAt: null,
  usedCount: 0,
  maxUses: 5,
};

function Harness() {
  const [open, setOpen] = useState(true);

  return (
    <>
      <CollaborationInviteLinks articleId="article_1" open={open} onOpenChange={setOpen} />
      <output data-testid="dialog-state">{open ? 'open' : 'closed'}</output>
    </>
  );
}

describe('CollaborationInviteLinks', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ ok: true, data: { links: [] } });
    createMock.mockResolvedValue({
      ok: true,
      data: {
        link: {
          ...activeLink,
          id: 'lnk_new',
          token: 'new-token',
          maxUses: 1,
        },
      },
    });
    revokeMock.mockResolvedValue({ ok: true });
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it('s’ouvre, charge les liens et se ferme avec Échap', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(
      await screen.findByRole('dialog', { name: 'Lien de collaboration' })
    ).toBeInTheDocument();
    await waitFor(() => expect(listMock).toHaveBeenCalledWith('article_1'));

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.getByTestId('dialog-state')).toHaveTextContent('closed'));
    expect(screen.queryByRole('dialog', { name: 'Lien de collaboration' })).not.toBeInTheDocument();
  });

  it('copie puis révoque un lien actif', async () => {
    listMock.mockResolvedValue({ ok: true, data: { links: [activeLink] } });
    render(<Harness />);

    await screen.findByText(/active-token/);
    // `userEvent.setup()` installe son propre presse-papiers : pour ce test
    // de copie, on clique avec fireEvent afin de garder notre mock.
    fireEvent.click(screen.getByRole('button', { name: 'Copier le lien' }));
    expect(writeText).toHaveBeenCalledWith(
      'https://studio.qoe.fi/collaborate/join?token=active-token'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Révoquer le lien' }));
    await waitFor(() => expect(revokeMock).toHaveBeenCalledWith('lnk_active'));
    await waitFor(() => expect(screen.queryByText(/active-token/)).not.toBeInTheDocument());
  });

  it('crée un lien, affiche son URL et permet de la copier', async () => {
    render(<Harness />);

    await screen.findByRole('dialog', { name: 'Lien de collaboration' });
    fireEvent.click(screen.getByRole('button', { name: /Générer le lien d’invitation/ }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      articleId: 'article_1',
      role: 'CONTRIBUTOR',
      expiresInHours: 24,
      maxUses: 1,
    });

    const createdUrl = 'https://studio.qoe.fi/collaborate/join?token=new-token';
    expect(await screen.findByLabelText('Lien d’invitation créé')).toHaveValue(createdUrl);
    expect(screen.getByText(/Lien prêt à être partagé/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copier' }));
    expect(writeText).toHaveBeenCalledWith(createdUrl);
  });
});
