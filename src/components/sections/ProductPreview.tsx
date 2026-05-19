"use client";

import React, { useState } from "react";
import { Reveal } from "@/components/ui/Reveal";
import { Bold, Italic, Link, Image as ImageIcon, Type, Heading1, Heading2 } from "lucide-react";
import { landingConfig } from "@/config/landing";

export const ProductPreview = () => {
  const [view, setView] = useState<"creator" | "reader">("creator");
  const { productPreview } = landingConfig;

  return (
    <section className="py-24 px-6 bg-muted/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <Reveal>
            <span className="font-mono text-[10px] tracking-[0.2em] text-chart-1 uppercase font-semibold mb-4 block">
              {productPreview.tagline}
            </span>
          </Reveal>
          <Reveal delay={0.4}>
            <h2 className="font-display text-4xl md:text-5xl text-foreground font-medium tracking-tight mb-8">
              {productPreview.title}
            </h2>
          </Reveal>
          
          <Reveal delay={0.6}>
            <div className="flex bg-muted/50 backdrop-blur-md rounded-full p-1 border border-border/30 w-fit mx-auto shadow-sm">
              <button 
                onClick={() => setView("creator")}
                className={`px-8 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest transition-all duration-300 ${view === "creator" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
              >
                Creator Mode
              </button>
              <button 
                onClick={() => setView("reader")}
                className={`px-8 py-2 rounded-full font-mono text-[10px] uppercase tracking-widest transition-all duration-300 ${view === "reader" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground"}`}
              >
                Reader View
              </button>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.8} width="100%">
          <div className="relative w-full aspect-16/10 md:aspect-video bg-card rounded-3xl shadow-2xl border border-border/30 overflow-hidden group">
            {/* Window Chrome */}
            <div className="h-12 bg-muted/50 border-b border-border/30 flex items-center px-6 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400/20" />
              <div className="w-3 h-3 rounded-full bg-amber-400/20" />
              <div className="w-3 h-3 rounded-full bg-green-400/20" />
              <div className="flex-1 flex justify-center">
                <div className="bg-background/50 px-4 py-1 rounded-md text-[10px] font-classical text-muted-foreground/60 border border-border/20 italic">
                  qoe.fi/studio/architecture-of-silence
                </div>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex h-[calc(100%-3rem)]">
              {view === "creator" && (
                <aside className="w-64 bg-muted/30 border-r border-border/20 p-8 hidden md:flex flex-col">
                  <div className="mb-12">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-chart-1 mb-2 block">Document</span>
                    <h4 className="font-display text-xl text-foreground leading-tight">{productPreview.creator.title}</h4>
                  </div>
                  <div className="space-y-8 flex-1">
                    <div>
                      <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground/40 mb-3 block">Metrics</span>
                      <div className="grid grid-cols-2 gap-4">
                        {productPreview.creator.metrics.map(metric => (
                          <div key={metric.label} className="bg-card p-3 rounded-xl border border-border/20 shadow-sm">
                            <span className="block font-display text-lg text-foreground">{metric.value}</span>
                            <span className="text-[9px] font-mono text-muted-foreground/60 uppercase">{metric.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button className="bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest py-3 rounded-xl shadow-sm hover:opacity-90 transition-opacity">
                    Publish
                  </button>
                </aside>
              )}

              <main className={`flex-1 bg-background p-8 md:p-16 overflow-y-auto relative ${view === "reader" ? "max-w-3xl mx-auto" : ""}`}>
                {view === "creator" && (
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-card/80 backdrop-blur-md rounded-full px-6 py-3 shadow-xl border border-border/20 flex items-center gap-6 z-10 scale-90 md:scale-100">
                    <Heading1 className="w-4 h-4 text-muted-foreground/40" />
                    <Heading2 className="w-4 h-4 text-muted-foreground/40" />
                    <div className="w-px h-4 bg-border/30" />
                    <Bold className="w-4 h-4 text-foreground" />
                    <Italic className="w-4 h-4 text-muted-foreground/40" />
                    <Link className="w-4 h-4 text-muted-foreground/40" />
                    <div className="w-px h-4 bg-border/30" />
                    <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                  </div>
                )}

                <div className={`${view === "creator" ? "mt-12" : "mt-0"}`}>
                  <h1 className="font-display text-4xl md:text-5xl text-foreground mb-12 tracking-tight">
                    {view === "creator" ? productPreview.creator.title : productPreview.reader.title}
                  </h1>
                  <div className="prose dark:prose-invert prose-stone prose-lg">
                    <p className="font-body text-muted-foreground leading-relaxed mb-8">
                      <span className="float-left text-6xl font-classical text-chart-1 mr-4 mt-2 italic">I</span>
                      {productPreview.reader.content.substring(1)}
                    </p>
                    <div className="my-12 aspect-video bg-muted rounded-2xl overflow-hidden shadow-inner border border-border/20 group-hover:shadow-lg transition-shadow duration-500">
                      <div className="w-full h-full bg-linear-to-br from-primary/5 to-chart-1/5 flex items-center justify-center">
                         <ImageIcon className="w-12 h-12 text-primary/10" />
                      </div>
                    </div>
                  </div>
                </div>
              </main>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
