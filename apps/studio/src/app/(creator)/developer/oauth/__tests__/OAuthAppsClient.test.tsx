// =====================================================================
// 🧪 L21f — applications OAuth : création et accessibilité des champs
// =====================================================================
//  1. `handleCreate` n'a pas de garde : une action qui rejette laisse
//     `creating` à true, bouton désactivé et spinner éternel.
//  2. Les `<label>` du formulaire ne sont reliés à aucun champ : les saisies
//     n'ont pas de nom accessible.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/features/developer/components/developer-shell', () => ({
  DeveloperShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/features/developer/components/developer-access-state', () => ({
  DeveloperAccessState: () => null,
}));

vi.mock('@/features/developer/types', () => ({
  hasDeveloperGrant: () => true,
  developerWorkspaceAccess: () => ({ status: 'approved', grants: [] }),
}));

vi.mock('@qoe/supabase/storage', () => ({
  uploadImageToRoute: vi.fn(),
  IMAGE_FOLDERS: { avatars: 'avatars' },
}));

vi.mock('@qoe/ui/ui/ImageUploader', () => ({
  ImageUploader: () => <div data-slot="uploader" />,
}));

vi.mock('@qoe/ui/dialog', () => ({
  Dialog: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../actions', () => ({
  createOAuthClientAction: vi.fn(),
  listOAuthClientsAction: vi.fn(),
  rotateOAuthClientSecretAction: vi.fn(),
  deleteOAuthClientAction: vi.fn(),
}));

import { createOAuthClientAction } from '../actions';
import { OAuthAppsClient } from '../OAuthAppsClient';

const createClient = vi.mocked(createOAuthClientAction);

function renderClient() {
  return render(
    <OAuthAppsClient
      access={{ status: 'approved', grants: [] } as never}
      clients={[]}
      workspace={{ type: 'PERSONAL', name: 'Studio' }}
    />
  );
}

describe('OAuthAppsClient — formulaire de création', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('relâche le bouton de création quand l’action rejette', async () => {
    createClient.mockRejectedValue(new Error('Go indisponible'));

    renderClient();
    fireEvent.click(screen.getByText('Nouvelle application'));

    fireEvent.change(screen.getByPlaceholderText('Ex : Mon portefolio Next.js'), {
      target: { value: 'Mon app' },
    });
    fireEvent.change(screen.getByPlaceholderText(/monapp\.com\/api\/auth\/callback/), {
      target: { value: 'https://monapp.com/callback' },
    });

    const submit = screen.getByText("Créer l'application").closest('button')!;
    fireEvent.click(submit);

    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  it('nomme les champs du formulaire pour les technologies d’assistance', () => {
    renderClient();
    fireEvent.click(screen.getByText('Nouvelle application'));

    expect(screen.getByLabelText(/Nom de l.application/)).toBeDefined();
    expect(screen.getByLabelText(/URL d.accueil/)).toBeDefined();
    expect(screen.getByLabelText(/Description/)).toBeDefined();
    expect(screen.getByLabelText(/URL de redirection/)).toBeDefined();
  });
});
