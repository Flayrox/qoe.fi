import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Icon } from '../../icons';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';
import { Callout } from '../callout/callout';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { DescriptionList } from '../description-list/description-list';
import { EmptyState } from '../empty-state/empty-state';
import { IconButton } from '../icon-button/icon-button';
import { KbdGroup } from '../kbd/kbd';
import { Pagination, paginationRange } from '../pagination/pagination';
import { Progress } from '../progress/progress';
import { SectionHeader } from '../section-header/section-header';
import { Skeleton } from '../skeleton/skeleton';
import { Spinner } from '../spinner/spinner';
import { Stat } from '../stat/stat';
import { StatusDot } from '../status-dot/status-dot';
import { Stepper } from '../stepper/stepper';
import { Timeline } from '../timeline/timeline';

describe('paginationRange', () => {
  it('affiche toutes les pages quand elles tiennent dans la fenêtre', () => {
    expect(paginationRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('garde le début, la fin et les voisines de la page courante', () => {
    expect(paginationRange(4, 10)).toEqual([1, 'ellipsis-start', 3, 4, 5, 'ellipsis-end', 10]);
  });

  it('ne pose pas d’ellipse inutile près du début ou de la fin', () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 10]);
    expect(paginationRange(10, 10)).toEqual([1, 'ellipsis-start', 6, 7, 8, 9, 10]);
  });

  it('borne une page ou un total hors limites', () => {
    expect(paginationRange(0, 3)).toEqual([1, 2, 3]);
    expect(paginationRange(9, 3)).toEqual([1, 2, 3]);
    expect(paginationRange(4, 0)).toEqual([1]);
  });
});

describe('Pagination', () => {
  it('marque la page courante et navigue au clic', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(<Pagination page={4} pageCount={10} onPageChange={onPageChange} />);

    expect(screen.getByRole('button', { name: 'Page 4' }).getAttribute('aria-current')).toBe(
      'page'
    );
    await user.click(screen.getByRole('button', { name: 'Page 5' }));
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it('désactive les flèches aux extrémités', () => {
    render(<Pagination page={1} pageCount={3} />);

    expect(
      (screen.getByRole('button', { name: 'Page précédente' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Page suivante' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });
});

describe('StatusDot', () => {
  it('garde le libellé visible ou dans l’arbre d’accessibilité', () => {
    const { rerender } = render(<StatusDot tone="success" label="Publié" />);
    expect(screen.getByText('Publié')).toBeTruthy();

    rerender(<StatusDot tone="success" label="Publié" labelHidden />);
    expect(screen.getByText('Publié').className).toContain('sr-only');
  });

  it('reste décoratif quand aucun libellé n’est fourni', () => {
    const { container } = render(<StatusDot tone="warning" />);
    expect(container.querySelector('[aria-hidden]')).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});

describe('Callout', () => {
  it('choisit le rôle live selon le ton', () => {
    const { rerender } = render(
      <Callout tone="danger" live>
        Erreur
      </Callout>
    );
    expect(screen.getByRole('alert')).toBeTruthy();

    rerender(
      <Callout tone="info" live>
        Information
      </Callout>
    );
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('ne crée pas de live region sans le drapeau live', () => {
    const { container } = render(<Callout>Contexte</Callout>);
    expect(container.querySelector('[role="alert"], [role="status"]')).toBeNull();
  });
});

describe('Breadcrumbs', () => {
  it('rend le dernier élément comme page courante, sans lien', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'Articles', href: '/articles' }, { label: 'Santé du contenu' }]}
      />
    );

    expect(screen.getByRole('link', { name: 'Articles' }).getAttribute('href')).toBe('/articles');
    expect(screen.getByText('Santé du contenu').closest('[aria-current="page"]')).not.toBeNull();
  });
});

describe('Stepper', () => {
  it('calcule l’étape courante et marque les étapes terminées', () => {
    const { container } = render(
      <Stepper
        steps={[{ label: 'Brouillon' }, { label: 'Relecture' }, { label: 'Publié' }]}
        current={1}
      />
    );

    const items = container.querySelectorAll('li');
    expect(items[0].textContent).toContain('Brouillon');
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[1].textContent).toContain('(étape courante)');
    expect(items[2].getAttribute('aria-current')).toBeNull();
  });
});

describe('DescriptionList', () => {
  it('garde une vraie structure dl/dt/dd', () => {
    const { container } = render(
      <DescriptionList items={[{ term: 'Publié le', value: '14 novembre 2026' }]} />
    );

    expect(container.querySelector('dl')).not.toBeNull();
    expect(container.querySelector('dt')?.textContent).toBe('Publié le');
    expect(container.querySelector('dd')?.textContent).toBe('14 novembre 2026');
  });
});

describe('Timeline', () => {
  it('expose l’horodatage machine dans un élément time', () => {
    const { container } = render(
      <Timeline
        entries={[
          {
            title: 'Publication',
            time: '14 nov. 18:42',
            dateTime: '2026-11-14T18:42:00Z',
          },
        ]}
      />
    );

    const time = container.querySelector('time');
    expect(time?.textContent).toBe('14 nov. 18:42');
    expect(time?.getAttribute('dateTime')).toBe('2026-11-14T18:42:00Z');
  });

  // ⚠️ `<time>` sans `datetime` exige un contenu qui soit une date machine :
  // « 14 nov. 18:42 » n'en est pas une. Le balisage est alors invalide et
  // certains lecteurs d'écran tentent d'en parser le texte.
  it('n’utilise pas <time> quand aucune valeur machine n’est fournie', () => {
    const { container } = render(<Timeline entries={[{ title: 'Publication', time: 'hier' }]} />);

    expect(container.querySelector('time')).toBeNull();
    expect(container.textContent).toContain('hier');
  });
});

describe('Progress', () => {
  it('borne la valeur et expose aria-valuenow', () => {
    render(<Progress value={120} max={100} label="Téléversement" showValue />);

    const bar = screen.getByRole('progressbar', { name: 'Téléversement' });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(screen.getByText('100 %')).toBeTruthy();
  });

  it('retire la valeur en mode indéterminé', () => {
    render(<Progress indeterminate label="Préparation" />);

    const bar = screen.getByRole('progressbar', { name: 'Préparation' });
    expect(bar.getAttribute('aria-valuenow')).toBeNull();
    expect(bar.getAttribute('aria-valuetext')).toBe('En cours');
  });

  it('garde un nom accessible même sans libellé fourni', () => {
    render(<Progress value={40} />);

    expect(screen.getByRole('progressbar', { name: 'Progression' })).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  it('nomme l’alerte, exécute l’action puis ferme', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <ConfirmDialog
        action={{
          title: 'Publier l’article ?',
          description: 'Il sera visible par tous.',
          confirmLabel: 'Publier',
          onConfirm,
        }}
        onClose={onClose}
      />
    );

    expect(await screen.findByRole('alertdialog', { name: 'Publier l’article ?' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Publier' }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

describe('Icon', () => {
  it('est décoratif sans libellé et nommé avec un libellé', () => {
    const { container, rerender } = render(<Icon name="trash" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    rerender(<Icon name="trash" label="Supprimer" />);
    expect(screen.getByRole('img', { name: 'Supprimer' })).toBeTruthy();
  });
});

describe('IconButton', () => {
  it('porte toujours le nom accessible sur le bouton', () => {
    render(
      <IconButton label="Fermer">
        <Icon name="x" />
      </IconButton>
    );

    expect(screen.getByRole('button', { name: 'Fermer' })).toBeTruthy();
  });
});

describe('SectionHeader', () => {
  it('respecte le niveau de titre demandé et garde les actions hors du titre', () => {
    render(
      <SectionHeader
        level="h1"
        eyebrow="Studio"
        title="Articles"
        meta="12"
        actions={<button type="button">Nouveau</button>}
      />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Articles' })).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nouveau' })).toBeTruthy();
  });
});

describe('Skeleton', () => {
  it('reste décoratif même si l’appelant passe aria-hidden=false', () => {
    const { container } = render(<Skeleton aria-hidden={false} />);

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Spinner', () => {
  it('annonce toujours son état, même sans libellé visible', () => {
    render(<Spinner label="Chargement des articles" />);

    expect(screen.getByRole('status').textContent).toContain('Chargement des articles');
    expect(screen.getByText('Chargement des articles').className).toContain('sr-only');
  });
});

describe('KbdGroup', () => {
  it('nomme la combinaison et cache le séparateur décoratif', () => {
    const { container } = render(<KbdGroup keys={['Mod', 'S']} label="Enregistrer" />);

    expect(screen.getByRole('group', { name: 'Enregistrer' })).toBeTruthy();
    expect(container.querySelector('[aria-hidden]')?.textContent).toBe('+');
  });
});

describe('EmptyState', () => {
  it('rend les deux actions demandées', () => {
    render(
      <EmptyState
        title="Aucun article"
        description="Commencez par en créer un."
        action={<button type="button">Créer</button>}
        secondaryAction={<a href="/aide">Aide</a>}
      />
    );

    expect(screen.getByText('Aucun article')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Créer' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Aide' }).getAttribute('href')).toBe('/aide');
  });
});

describe('Stat', () => {
  it('sépare la direction de la variation de son intention', () => {
    const { container } = render(
      <Stat
        label="Signalements"
        value="12"
        delta={{ value: '+3', direction: 'up', intent: 'negative', period: 'vs 30 j' }}
      />
    );

    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    expect(screen.getByText('vs 30 j')).toBeTruthy();
    expect(container.textContent).toContain('Signalements');
  });
});
