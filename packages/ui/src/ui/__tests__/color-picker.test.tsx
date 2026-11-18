// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ColorPicker, adjustHsvFromKey, EDITORIAL_BACKGROUND_PRESETS } from '../color-picker';

describe('adjustHsvFromKey — la couleur au clavier', () => {
  const base = { h: 210, s: 50, v: 50 };

  it('déplace saturation et luminosité à la flèche', () => {
    expect(adjustHsvFromKey(base, 'ArrowLeft')).toEqual({ ...base, s: 49 });
    expect(adjustHsvFromKey(base, 'ArrowRight')).toEqual({ ...base, s: 51 });
    expect(adjustHsvFromKey(base, 'ArrowUp')).toEqual({ ...base, v: 51 });
    expect(adjustHsvFromKey(base, 'ArrowDown')).toEqual({ ...base, v: 49 });
  });

  it('avance de dix avec Maj', () => {
    expect(adjustHsvFromKey(base, 'ArrowRight', { shift: true })).toEqual({ ...base, s: 60 });
  });

  it('borne saturation et luminosité entre 0 et 100', () => {
    expect(adjustHsvFromKey({ h: 0, s: 0, v: 0 }, 'ArrowLeft')?.s).toBe(0);
    expect(adjustHsvFromKey({ h: 0, s: 0, v: 0 }, 'ArrowDown')?.v).toBe(0);
    expect(adjustHsvFromKey({ h: 0, s: 100, v: 100 }, 'ArrowRight')?.s).toBe(100);
    expect(adjustHsvFromKey({ h: 0, s: 100, v: 100 }, 'ArrowUp')?.v).toBe(100);
  });

  it('fait boucler la teinte et gère Début/Fin', () => {
    expect(adjustHsvFromKey({ h: 359, s: 100, v: 100 }, 'ArrowRight', { axis: 'hue' })?.h).toBe(0);
    expect(adjustHsvFromKey({ h: 0, s: 100, v: 100 }, 'ArrowLeft', { axis: 'hue' })?.h).toBe(359);
    expect(adjustHsvFromKey({ h: 120, s: 100, v: 100 }, 'Home', { axis: 'hue' })?.h).toBe(0);
    expect(adjustHsvFromKey({ h: 120, s: 100, v: 100 }, 'End', { axis: 'hue' })?.h).toBe(359);
  });

  it('ignore les touches qui ne sont pas des déplacements', () => {
    expect(adjustHsvFromKey(base, 'Tab')).toBeNull();
    expect(adjustHsvFromKey(base, 'Enter')).toBeNull();
    expect(adjustHsvFromKey(base, 'a')).toBeNull();
  });
});

describe('ColorPicker Component', () => {
  it('renders trigger with normalized HEX display', () => {
    render(<ColorPicker value="#FAF8F5" onChange={vi.fn()} />);

    expect(screen.getByText('#FAF8F5')).toBeTruthy();
    expect(screen.getByText('HEX')).toBeTruthy();
  });

  it('renders default label when value is null or empty', () => {
    render(<ColorPicker value={null} onChange={vi.fn()} defaultLabel="Thème neutre standard" />);

    expect(screen.getByText('Thème neutre standard')).toBeTruthy();
    expect(screen.getByText('AUTO')).toBeTruthy();
  });

  it('includes high-aesthetic editorial background presets', () => {
    expect(EDITORIAL_BACKGROUND_PRESETS.length).toBeGreaterThan(4);
    const hexCodes = EDITORIAL_BACKGROUND_PRESETS.map((p) => p.hex.toLowerCase());
    expect(hexCodes).toContain('#ffffff');
    expect(hexCodes).toContain('#faf8f5');
    expect(hexCodes).toContain('#0f1117');
  });
});
