import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn (clsx + tailwind-merge)', () => {
  it('joint des classes simples', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('ignore les falsy (null, undefined, false, 0, "")', () => {
    expect(cn('a', null, undefined, false, '', 0, 'b')).toBe('a b');
  });

  it('reste sur un tableau simple sans conflit', () => {
    expect(cn('px-2', 'py-4')).toBe('px-2 py-4');
  });

  it('tailwind-merge résout les conflits (dernier gagnant, classes non-couleur)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    expect(cn('p-4', 'px-2')).toBe('p-4 px-2');
  });

  it('gère les objets conditionnels', () => {
    expect(cn({ active: true, disabled: false }, 'base')).toBe('active base');
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });

  it('retourne une chaîne vide sans entrée', () => {
    expect(cn()).toBe('');
  });
});
