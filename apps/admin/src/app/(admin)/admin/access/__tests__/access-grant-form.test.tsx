// @vitest-environment jsdom
// =====================================================================
// 🧪 Attribution d'un rôle — la personne affichée est celle qui est nommée
// =====================================================================
// `userId` était initialisé une fois (`people[0]`) : après une nouvelle
// recherche, la liste des personnes changeait mais l'identifiant restait
// celui de la recherche précédente. Le formulaire affichait donc B et
// attribuait le rôle à A — un mouvement d'accès sur la mauvaise personne.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const grantRoleAction = vi.fn(async (_input: { userId: string }) => ({ ok: true }));
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/admin-access-actions', () => ({
  grantRoleAction: (input: { userId: string }) => grantRoleAction(input),
}));
vi.mock('@/components/queue/useStaffAction', () => ({
  useStaffAction: () => ({
    loadingId: null,
    run: async (_id: string, fn: () => Promise<unknown>) => fn(),
  }),
}));

import { AccessGrantForm } from '../components/access-grant-form';

const roles = [
  {
    key: 'moderator',
    label: 'Modérateur',
    description: 'Modération des signalements',
    capabilities: ['admin.reports.read'],
    isSystem: true,
    holders: 1,
  },
];

function person(userId: string, email: string) {
  return {
    userId,
    email,
    name: null,
    username: null,
    roles: [] as string[],
    legacySuperadmin: false,
  };
}

describe('AccessGrantForm — personne affichée', () => {
  afterEach(() => {
    cleanup();
    grantRoleAction.mockClear();
    refresh.mockClear();
  });

  it('attribue à la personne de la recherche courante, pas à la précédente', async () => {
    const { rerender } = render(
      <AccessGrantForm people={[person('user_a', 'a@qoe.test')]} roles={roles} canGrant />
    );

    fireEvent.change(screen.getByTestId('access-grant-reason'), {
      target: { value: 'renfort modération octobre' },
    });
    fireEvent.click(screen.getByTestId('access-grant-submit'));
    await waitFor(() => expect(grantRoleAction).toHaveBeenCalledTimes(1));
    expect(grantRoleAction.mock.calls[0]?.[0]).toMatchObject({ userId: 'user_a' });

    // Nouvelle recherche : la personne A n'est plus dans la liste.
    rerender(<AccessGrantForm people={[person('user_b', 'b@qoe.test')]} roles={roles} canGrant />);

    fireEvent.change(screen.getByTestId('access-grant-reason'), {
      target: { value: 'renfort modération novembre' },
    });
    fireEvent.click(screen.getByTestId('access-grant-submit'));
    await waitFor(() => expect(grantRoleAction).toHaveBeenCalledTimes(2));
    expect(grantRoleAction.mock.calls[1]?.[0]).toMatchObject({ userId: 'user_b' });
  });
});
