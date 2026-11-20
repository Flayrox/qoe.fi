// =====================================================================
// 🧪 L21f — secret HMAC : échec de copie
// =====================================================================
// Le secret n'est affiché qu'une fois. `copySecret` ne capturait pas le rejet
// de `writeText` : l'utilisateur croyait avoir copié ce qu'il ne pourrait
// plus jamais revoir.

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

vi.mock('@qoe/ui', () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('../actions', () => ({
  createWebhookAction: vi.fn(),
  listWebhooksAction: vi.fn(),
  deleteWebhookAction: vi.fn(),
  toggleWebhookAction: vi.fn(),
  testWebhookAction: vi.fn(),
  listWebhookDeliveriesAction: vi.fn(),
}));

import { toast } from '@qoe/ui/toast';
import {
  createWebhookAction,
  listWebhooksAction,
  testWebhookAction,
  type WebhookWithDeliveries,
} from '../actions';
import { WebhooksClient } from '../WebhooksClient';

const createWebhook = vi.mocked(createWebhookAction);
const listWebhooks = vi.mocked(listWebhooksAction);
const testWebhook = vi.mocked(testWebhookAction);
const errorToast = vi.mocked(toast.error);

const WEBHOOK: WebhookWithDeliveries = {
  id: 'wh_1',
  name: 'Sync CRM',
  url: 'https://crm.example.com/hook',
  events: ['article.published'],
  active: true,
  createdAt: new Date('2026-11-01T08:00:00Z'),
  deliveries: [],
};

describe('WebhooksClient — secret HMAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
  });

  it('signale une copie de secret impossible', async () => {
    createWebhook.mockResolvedValue({
      success: true,
      secret: 'whsec_123',
      webhook: { id: 'wh_1', name: 'CRM' },
    } as never);
    listWebhooks.mockResolvedValue({ success: true, webhooks: [] } as never);

    render(
      <WebhooksClient
        access={{ status: 'approved', grants: [] } as never}
        initialWebhooks={[]}
        events={['article.published']}
        workspaceName="Mon média"
      />
    );

    fireEvent.click(screen.getByText('Créer mon premier webhook'));
    fireEvent.change(screen.getByLabelText("Nom de l'intégration"), {
      target: { value: 'Sync CRM' },
    });
    fireEvent.change(screen.getByLabelText('Endpoint URL HTTPS'), {
      target: { value: 'https://crm.example.com/hook' },
    });
    fireEvent.click(screen.getByText('Enregistrer le Webhook'));

    fireEvent.click(await screen.findByLabelText('Copier le secret'));

    await screen.findByLabelText('Copier le secret');
    expect(errorToast).toHaveBeenCalledWith('Copie impossible.');
  });
});

describe('WebhooksClient — états d’action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('relâche la ligne quand le ping de test rejette', async () => {
    testWebhook.mockRejectedValue(new Error('Go indisponible'));

    render(
      <WebhooksClient
        access={{ status: 'approved', grants: [] } as never}
        initialWebhooks={[WEBHOOK]}
        events={['article.published']}
        workspaceName="Mon média"
      />
    );

    const ping = screen.getByText('Tester').closest('button')!;
    fireEvent.click(ping);

    await waitFor(() => expect(ping).not.toBeDisabled());
  });

  it('relâche le bouton d’enregistrement quand la création rejette', async () => {
    createWebhook.mockRejectedValue(new Error('Go indisponible'));

    render(
      <WebhooksClient
        access={{ status: 'approved', grants: [] } as never}
        initialWebhooks={[WEBHOOK]}
        events={['article.published']}
        workspaceName="Mon média"
      />
    );

    fireEvent.click(screen.getByText('Nouveau Webhook'));
    fireEvent.change(screen.getByLabelText("Nom de l'intégration"), {
      target: { value: 'Sync CRM' },
    });
    fireEvent.change(screen.getByLabelText('Endpoint URL HTTPS'), {
      target: { value: 'https://crm.example.com/hook' },
    });

    const submit = screen.getByText('Enregistrer le Webhook').closest('button')!;
    fireEvent.click(submit);

    await waitFor(() => expect(submit).not.toBeDisabled());
  });
});
