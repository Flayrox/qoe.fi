import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonCard } from '../blocks/PersonCard';

describe('PersonCard', () => {
  it('affiche les informations du contributeur selon le standard Substack Pencraft', () => {
    const html = renderToStaticMarkup(
      <PersonCard
        id="author-1"
        name="Rose Florence"
        username="roseflorence"
        avatarUrl="https://example.com/avatar.jpg"
        bio="Historienne d'art et fondatrice de The Rose Period."
        role="Rédactrice en chef"
        isCertified={true}
        publicationName="The Rose Period"
        publicationId="pub-1"
      />
    );

    expect(html).toContain('data-testid="person-card-author-1"');
    expect(html).toContain('Rose Florence');
    expect(html).toContain('@roseflorence');
    expect(html).toContain('Rédactrice en chef');
    expect(html).toContain('Historienne d&#x27;art et fondatrice de The Rose Period.');
    expect(html).toContain('The Rose Period');
    expect(html).toContain('S&#x27;abonner');
    expect(html).toContain('Message');
    expect(html).toContain('max-w-[320px]');
    expect(html).toContain('rounded-[8px]');
  });
});
