"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useTranslate } from "@tolgee/react";
import { ArrowUpRight } from "lucide-react";
import { ArticlePreviewModal } from "./ArticlePreviewModal";

interface FeaturedPublicationsProps {
  articles: any[];
  config: Record<string, string>;
}

export const FeaturedPublications = ({ articles, config }: FeaturedPublicationsProps) => {
  const { t } = useTranslate();
  const [selectedArticle, setSelectedArticle] = useState<any | null>(null);

  const title = config["featured_title"] || t("featured_pub_title", "Publications");
  const tagline = config["featured_tagline"] || t("featured_pub_tagline", "Écrits récents");

  // Fallback mock articles
  const mockArticles = [
    {
      id: "mock-1",
      title: "L'impératif de la sobriété attentionnelle",
      content: "<p>Notre époque est marquée par une capture permanente de notre attention par des algorithmes toxiques. Choisir le silence, c'est choisir l'émancipation intellectuelle.</p>",
      slug: "sobriete-attentionnelle",
      createdAt: new Date().toISOString(),
      isPremium: true,
      author: { name: "Clara Lambert", logoUrl: null },
      category: { name: "Philosophie" },
    },
    {
      id: "mock-2",
      title: "Sortir du cloud : l'infrastructure éthique",
      content: "<p>Pourquoi l'hébergement de nos médias indépendants ne peut plus reposer sur les serveurs des GAFAM.</p>",
      slug: "infrastructure-ethique",
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      isPremium: false,
      author: { name: "Julien Roche", logoUrl: null },
      category: { name: "Technologie" },
    },
    {
      id: "mock-3",
      title: "La mémoire contre l'archive",
      content: "<p>Nous archivons tout. Mais archiver n'est pas se souvenir. La mémoire est active, elle transforme.</p>",
      slug: "memoire-archive",
      createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
      isPremium: false,
      author: { name: "Sophie Laurent", logoUrl: null },
      category: { name: "Philosophie" },
    },
    {
      id: "mock-4",
      title: "Décentraliser la presse : protocoles et souveraineté",
      content: "<p>Vers une ère de protocoles décentralisés et de souveraineté numérique individuelle.</p>",
      slug: "decentraliser-presse",
      createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
      isPremium: true,
      author: { name: "Alexandre Marin", logoUrl: null },
      category: { name: "Politique" },
    },
  ];

  const displayArticles = articles.length > 0 ? articles : mockArticles;

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <section className="py-20 px-6 bg-background" id="featured">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-12">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[10px] tracking-[0.25em] text-neutral-400 uppercase font-semibold mb-3"
          >
            {tagline}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold text-neutral-900 tracking-tight"
          >
            {title}
          </motion.h2>
        </div>

        {/* Article rows — editorial list, inspired by Vercel/Cursor */}
        <div className="flex flex-col">
          {displayArticles.map((article, index) => (
            <motion.div
              key={article.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.06, duration: 0.5 }}
              className={`group flex items-start justify-between py-5 border-t border-neutral-100 first:border-t-0 hover:bg-neutral-50/60 -mx-4 px-4 rounded-lg transition-colors cursor-pointer`}
              onClick={() => setSelectedArticle(article)}
            >
              {/* Left: content */}
              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="text-[10px] text-[#EE4B2B] font-semibold tracking-wider uppercase">
                    {article.category?.name || "Essai"}
                  </span>
                  {article.isPremium && (
                    <span className="text-[9px] text-neutral-400 border border-neutral-200 px-1.5 py-0.5 rounded">
                      Premium
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-neutral-900 leading-snug group-hover:text-[#EE4B2B] transition-colors duration-200 line-clamp-1">
                  {article.title}
                </h3>
                <p className="text-[11px] text-neutral-400 mt-1.5">
                  {article.author.name} · {formatDate(article.createdAt)}
                </p>
              </div>

              {/* Right: arrow */}
              <div className="flex-shrink-0 mt-1">
                <ArrowUpRight className="w-4 h-4 text-neutral-300 group-hover:text-[#EE4B2B] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
              </div>
            </motion.div>
          ))}
        </div>

      </div>

      {/* Article Preview Modal */}
      {selectedArticle && (
        <ArticlePreviewModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </section>
  );
};
