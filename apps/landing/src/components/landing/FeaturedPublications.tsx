'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, useAnimationFrame } from 'framer-motion';
import { t } from '@lingui/core/macro';
import { useTolgee } from '@qoe/i18n';
import { ArrowUpRight } from 'lucide-react';
import { ArticlePreviewModal, type Article } from './ArticlePreviewModal';

interface FeaturedPublicationsProps {
  articles: Article[];
  config: Record<string, string>;
}

// ─── Intellectual words that float in the background ─────────────────────────
const BACKGROUND_WORDS = [
  'Phénoménologie',
  'Dialectique',
  'Épistémologie',
  'Herméneutique',
  'Ontologie',
  'Éthique',
  'Esthétique',
  'Déconstruction',
  'Hégémonie',
  'Aliénation',
  'Souveraineté',
  'Émancipation',
  'Sérendipité',
  'Subsistance',
  'Autonomie',
  'Décolonisation',
  'Intersectionnalité',
  'Démocratie',
  'Biopouvoir',
  'Rhizome',
  'Utopie',
  'Praxis',
  'Théogonie',
  'Exégèse',
  'Sémiologie',
  'Paradigme',
  'Métaphysique',
  'Intertextualité',
  'Postmodernisme',
  'Syndicalisme',
  'Collectivisme',
  'Anarchisme',
  'Communs',
  'Luttes',
  'Mémoire collective',
  'Pensée critique',
  'Nuances',
  'Subtilité',
  'Profondeur',
  'Silence',
  'Infrastructure',
  'Indépendance',
  'Journalisme',
  'Résistance',
  'Conflit',
  'Idéologie',
  'Narrativité',
  'Cosmologie',
  'Anthropologie',
  'Psychanalyse',
];

// A single lane scrolling at a given speed and direction
function WordLane({
  words,
  direction,
  speed,
  y,
}: {
  words: string[];
  direction: 1 | -1;
  speed: number;
  y: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(direction === 1 ? 0 : -200);

  useAnimationFrame((_, delta) => {
    if (!containerRef.current) return;
    posRef.current += direction * speed * delta * 0.001;
    const half = containerRef.current.scrollWidth / 2;
    if (posRef.current > half) posRef.current -= half;
    if (posRef.current < -half) posRef.current += half;
    containerRef.current.style.transform = `translateX(${posRef.current}px)`;
  });

  // Calculate random stable opacities per word
  const items = React.useMemo(() => {
    return words.map((word) => ({
      word,
      opacity: 0.08 + Math.random() * 0.07,
    }));
  }, [words]);

  const doubled = [...items, ...items];

  return (
    <div className="absolute w-full overflow-hidden pointer-events-none" style={{ top: y }}>
      <div ref={containerRef} className="flex gap-8 will-change-transform whitespace-nowrap">
        {doubled.map((item, i) => (
          <span
            key={i}
            className="text-sm font-semibold tracking-wide select-none"
            style={{
              color: 'white',
              opacity: item.opacity,
            }}
          >
            {item.word}
          </span>
        ))}
      </div>
    </div>
  );
}

// Center-fade mask applied on top of word lanes
function CenterFadeMask() {
  return (
    <div
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        background: 'radial-gradient(ellipse 55% 60% at 50% 50%, #F97316 60%, transparent 100%)',
      }}
    />
  );
}

export const FeaturedPublications = ({ articles, config }: FeaturedPublicationsProps) => {
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [lanes, setLanes] = useState<{
    lane1: string[];
    lane2: string[];
    lane3: string[];
    lane4: string[];
  } | null>(null);

  const tolgee = useTolgee();
  const locale = tolgee.getLanguage() || 'fr';

  useEffect(() => {
    let words = BACKGROUND_WORDS;
    const customWordsStr = config['featured_background_words'];
    if (customWordsStr && customWordsStr.trim()) {
      words = customWordsStr
        .split(',')
        .map((w) => w.trim())
        .filter(Boolean);
    }

    const shuffle = (arr: string[]) => [...arr].sort(() => Math.random() - 0.5);
    const count = words.length;
    setLanes({
      lane1: shuffle(words).slice(0, Math.min(18, count)),
      lane2: shuffle(words).slice(Math.min(8, count), Math.min(26, count)),
      lane3: shuffle(words).slice(Math.min(4, count), Math.min(22, count)),
      lane4: shuffle(words).slice(Math.min(12, count), Math.min(30, count)),
    });
  }, [config]);

  const title =
    config[`featured_title_${locale}`] || config['featured_title'] || t`Publications récentes`;
  const tagline =
    config[`featured_tagline_${locale}`] || config['featured_tagline'] || t`Écrits sélectionnés`;

  // Fallback mock articles
  const mockArticles = [
    {
      id: 'm1',
      title: "L'impératif de la sobriété attentionnelle",
      content:
        '<p>Notre époque est marquée par une capture permanente de notre attention par des algorithmes toxiques.</p>',
      slug: 'sobriete',
      createdAt: new Date().toISOString(),
      isPremium: true,
      author: { name: 'Clara Lambert', logoUrl: null },
      category: { name: 'Philosophie' },
    },
    {
      id: 'm2',
      title: "Sortir du cloud : l'infrastructure éthique",
      content:
        "<p>Pourquoi l'hébergement de nos médias indépendants ne peut plus reposer sur les serveurs des GAFAM.</p>",
      slug: 'infra',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      isPremium: false,
      author: { name: 'Julien Roche', logoUrl: null },
      category: { name: 'Technologie' },
    },
    {
      id: 'm3',
      title: "La mémoire contre l'archive",
      content: "<p>Nous archivons tout. Mais archiver n'est pas se souvenir.</p>",
      slug: 'memoire',
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      isPremium: false,
      author: { name: 'Sophie Laurent', logoUrl: null },
      category: { name: 'Philosophie' },
    },
    {
      id: 'm4',
      title: 'Décentraliser la presse : protocoles et souveraineté',
      content: '<p>Vers une ère de protocoles décentralisés et de souveraineté numérique.</p>',
      slug: 'decentral',
      createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
      isPremium: true,
      author: { name: 'Alexandre Marin', logoUrl: null },
      category: { name: 'Politique' },
    },
    {
      id: 'm5',
      title: "Le journalisme d'enquête à l'ère du numérique",
      content: '<p>Comment les outils numériques transforment les pratiques journalistiques.</p>',
      slug: 'enquete',
      createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      isPremium: false,
      author: { name: 'Marc Dutronc', logoUrl: null },
      category: { name: 'Médias' },
    },
  ];

  const displayArticles = articles.length > 0 ? articles : mockArticles;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  return (
    <section
      className="relative overflow-hidden py-24 px-6"
      style={{ background: '#F97316' }}
      id="featured"
    >
      {/* ── Floating intellectual words (background) ─── */}
      {lanes && (
        <div className="absolute inset-0 overflow-hidden">
          <WordLane words={lanes.lane1} direction={1} speed={22} y="6%" />
          <WordLane words={lanes.lane2} direction={-1} speed={16} y="24%" />
          <WordLane words={lanes.lane3} direction={1} speed={19} y="54%" />
          <WordLane words={lanes.lane4} direction={-1} speed={14} y="78%" />
          {/* Center radial mask to fade words near the articles */}
          <CenterFadeMask />
        </div>
      )}

      {/* ── Content (above background) ─── */}
      <div className="relative z-20 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[10px] tracking-[0.3em] text-white/60 uppercase font-semibold mb-3"
          >
            {tagline}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-white tracking-tight"
          >
            {title}
          </motion.h2>
        </div>

        {/* Article rows — white cards on orange */}
        <div className="flex flex-col gap-3">
          {displayArticles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.07, duration: 0.5 }}
              onClick={() => setSelectedArticle(article)}
              className="group bg-white rounded-2xl px-7 py-5 cursor-pointer hover:shadow-lg transition-all duration-300 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-[9px] text-[#EE4B2B] font-bold tracking-widest uppercase">
                    {article.category?.name || t`Essai`}
                  </span>
                  {article.isPremium && (
                    <span className="text-[8px] text-muted-foreground border border-border px-1.5 py-0.5 rounded">
                      {t`Premium`}
                    </span>
                  )}
                </div>
                <h3 className="text-[15px] font-semibold text-foreground leading-snug line-clamp-1 group-hover:text-[#EE4B2B] transition-colors duration-200">
                  {article.title}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {article.author.name} · {formatDate(article.createdAt)}
                </p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-[#EE4B2B] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
            </motion.div>
          ))}
        </div>
      </div>

      {selectedArticle && (
        <ArticlePreviewModal article={selectedArticle} onClose={() => setSelectedArticle(null)} />
      )}
    </section>
  );
};
