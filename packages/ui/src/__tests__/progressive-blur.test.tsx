import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressiveBlur } from '../ui/progressive-blur';

describe('ProgressiveBlur component', () => {
  it('renders with default top direction and default className', () => {
    const { container } = render(<ProgressiveBlur data-testid="blur-element" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeDefined();
    expect(el.className).toContain('pointer-events-none');
    expect(el.className).toContain('top-0');
    expect(el.className).toContain('left-0');
    expect(el.className).toContain('right-0');
    expect(el.className).toContain('h-32');
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders with bottom direction classes', () => {
    const { container } = render(<ProgressiveBlur direction="bottom" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('bottom-0');
    expect(el.className).toContain('h-32');
  });

  it('renders 5 optical blur layers with progressive backdrop-filter', () => {
    const { container } = render(<ProgressiveBlur />);
    const layers = container.firstElementChild?.children;
    // 5 blur layers + 1 gradient overlay = 6 children
    expect(layers?.length).toBe(6);
  });

  it('allows disabling gradient overlay', () => {
    const { container } = render(<ProgressiveBlur showGradient={false} />);
    const layers = container.firstElementChild?.children;
    // Only 5 blur layers
    expect(layers?.length).toBe(5);
  });

  it('supports custom className and custom style', () => {
    const { container } = render(
      <ProgressiveBlur className="custom-test-class" style={{ zIndex: 40 }} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('custom-test-class');
    expect(el.style.zIndex).toBe('40');
  });
});
