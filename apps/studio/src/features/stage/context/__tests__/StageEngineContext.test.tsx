// =====================================================================
// 🧪 StageEngineContext — la machine à états de l'éditeur visuel
// =====================================================================
// Le moteur porte tout ce que l'éditeur peut casser : historique, blocs et
// nœuds, scopes (accueil / article / rubrique), brouillon et publication.
// Les tests exercent les opérations réelles du contexte et vérifient l'état
// observable : ce que voit l'éditeur, ce qui reste « non enregistré », ce qui
// part réellement au serveur.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';

import type {
  LayoutConfig,
  TemplateBlock,
  TemplateNode,
  TemplatePublisherContext,
} from '@qoe/ui/templates';

const actions = vi.hoisted(() => ({
  getSiteLayoutDraftAction: vi.fn(),
  saveSiteLayoutDraftAction: vi.fn(),
  publishSiteLayoutAction: vi.fn(),
  listSiteLayoutVersionsAction: vi.fn(),
  restoreSiteLayoutVersionAction: vi.fn(),
}));

vi.mock('@/app/(creator)/settings/design/actions', () => actions);

const TOKENS = {
  cardShape: 'rounded-xl',
  density: 'standard',
  surface: 'flat',
  fontFamily: 'sans',
  accentColor: '#111111',
} as unknown as LayoutConfig['tokens'];

function block(
  id: string,
  type: TemplateBlock['type'] = 'hero',
  extra: Partial<TemplateBlock> = {}
): TemplateBlock {
  return {
    id,
    type,
    label: id,
    visible: true,
    locked: false,
    props: {},
    ...extra,
  };
}

function layout(blocks: TemplateBlock[], extra: Partial<LayoutConfig> = {}): LayoutConfig {
  return { version: 1, archetype: 'custom', tokens: { ...TOKENS }, blocks, ...extra };
}

// Le factory de `vi.mock` est hissé : ses fixtures doivent être autonomes.
vi.mock('@qoe/ui/templates', () => {
  const tokens = {
    cardShape: 'rounded-xl',
    density: 'standard',
    surface: 'flat',
    fontFamily: 'sans',
    accentColor: '#111111',
  };
  const mkBlock = (id: string, type = 'hero', extra: Record<string, unknown> = {}) => ({
    id,
    type,
    label: id,
    visible: true,
    locked: false,
    props: {},
    ...extra,
  });
  const mkLayout = (blocks: unknown[], extra: Record<string, unknown> = {}) => ({
    version: 1,
    archetype: 'custom',
    tokens: { ...tokens },
    blocks,
    ...extra,
  });

  return {
    ARTICLE_DEFAULT_CONFIG: mkLayout([mkBlock('article-content', 'article-content')], {
      archetype: 'editorial',
    }),
    ARCHETYPES_REGISTRY: {
      bento: {
        archetype: 'bento',
        tokens: { ...tokens, accentColor: '#ff0000' },
        blocks: [mkBlock('bento-hero', 'hero', { props: { style: 'floating-card' } })],
      },
    },
    ARTICLE_VARIANTS: [
      {
        id: 'editorial',
        config: mkLayout([mkBlock('variant-lead', 'lead-story')], { archetype: 'editorial' }),
      },
    ],
    parseSiteLayouts: (payload: string) => JSON.parse(payload),
    serializeSiteLayouts: (home: unknown, article: unknown, articleByCategory: unknown) =>
      JSON.stringify({ home, article, articleByCategory }),
  };
});

import {
  StageEditorMode,
  StageEngineProvider,
  useStageEngine,
  type StageEngineContextType,
} from '../StageEngineContext';

let engine: StageEngineContextType;

function Probe() {
  engine = useStageEngine();
  return <span data-testid="dirty">{engine.hasUnsavedChanges ? 'dirty' : 'clean'}</span>;
}

const publisher = { id: 'pub_1', name: 'Le Média' } as unknown as TemplatePublisherContext;

function mount(
  options: {
    initialLayout?: LayoutConfig;
    initialArticleLayout?: LayoutConfig | null;
    initialOverrides?: Record<string, LayoutConfig>;
    initialUnpublished?: boolean;
    publisher?: TemplatePublisherContext;
  } = {}
) {
  return render(
    <StageEngineProvider
      initialLayout={
        options.initialLayout ?? layout([block('hero-1'), block('footer-1', 'footer')])
      }
      initialArticleLayout={options.initialArticleLayout ?? null}
      initialOverrides={options.initialOverrides ?? {}}
      initialUnpublished={options.initialUnpublished ?? true}
      publisher={options.publisher ?? publisher}
      articles={[]}
    >
      <Probe />
    </StageEngineProvider>
  );
}

/** Exécute une action du moteur puis laisse React committer. */
function run(fn: () => void) {
  act(() => {
    fn();
  });
}

describe('StageEngineContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actions.saveSiteLayoutDraftAction.mockResolvedValue({ success: true });
    actions.publishSiteLayoutAction.mockResolvedValue({ success: true });
    actions.listSiteLayoutVersionsAction.mockResolvedValue({ success: true, versions: [] });
    actions.getSiteLayoutDraftAction.mockResolvedValue({ success: true, layout: null });
    actions.restoreSiteLayoutVersionAction.mockResolvedValue({ success: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('refuse d’être utilisé hors du provider', () => {
    const silence = () => {
      const Boom = () => {
        useStageEngine();
        return null;
      };
      render(<Boom />);
    };

    expect(silence).toThrow(/must be used within StageEngineProvider/);
  });

  it('démarre propre, puis devient « non enregistré » après une modification', () => {
    mount();
    expect(engine.hasUnsavedChanges).toBe(false);
    expect(engine.canUndo).toBe(false);

    run(() => engine.updateBlockProps('hero-1', { style: 'cinematic-banner' }));

    expect(engine.hasUnsavedChanges).toBe(true);
    expect(engine.layout.blocks[0].props).toMatchObject({ style: 'cinematic-banner' });
    expect(engine.canUndo).toBe(true);
  });

  it('annule et rétablit une modification (aller-retour complet)', () => {
    mount();
    run(() => engine.updateBlockProps('hero-1', { style: 'split-featured' }));
    run(() => engine.updateBlockProps('hero-1', { style: 'floating-card' }));

    run(() => engine.undo());
    expect(engine.layout.blocks[0].props).toMatchObject({ style: 'split-featured' });
    expect(engine.canRedo).toBe(true);

    run(() => engine.redo());
    expect(engine.layout.blocks[0].props).toMatchObject({ style: 'floating-card' });
    expect(engine.canRedo).toBe(false);
  });

  it('ne fait rien quand l’historique est vide', () => {
    mount();
    run(() => engine.undo());
    run(() => engine.redo());

    expect(engine.hasUnsavedChanges).toBe(false);
    expect(engine.layout.blocks).toHaveLength(2);
  });

  it('ajoute un bloc avant le pied de page et le sélectionne', () => {
    mount();
    run(() => engine.addBlock('article-stream', 'Flux'));

    expect(engine.layout.blocks.map((b) => b.type)).toEqual(['hero', 'article-stream', 'footer']);
    expect(engine.selectedBlockId).toBe(engine.layout.blocks[1].id);
    expect(engine.hasUnsavedChanges).toBe(true);
  });

  it('ajoute le bloc en fin de page quand il n’y a pas de pied de page', () => {
    mount({ initialLayout: layout([block('hero-1')]) });
    run(() => engine.addBlock('newsletter-wall', 'Newsletter'));

    expect(engine.layout.blocks.map((b) => b.type)).toEqual(['hero', 'newsletter-wall']);
  });

  it('duplique un bloc juste après l’original, avec des props indépendantes et un id unique', () => {
    mount({ initialLayout: layout([block('hero-1', 'hero', { props: { title: 'Titre' } })]) });

    const frozenNow = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    run(() => engine.duplicateBlock('hero-1'));
    run(() => engine.duplicateBlock('hero-1'));
    frozenNow.mockRestore();

    const ids = engine.layout.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(engine.layout.blocks).toHaveLength(3);

    // Modifier la copie ne doit pas toucher l'original.
    const duplicateId = engine.selectedBlockId!;
    run(() => engine.updateBlockProps(duplicateId, { title: 'Copie' }));
    const original = engine.layout.blocks.find((b) => b.id === 'hero-1')!;
    expect(original.props).toMatchObject({ title: 'Titre' });
  });

  it('supprime un bloc et vide la sélection, sans historique pour un id inconnu', () => {
    mount();
    run(() => engine.selectBlock('hero-1'));
    run(() => engine.deleteBlock('hero-1'));

    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['footer-1']);
    expect(engine.selectedBlockId).toBeNull();

    mount();
    run(() => engine.deleteBlock('inconnu'));
    expect(engine.hasUnsavedChanges).toBe(false);
    expect(engine.canUndo).toBe(false);
  });

  it('déplace les blocs en respectant les bornes', () => {
    mount();
    run(() => engine.moveBlock('footer-1', 'down'));
    run(() => engine.moveBlock('hero-1', 'up'));
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['hero-1', 'footer-1']);
    expect(engine.hasUnsavedChanges).toBe(false);

    run(() => engine.moveBlock('hero-1', 'down'));
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['footer-1', 'hero-1']);

    run(() => engine.moveBlockTo('hero-1', -5));
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['hero-1', 'footer-1']);

    run(() => engine.moveBlockTo('hero-1', 99));
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['footer-1', 'hero-1']);
  });

  it('bascule visibilité, verrou et masquage par appareil', () => {
    mount();
    run(() => engine.toggleVisibility('hero-1'));
    run(() => engine.toggleLock('hero-1'));
    expect(engine.layout.blocks[0]).toMatchObject({ visible: false, locked: true });

    run(() => engine.toggleHiddenAt('hero-1', 'mobile'));
    expect(engine.layout.blocks[0].hiddenAt).toEqual(['mobile']);

    run(() => engine.toggleHiddenAt('hero-1', 'tablet'));
    expect(engine.layout.blocks[0].hiddenAt).toEqual(['mobile', 'tablet']);

    run(() => engine.toggleHiddenAt('hero-1', 'mobile'));
    run(() => engine.toggleHiddenAt('hero-1', 'tablet'));
    // Plus aucun format masqué : la propriété disparaît (pas de tableau vide).
    expect(engine.layout.blocks[0].hiddenAt).toBeUndefined();
  });

  it('ajoute, modifie, déplace et retire des nœuds imbriqués', () => {
    const nested: TemplateNode = {
      oid: 'n1',
      kind: 'box',
      children: [
        { oid: 'n2', kind: 'text', textFallback: 'Bonjour' },
        { oid: 'n3', kind: 'text', textFallback: 'Suite' },
      ],
    };
    mount({
      initialLayout: layout([block('hero-1', 'hero', { nodes: [nested] })]),
    });

    run(() => engine.updateNode('hero-1', 'n2', { textFallback: 'Modifié' }));
    expect(engine.layout.blocks[0].nodes?.[0].children?.[0].textFallback).toBe('Modifié');

    run(() => engine.moveNode('hero-1', 'n3', 'up'));
    expect(engine.layout.blocks[0].nodes?.[0].children?.map((n) => n.oid)).toEqual(['n3', 'n2']);

    run(() => engine.removeNode('hero-1', 'n3'));
    expect(engine.layout.blocks[0].nodes?.[0].children?.map((n) => n.oid)).toEqual(['n2']);
  });

  it('ajoute un nœud dans les nœuds ou dans un slot nommé, puis le sélectionne', () => {
    mount({
      initialLayout: layout([
        block('hero-1', 'hero', { nodes: [] }),
        block('lead-1', 'lead-story', { slots: { title: [] } }),
      ]),
    });

    run(() => engine.addNode('hero-1', null, 'text'));
    const added = engine.layout.blocks[0].nodes!;
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ kind: 'text', tag: 'p', textFallback: 'Texte' });
    expect(engine.selectedOid).toBe(added[0].oid);

    run(() => engine.addNode('lead-1', 'title', 'badge'));
    expect(engine.layout.blocks[1].slots?.title).toHaveLength(1);
    expect(engine.layout.blocks[1].slots?.title[0]).toMatchObject({ kind: 'badge' });
  });

  it('résout le nœud sélectionné, y compris dans un slot', () => {
    mount({
      initialLayout: layout([
        block('hero-1', 'hero', {
          nodes: [{ oid: 'deep', kind: 'box', children: [{ oid: 'leaf', kind: 'text' }] }],
        }),
        block('lead-1', 'lead-story', {
          slots: { title: [{ oid: 'slot-leaf', kind: 'text' }] },
        }),
      ]),
    });

    run(() => engine.selectNode('leaf', '0.children.0', 'hero-1'));
    expect(engine.selectedBlock?.id).toBe('hero-1');
    expect(engine.selectedNode).toMatchObject({ slotKey: null, node: { oid: 'leaf' } });

    run(() => engine.selectNode('slot-leaf', null, 'lead-1'));
    expect(engine.selectedNode).toMatchObject({ slotKey: 'title' });
  });

  it('n’enregistre aucun changement quand la cible de la mutation n’existe pas', () => {
    mount();

    run(() => engine.updateBlockProps('inconnu', { style: 'x' }));
    run(() => engine.updateNode('inconnu', 'nope', { textFallback: 'x' }));
    run(() => engine.removeNode('inconnu', 'nope'));
    run(() => engine.moveNode('inconnu', 'nope', 'up'));

    expect(engine.hasUnsavedChanges).toBe(false);
    expect(engine.canUndo).toBe(false);
  });

  it('ouvre la page article en créant sa configuration, puis revient à l’accueil', () => {
    mount();
    run(() => engine.setStagePage('article'));

    expect(engine.stagePage).toBe('article');
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['article-content']);
    expect(engine.hasUnsavedChanges).toBe(true);

    run(() => engine.setStagePage('home'));
    expect(engine.stagePage).toBe('home');
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['hero-1', 'footer-1']);
  });

  it('crée un override de rubrique à partir du gabarit article (copie indépendante)', () => {
    mount({ initialArticleLayout: layout([block('article-content', 'article-content')]) });
    run(() => engine.setArticleCategory('tech'));

    expect(engine.articleCategory).toBe('tech');
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['article-content']);

    run(() => engine.updateBlockProps('article-content', { density: 'compact' }));
    expect(engine.layout.blocks[0].props).toMatchObject({ density: 'compact' });

    run(() => engine.setArticleCategory('tech'));
    // Rouvrir la même rubrique ne réécrase pas le travail déjà fait.
    expect(engine.layout.blocks[0].props).toMatchObject({ density: 'compact' });
  });

  it('applique un payload multi-scopes et ignore un payload illisible', async () => {
    mount({ initialUnpublished: false });
    actions.getSiteLayoutDraftAction.mockResolvedValueOnce({
      success: true,
      layout: JSON.stringify({
        home: layout([block('p-home')]),
        article: layout([block('p-article')]),
        articleByCategory: {},
      }),
    });

    await act(async () => {
      await engine.restoreSnapshot('v1');
    });
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['p-home']);
    expect(engine.hasUnsavedChanges).toBe(true);
    expect(engine.unpublished).toBe(true);

    // Payload illisible : on ne touche à rien (ni blocs, ni drapeau).
    actions.getSiteLayoutDraftAction.mockResolvedValueOnce({
      success: true,
      layout: '{ pas du json',
    });
    await act(async () => {
      await engine.restoreSnapshot('v2');
    });
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['p-home']);
  });

  it('applique un archétype connu et ignore un identifiant inconnu', () => {
    mount();
    run(() => engine.updateBlockProps('hero-1', { style: 'cinematic-banner' }));
    expect(engine.canUndo).toBe(true);

    run(() => engine.selectArchetype('inconnu'));
    expect(engine.canUndo).toBe(true);
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['hero-1', 'footer-1']);

    run(() => engine.selectArchetype('bento'));
    expect(engine.layout.archetype).toBe('bento');
    expect(engine.layout.tokens.accentColor).toBe('#ff0000');
    expect(engine.layout.blocks).toHaveLength(1);
    // Changer d'archétype repart d'un historique vierge.
    expect(engine.canUndo).toBe(false);
    expect(engine.hasUnsavedChanges).toBe(true);
  });

  it('passe l’article sur une variante, dans le scope article', () => {
    mount();
    run(() => engine.applyArticleVariant('editorial'));

    expect(engine.stagePage).toBe('article');
    expect(engine.layout.blocks.map((b) => b.id)).toHaveLength(1);
    expect(engine.layout.blocks[0].id).toMatch(/^variant-lead_/);

    run(() => engine.applyArticleVariant('inexistante'));
    expect(engine.layout.blocks[0].id).toMatch(/^variant-lead_/);
  });

  it('enregistre le brouillon et repart propre ; en cas de refus, expose l’erreur', async () => {
    mount();

    await act(async () => {
      await engine.save();
    });

    expect(actions.saveSiteLayoutDraftAction).toHaveBeenCalledTimes(1);
    const [pubId, payload] = actions.saveSiteLayoutDraftAction.mock.calls[0];
    expect(pubId).toBe('pub_1');
    expect(JSON.parse(payload as string).home.blocks).toHaveLength(2);
    expect(engine.unpublished).toBe(true);
    expect(engine.hasUnsavedChanges).toBe(false);
    expect(engine.saveError).toBeNull();

    actions.saveSiteLayoutDraftAction.mockResolvedValueOnce({
      success: false,
      error: 'Quota de brouillons atteint',
    });
    run(() => engine.updateBlockProps('hero-1', { style: 'x' }));
    await act(async () => {
      await engine.save();
    });

    expect(engine.saveError).toBe('Quota de brouillons atteint');
    // Un échec ne doit pas laisser croire que c'est enregistré.
    expect(engine.hasUnsavedChanges).toBe(true);
  });

  it('expose une erreur quand l’enregistrement lève (réseau), au lieu d’échouer en silence', async () => {
    mount();
    run(() => engine.updateBlockProps('hero-1', { style: 'typographic-minimal' }));
    actions.saveSiteLayoutDraftAction.mockRejectedValueOnce(new Error('Réseau indisponible'));

    await act(async () => {
      await engine.save();
    });

    expect(engine.saveError).toBe('Réseau indisponible');
    expect(engine.isSaving).toBe(false);
    expect(engine.hasUnsavedChanges).toBe(true);
  });

  it('publie puis recharge les versions ; un refus met l’erreur à l’écran', async () => {
    mount();
    actions.listSiteLayoutVersionsAction.mockResolvedValueOnce({
      success: true,
      versions: [{ id: 'v1', label: 'Semaine 1', createdAt: '2026-11-01T10:00:00.000Z' }],
    });

    await act(async () => {
      await engine.publish();
    });

    expect(engine.unpublished).toBe(false);
    expect(engine.hasUnsavedChanges).toBe(false);
    expect(engine.snapshots).toHaveLength(1);

    actions.publishSiteLayoutAction.mockResolvedValueOnce({
      success: false,
      error: 'Publication déjà en cours',
    });
    await act(async () => {
      await engine.publish();
    });
    expect(engine.saveError).toBe('Publication déjà en cours');
  });

  it('ne publie pas sans publication connue', async () => {
    mount({ publisher: { id: '' } as unknown as TemplatePublisherContext });

    await act(async () => {
      await engine.publish();
    });

    expect(actions.publishSiteLayoutAction).not.toHaveBeenCalled();
    expect(engine.isPublishing).toBe(false);
  });

  it('charge les versions sans casser l’éditeur quand le serveur échoue', async () => {
    actions.listSiteLayoutVersionsAction.mockRejectedValueOnce(new Error('503'));
    mount();

    await act(async () => {
      await engine.loadSnapshots();
    });

    expect(engine.snapshots).toEqual([]);
    expect(engine.snapshotsLoading).toBe(false);
  });

  it('restaure une version : réapplique le brouillon et repasse en non publié', async () => {
    mount({ initialUnpublished: false });
    actions.getSiteLayoutDraftAction.mockResolvedValueOnce({
      success: true,
      layout: JSON.stringify({
        home: layout([block('restored')]),
        article: null,
        articleByCategory: {},
      }),
    });

    await act(async () => {
      await engine.restoreSnapshot('v1');
    });

    expect(actions.restoreSiteLayoutVersionAction).toHaveBeenCalledWith('pub_1', 'v1');
    expect(engine.layout.blocks.map((b) => b.id)).toEqual(['restored']);
    expect(engine.unpublished).toBe(true);
  });

  it('borne le zoom et remet la vue à zéro', () => {
    mount();

    for (let i = 0; i < 20; i += 1) run(() => engine.zoomIn());
    expect(engine.scale).toBe(2.5);

    for (let i = 0; i < 40; i += 1) run(() => engine.zoomOut());
    expect(engine.scale).toBe(0.2);

    run(() => engine.resetZoom());
    expect(engine.scale).toBe(0.95);
    expect(engine.position).toEqual({ x: 60, y: 20 });
  });

  it('garde les réglages d’interface indépendants du layout', () => {
    mount();
    run(() => engine.setEditorMode(StageEditorMode.PREVIEW));
    run(() => engine.setDevice('mobile'));
    run(() => engine.setLeftPanelTab('images'));

    expect(engine.editorMode).toBe(StageEditorMode.PREVIEW);
    expect(engine.device).toBe('mobile');
    expect(engine.leftPanelTab).toBe('images');
    expect(engine.hasUnsavedChanges).toBe(false);
  });
});
