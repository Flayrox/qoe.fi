import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from '../button/button';
import { ButtonGroup } from '../button/button-group';

describe('Button', () => {
  it('est un <button type="button"> par défaut (pas de submit accidentel)', () => {
    render(<Button>Enregistrer</Button>);
    const button = screen.getByRole('button', { name: 'Enregistrer' });

    expect(button.getAttribute('type')).toBe('button');
  });

  it('respecte un type explicite', () => {
    render(<Button type="submit">Envoyer</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('applique la densité demandée depuis les tokens', () => {
    const { rerender } = render(<Button size="sm">x</Button>);
    expect(screen.getByRole('button').className).toContain('h-control-sm');

    rerender(<Button size="lg">x</Button>);
    expect(screen.getByRole('button').className).toContain('h-control-lg');
  });

  it('traduit variante et ton en tokens sémantiques', () => {
    const { rerender } = render(
      <Button variant="solid" tone="brand">
        x
      </Button>
    );
    expect(screen.getByRole('button').className).toContain('bg-primary');

    rerender(
      <Button variant="ghost" tone="danger">
        x
      </Button>
    );
    const className = screen.getByRole('button').className;
    expect(className).toContain('text-destructive-text');
    expect(className).toContain('bg-transparent');
  });

  it('fusionne le className du point d’appel sans écraser l’identité', () => {
    render(<Button className="ml-auto">x</Button>);
    const className = screen.getByRole('button').className;

    expect(className).toContain('ml-auto');
    expect(className).toContain('rounded-control');
  });

  it('transmet ref, onClick et aria-*', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();

    render(
      <Button ref={ref} onClick={onClick} aria-label="Fermer">
        ×
      </Button>
    );

    await user.click(screen.getByRole('button'));

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Fermer')).toBeTruthy();
  });

  it('ne déclenche rien quand il est désactivé', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button disabled onClick={onClick}>
        x
      </Button>
    );

    await user.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('annonce loading, désactive et remplace l’icône de tête par un spinner', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <Button loading onClick={onClick}>
        Enregistrer
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Enregistrer' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector('svg')).not.toBeNull();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('asChild rend l’enfant avec la peau du bouton, sans type invalide', () => {
    render(
      <Button asChild variant="solid" tone="brand">
        <a href="/articles">Nouvel article</a>
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Nouvel article' });
    expect(link.getAttribute('href')).toBe('/articles');
    expect(link.className).toContain('bg-primary');
    expect(link.getAttribute('type')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ButtonGroup', () => {
  it('expose un groupe nommé et colle les rayons en mode attached', () => {
    render(
      <ButtonGroup attached aria-label="Alignement">
        <Button>G</Button>
        <Button>C</Button>
      </ButtonGroup>
    );

    const group = screen.getByRole('group', { name: 'Alignement' });
    expect(group.className).toContain('[&>*]:rounded-none');
    expect(group.className).toContain('[&>*:first-child]:rounded-l-control');
  });

  it('espace les boutons par défaut', () => {
    render(
      <ButtonGroup aria-label="Actions">
        <Button>a</Button>
        <Button>b</Button>
      </ButtonGroup>
    );

    expect(screen.getByRole('group').className).toContain('gap-1.5');
  });
});
