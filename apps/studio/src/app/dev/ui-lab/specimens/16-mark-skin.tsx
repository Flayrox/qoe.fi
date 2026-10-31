'use client';

import { useEffect, useRef, useState } from 'react';
import { markSkin, MARK_KINDS, type MarkKind } from '@qoe/ui/mark-skin';
import { DefectList, Variant } from '../specimen-frame';

const KIND_LABEL: Record<MarkKind, string> = {
  official: 'officielle',
  public: 'publique',
  private: 'privée',
  highlight: 'surlignage seul',
  selection: 'sélection',
};

const KIND_HINT: Record<MarkKind, string> = {
  official: 'L’auteur : double trait ambre, fond ambre.',
  public: 'Un lecteur, avec un texte public : trait plein fin vermillon, fond vermillon.',
  private: 'Un lecteur, avec un texte privé : trait pointillé bleu, fond bleu.',
  highlight: 'Un passage marqué sans texte : trait pointillé neutre, aucun fond.',
  selection: 'La marque temporaire pendant la saisie de la note.',
};

const FONT_PROPS = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontStretch',
  'fontVariant',
  'fontVariantLigatures',
  'fontFeatureSettings',
  'fontKerning',
  'lineHeight',
  'letterSpacing',
] as const;

/**
 * Deux paragraphes au même style, l'un avec une marque. On lit les valeurs
 * RÉSOLUES par le navigateur : si `font: inherit` manque, la marque hérite
 * du style utilisateur de `<mark>` et les deux calculs divergent.
 */
function TypographyProof() {
  const unmarkedRef = useRef<HTMLParagraphElement>(null);
  const markedRef = useRef<HTMLParagraphElement>(null);
  const [proof, setProof] = useState<{
    same: boolean;
    size: string;
    lineHeight: string;
    weight: string;
    family: string;
  } | null>(null);

  useEffect(() => {
    const unmarkedParagraph = unmarkedRef.current;
    const markedParagraph = markedRef.current;
    const mark = markedParagraph?.querySelector('mark');
    if (!unmarkedParagraph || !markedParagraph || !mark) return;

    const measure = () => {
      const base = getComputedStyle(unmarkedParagraph);
      const markedStyle = getComputedStyle(markedParagraph);
      const skin = getComputedStyle(mark);
      setProof({
        same: FONT_PROPS.every(
          (property) =>
            base[property] === markedStyle[property] && base[property] === skin[property]
        ),
        size: base.fontSize,
        lineHeight: base.lineHeight,
        weight: base.fontWeight,
        family: base.fontFamily,
      });
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="grid gap-4">
      <div className="article-prose max-w-2xl">
        <p className="text-foreground" data-mark-proof="unmarked" ref={unmarkedRef}>
          Le passage surligné se lit exactement comme le passage nu : même famille, même graisse,
          même taille, même interligne.
        </p>
        <p className="text-foreground" data-mark-proof="marked" ref={markedRef}>
          Le passage{' '}
          <mark className={markSkin('private')} data-mark-proof="mark">
            surligné
          </mark>{' '}
          se lit exactement comme le passage nu : même famille, même graisse, même taille, même
          interligne.
        </p>
      </div>

      <p className="text-[11.5px] leading-relaxed text-muted-foreground" aria-live="polite">
        {proof ? (
          <>
            Police calculée dans le navigateur —{' '}
            <span className={proof.same ? 'text-foreground' : 'text-destructive-text'}>
              {proof.same ? 'identique' : 'DIFFÉRENTE'}
            </span>{' '}
            entre le paragraphe nu, le paragraphe marqué et la marque :{' '}
            <span className="font-mono">
              {proof.size} / {proof.lineHeight} · {proof.weight} · {proof.family}
            </span>
            .
          </>
        ) : (
          'Mesure de la police calculée…'
        )}
      </p>
    </div>
  );
}

/**
 * Les surlignages ne sont pas rendus par React : le moteur insère des
 * `<mark>` par découpe de nœuds texte. Ce spécimen rend donc les mêmes
 * classes que le moteur applique (`markSkin`), sur du HTML statique.
 */
export function MarkSkinSpecimen() {
  return (
    <div className="grid gap-10">
      <Variant
        label="Quatre états, quatre peaux"
        kind="candidat"
        hint="La teinte seule ne suffit pas : officielle (double trait ambre), publique (plein fin vermillon), privée (pointillé bleu) et surlignage nu (pointillé neutre, sans fond) diffèrent aussi par le fond et le rythme du trait. Le trait est une image SVG cuite, répétée sur chaque fragment de ligne."
      >
        <div className="grid gap-4">
          <p className="max-w-2xl text-[15px] leading-[2] text-foreground">
            Un écrivain ne devrait publier que ce qu’il{' '}
            <mark className={markSkin('official')}>relisait deux fois</mark>, disait-il — mais il{' '}
            <mark className={markSkin('public')}>relisait surtout les autres</mark>,{' '}
            <mark className={markSkin('highlight')}>gardait ses propres doutes</mark> dans un
            carnet, et <mark className={markSkin('private')}>ne les montrait à personne</mark>.
          </p>

          <div className="grid gap-2 border-t border-border/40 pt-4 sm:grid-cols-2">
            {MARK_KINDS.map((kind) => (
              <div key={kind} className="flex items-baseline gap-2">
                <mark className={markSkin(kind)}>{KIND_LABEL[kind]}</mark>
                <span className="text-[11px] text-muted-foreground">{KIND_HINT[kind]}</span>
              </div>
            ))}
          </div>
        </div>

        <DefectList
          items={[
            'Ancien défaut : l’officielle et la privée partageaient le même ambre (`bg-highlight`), et un surlignage public nu recevait le vermillon d’une annotation publique — trois états se ressemblaient',
            'La peau se décide maintenant sur la NATURE (`markKindFor`) : officielle (double trait), annotation publique (trait simple), annotation privée (pointillé), surlignage nu (pointillé neutre). La liste qui porte la marque ne décide plus de sa couleur',
            'La marque ne pose plus `font-medium` : `marks.css` verrouille `font: inherit` et `color: inherit`, donc un paragraphe surligné garde exactement la police du paragraphe nu',
            'Le fond, le trait et le survol vivent tous dans `marks.css` : aucune classe de teinte n’est laissée au composant',
          ]}
        />
      </Variant>

      <Variant
        label="La marque ne touche pas la typographie"
        kind="candidat"
        hint="Deux paragraphes au même style, l’un avec une marque privée. La mesure lit les valeurs réellement résolues par le navigateur, pas la feuille de style : famille, taille, graisse, style, interligne et interlettrage doivent être identiques."
      >
        <TypographyProof />
      </Variant>

      <Variant
        label="Une citation qui passe à la ligne"
        kind="candidat"
        hint="Le cas qui casse les traits uniques en SVG : la citation dépasse la largeur, le navigateur la coupe en trois fragments, et chacun reçoit son propre trait. Aucun décalage de mise en page, aucun `getClientRects`."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <p className="max-w-sm text-[15px] leading-[2] text-foreground">
            <mark className={markSkin('official')}>
              Ce que la lenteur change, ce n’est pas la vitesse à laquelle on écrit, c’est le nombre
              de phrases qu’on accepte de jeter
            </mark>{' '}
            — et c’est précisément ce que personne ne veut entendre.
          </p>

          <p className="max-w-sm text-[15px] leading-[2] text-foreground">
            Une marque traverse aussi les éléments en ligne :{' '}
            <mark className={markSkin('public')}>
              un passage <em>en italique</em> et même un{' '}
              <span className="underline decoration-dotted">lien</span> à l’intérieur
            </mark>{' '}
            gardent un seul trait continu par ligne.
          </p>
        </div>

        <DefectList
          items={[
            'La teinte et le trait viennent de `marks.css` : ils suivent les tokens du thème sans qu’un composant ait à choisir une couleur',
            'Le trait survit à l’impression (`print-color-adjust: exact`)',
            'Le mouvement est coupé si `prefers-reduced-motion` est actif',
          ]}
        />
      </Variant>

      <Variant
        label="Surligner ≠ décorer"
        kind="candidat"
        hint="Bascule le thème en haut à droite : les tracés sont des tons moyens, choisis pour rester lisibles sur carte blanche comme sur fond sombre. La teinte de fond, elle, vient des tokens."
      >
        <div className="grid gap-3 rounded-lg border border-border/40 bg-muted/20 px-4 py-4">
          <p className="text-[13px] leading-[2] text-muted-foreground">
            Un surlignage est une <strong className="text-foreground">information</strong>, pas une
            décoration : il dit qu’un passage a été marqué, et par qui. C’est pour ça qu’il est
            cliquable, qu’il ouvre le tiroir d’annotation, et qu’il ne peut pas être confondu avec
            une citation mise en avant par la mise en page.
          </p>
          <p className="text-[13px] leading-[2] text-muted-foreground">
            L’exemple réel :{' '}
            <mark className={markSkin('official')}>ce passage est annoté par l’auteur</mark>,{' '}
            <mark className={markSkin('highlight')}>ce passage est seulement surligné</mark>,{' '}
            <mark className={markSkin('public')}>celui-ci est annoté en public</mark>,{' '}
            <mark className={markSkin('private')}>celui-là en privé</mark>.
          </p>
        </div>
      </Variant>
    </div>
  );
}
