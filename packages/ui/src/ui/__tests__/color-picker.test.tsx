// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ColorPicker, EDITORIAL_BACKGROUND_PRESETS } from '../color-picker';

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
