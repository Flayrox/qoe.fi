// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tab, TabList, TabPanel, Tabs } from '../tabs/tabs';
import { Tag, TagGroup, TagList } from '../tag-group/tag-group';

describe('Tabs (@qoe/ui/tabs)', () => {
  it('expose role="tablist" et navigue aux flèches en mode segmenté', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <Tabs variant="segmented" defaultValue="articles" onValueChange={onValueChange}>
        <TabList aria-label="Vues">
          <Tab id="articles" count={128}>
            Articles
          </Tab>
          <Tab id="medias" count={14}>
            Médias
          </Tab>
          <Tab id="disabled" disabled>
            Archives
          </Tab>
        </TabList>
        <TabPanel id="articles">Liste des articles</TabPanel>
        <TabPanel id="medias">Liste des médias</TabPanel>
      </Tabs>
    );

    expect(screen.getByRole('tablist', { name: 'Vues' })).toBeTruthy();
    const firstTab = screen.getByRole('tab', { name: /Articles/ });
    const secondTab = screen.getByRole('tab', { name: /Médias/ });
    const disabledTab = screen.getByRole('tab', { name: /Archives/ });

    expect(firstTab.getAttribute('aria-selected')).toBe('true');
    expect(disabledTab.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Liste des articles')).toBeTruthy();

    firstTab.focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalledWith('medias');
    expect(secondTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Liste des médias')).toBeTruthy();
  });

  it('utilise un trait sobre border-foreground (jamais primaire) en variante underline', () => {
    render(
      <Tabs variant="underline" size="md" defaultValue="general">
        <TabList aria-label="Sections">
          <Tab id="general">Général</Tab>
          <Tab id="members">Membres</Tab>
        </TabList>
      </Tabs>
    );

    const active = screen.getByRole('tab', { name: 'Général' });
    expect(active.className).toContain('data-[selected]:border-foreground');
    expect(active.className).not.toContain('border-primary');
  });
});

describe('TagGroup (@qoe/ui/tag-group)', () => {
  it('bascule plusieurs filtres en selectionMode="multiple"', async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();

    render(
      <TagGroup
        aria-label="Formats"
        selectionMode="multiple"
        defaultSelectedKeys={['enquete']}
        onSelectionChange={onSelectionChange}
      >
        <TagList>
          <Tag id="enquete" count={12}>
            Enquête
          </Tag>
          <Tag id="essai" count={8}>
            Essai
          </Tag>
        </TagList>
      </TagGroup>
    );

    const enquete = screen.getByRole('row', { name: /Enquête/ });
    const essai = screen.getByRole('row', { name: /Essai/ });

    expect(enquete.getAttribute('aria-selected')).toBe('true');
    expect(essai.getAttribute('aria-selected')).toBe('false');

    await user.click(essai);
    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(essai.getAttribute('aria-selected')).toBe('true');
    expect(enquete.getAttribute('aria-selected')).toBe('true');
  });

  it('garantit l’exclusivité en selectionMode="single" et supporte onRemove', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <div>
        <TagGroup label="Format exclusif" selectionMode="single" defaultSelectedKeys={['a']}>
          <TagList>
            <Tag id="a">Court</Tag>
            <Tag id="b">Long</Tag>
          </TagList>
        </TagGroup>

        <TagGroup aria-label="Étiquettes" selectionMode="none" onRemove={onRemove}>
          <TagList>
            <Tag id="urbanisme">Urbanisme</Tag>
          </TagList>
        </TagGroup>
      </div>
    );

    const court = screen.getByRole('row', { name: 'Court' });
    const long = screen.getByRole('row', { name: 'Long' });
    await user.click(long);
    expect(long.getAttribute('aria-selected')).toBe('true');
    expect(court.getAttribute('aria-selected')).toBe('false');

    await user.click(screen.getByRole('button', { name: /Retirer Urbanisme/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    const removedSet = onRemove.mock.calls[0][0] as Set<string>;
    expect(removedSet.has('urbanisme')).toBe(true);
  });
});
