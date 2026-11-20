// @vitest-environment jsdom
// =====================================================================
// L21a — socle studio : libellés du refus d'autorisation non traduits
// =====================================================================
// `notifyActionFailure` (client) est le seul chemin par lequel un créateur
// apprend qu'une action sensible a été refusée par le garde Go. Ses trois
// replis — titre, explication, libellé du bouton de vérification — étaient des
// littéraux français sans `t` : un utilisateur en `en` recevait un toast
// français au moment exact où il doit comprendre quoi faire.
//
// ⚠️ Pourquoi pas une garantie par catalogue : dans `apps/studio` la config
// vitest charge le plugin `lingui()` sans `lingui.config`, donc le macro n'est
// PAS transformé à l'exécution des tests — `t` s'exécute en repli runtime et
// renvoie le message tel quel (mesuré : `t\`Allo\`` avec le catalogue
// `{ Allo: 'HELLO_MARKER' }` actif rend `Allo`). On prouve donc les deux
// maillons observables : le libellé passe par `t` dans la source, et il est
// réellement extrait dans `messages/fr.po`.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@qoe/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/features/security/step-up', () => ({ requestStepUp: vi.fn() }));

// Guidance volontairement absente : ce sont alors les replis du module qui
// s'affichent — exactement les libellés à traduire.
vi.mock('@qoe/sdk/actions/utils/authz', () => ({
  authzCodeOf: () => 'needs_step_up',
  authzGuidance: () => null,
  authzSecurityHref: () => 'https://studio.qoe.test/settings/security',
  isStepUpCode: () => true,
}));

import { toast } from '@qoe/ui/toast';
import { notifyActionFailure } from '../authz-feedback';

const SOURCE = readFileSync(resolve(process.cwd(), 'src/lib/authz-feedback.ts'), 'utf-8');
const CATALOG = readFileSync(resolve(process.cwd(), '../../messages/fr.po'), 'utf-8');

const FALLBACKS = [
  'Vérification renforcée requise',
  'Une vérification renforcée est nécessaire pour cette action.',
  'Vérifier un facteur',
];

afterEach(() => {
  vi.mocked(toast.error).mockClear();
});

describe('notifyActionFailure — replis passés par `t`', () => {
  it('déclare les trois replis comme des `msgid` traduisibles', () => {
    expect(SOURCE).toContain("from '@lingui/core/macro'");
    for (const label of FALLBACKS) {
      // Le libellé n'existe plus en littéral nu…
      expect(SOURCE).not.toContain(`'${label}'`);
      // …mais il est bien dans un template `t`.
      expect(SOURCE).toContain(`t\`${label}\``);
      // …et il atterrit dans le catalogue extrait.
      expect(CATALOG).toContain(`msgid "${label}"`);
    }
  });

  it('affiche le repli avec son action de vérification', () => {
    notifyActionFailure({ ok: false, error: { code: 'needs_step_up' } }, 'fallback');

    expect(toast.error).toHaveBeenCalledTimes(1);
    const [title, options] = vi.mocked(toast.error).mock.calls[0] as [
      string,
      { duration?: number; action?: { onClick: () => void } },
    ];
    expect(title).toBe('Vérification renforcée requise');
    expect(options.duration).toBe(12000);
    expect(typeof options.action?.onClick).toBe('function');
  });
});
