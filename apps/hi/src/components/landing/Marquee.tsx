import React from 'react';
import { t } from '@lingui/core/macro';

// Libellés résolus au rendu : une constante évaluée au module resterait figée
// dans la langue par défaut (même règle que CreatorHub et Hero).
function getMarqueeItems(): string[] {
  return [
    t`Investigation`,
    t`Philosophie`,
    t`Design Éthique`,
    t`Souveraineté`,
    t`Temps Long`,
    t`Militantisme`,
    t`Émancipation`,
    t`Culture Libre`,
  ];
}

export const Marquee = () => {
  const marquee = getMarqueeItems();

  return (
    <section className="py-12 border-y border-border/10 bg-muted/30 backdrop-blur-sm overflow-hidden">
      <div className="max-w-5xl mx-auto px-6 text-center mb-8">
        <span className="font-sans text-[11px] tracking-[0.2em] text-muted-foreground uppercase font-semibold">
          {t`La confiance de voix indépendantes partout en Europe`}
        </span>
      </div>
      <div className="flex w-[200%] animate-marquee">
        <div className="flex justify-around w-1/2 gap-12">
          {marquee.map((brand, i) => (
            <span
              key={i}
              className="font-display text-2xl font-medium text-foreground/20 whitespace-nowrap px-8"
            >
              {brand}
            </span>
          ))}
        </div>
        <div className="flex justify-around w-1/2 gap-12">
          {marquee.map((brand, i) => (
            <span
              key={i + marquee.length}
              className="font-display text-2xl font-medium text-foreground/20 whitespace-nowrap px-8"
            >
              {brand}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
