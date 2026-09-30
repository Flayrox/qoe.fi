import { describe, it, expect } from 'vitest';
import {
  AUTHZ_CODES,
  authzCodeOf,
  authzGuidance,
  isAuthzCode,
  isStepUpCode,
} from '../actions/utils/authz';

// Les codes de la console à capacités (apps/api/internal/adminauthz) doivent
// voyager jusqu'à l'interface : un refus muet est un cul-de-sac pour la
// personne qui l'a reçu.
describe('authz — codes du garde de capacité', () => {
  it('reconnaît les codes de capacité ajoutés par la console admin', () => {
    expect(AUTHZ_CODES).toContain('deny_missing_capability');
    expect(AUTHZ_CODES).toContain('deny_capability_lookup');
    expect(isAuthzCode('deny_missing_capability')).toBe(true);
    expect(isAuthzCode('deny_capability_lookup')).toBe(true);
  });

  it('rejette ce qui n’est pas un code du garde', () => {
    expect(isAuthzCode('NOT_FOUND')).toBe(false);
    expect(isAuthzCode(null)).toBe(false);
    expect(isAuthzCode(undefined)).toBe(false);
    expect(isAuthzCode('admin.subscriptions.write')).toBe(false);
  });

  it('explique chaque refus sauf « allow »', () => {
    for (const code of AUTHZ_CODES) {
      const guidance = authzGuidance(code);
      if (code === 'allow') {
        expect(guidance).toBeNull();
        continue;
      }
      expect(guidance, `pas d’explication pour ${code}`).not.toBeNull();
      expect(guidance?.title.length ?? 0).toBeGreaterThan(0);
      expect(guidance?.description.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('n’invite pas à une vérification forte sur un refus de capacité', () => {
    // Une capacité manquante ne se règle pas en prouvant un facteur : le
    // parcours proposé doit être « demander le droit », pas « se réauthentifier ».
    expect(isStepUpCode('deny_missing_capability')).toBe(false);
    expect(isStepUpCode('deny_capability_lookup')).toBe(false);
    // Les codes de step-up existants restent détectés.
    expect(isStepUpCode('needs_step_up')).toBe(true);
  });

  it('extrait le code d’un refus quel que soit son emballage', () => {
    expect(authzCodeOf({ code: 'deny_missing_capability' })).toBe('deny_missing_capability');
    expect(authzCodeOf({ error: { code: 'deny_capability_lookup' } })).toBe(
      'deny_capability_lookup'
    );
    expect(authzCodeOf({ code: 'NOT_FOUND' })).toBeNull();
    expect(authzCodeOf(null)).toBeNull();
    expect(authzCodeOf('deny_missing_capability')).toBeNull();
  });
});
