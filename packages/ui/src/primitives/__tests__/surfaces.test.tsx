import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../card/card';
import { Separator } from '../separator/separator';
import { Surface } from '../surface/surface';

describe('Surface', () => {
  it('porte la surface standard (fond carte, bordure, rayon tokenisé)', () => {
    render(<Surface data-testid="s">contenu</Surface>);
    const className = screen.getByTestId('s').className;

    expect(className).toContain('bg-card');
    expect(className).toContain('border-border');
    expect(className).toContain('rounded-panel');
  });

  it('change de variante et de padding sans toucher au rayon', () => {
    render(
      <Surface data-testid="s" variant="sunken" padding="lg">
        x
      </Surface>
    );
    const className = screen.getByTestId('s').className;

    expect(className).toContain('bg-secondary');
    expect(className).toContain('p-5');
    expect(className).toContain('rounded-panel');
  });
});

describe('Card', () => {
  it('expose une structure sémantique complète', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Titre</CardTitle>
          <CardDescription>Résumé</CardDescription>
        </CardHeader>
        <CardContent>Corps</CardContent>
        <CardFooter divider>
          <span>Actions</span>
        </CardFooter>
      </Card>
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Titre' })).toBeTruthy();
    expect(screen.getByText('Résumé')).toBeTruthy();
    expect(screen.getByText('Corps')).toBeTruthy();
  });

  it('réserve le padding au cadre et le retire en flush', () => {
    const { rerender } = render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).toContain('p-3');

    rerender(
      <Card data-testid="c" flush>
        x
      </Card>
    );
    expect(screen.getByTestId('c').className).not.toContain('p-3');
    // Le rayon et la découpe restent : sinon les coins arrondis débordent.
    expect(screen.getByTestId('c').className).toContain('overflow-hidden');
  });

  it('ajoute les états d’une carte cliquable seulement si demandé', () => {
    const { rerender } = render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('hover:border-foreground/15');

    rerender(
      <Card data-testid="c" interactive>
        x
      </Card>
    );
    expect(screen.getByTestId('c').className).toContain('hover:border-foreground/15');
  });
});

describe('Separator', () => {
  it('est invisible pour les lecteurs d’écran par défaut', () => {
    render(<Separator data-testid="sep" />);
    const node = screen.getByTestId('sep');

    expect(node.getAttribute('role')).toBe('presentation');
    expect(node.getAttribute('aria-hidden')).toBe('true');
  });

  it('devient un vrai séparateur quand il porte du sens', () => {
    render(<Separator data-testid="sep" decorative={false} orientation="vertical" />);
    const node = screen.getByTestId('sep');

    expect(node.getAttribute('role')).toBe('separator');
    expect(node.getAttribute('aria-orientation')).toBe('vertical');
    expect(node.className).toContain('w-px');
  });
});
