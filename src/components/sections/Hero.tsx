"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { Typewriter } from "@/components/ui/Typewriter";
import { Reveal } from "@/components/ui/Reveal";
import { landingConfig } from "@/config/landing";

export const Hero = () => {
  const { hero } = landingConfig;

  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden">
      {/* Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] -z-10" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px] -z-10" />

      <div className="max-w-5xl mx-auto text-center">
        <Reveal>
          <div className="inline-flex items-center gap-3 mb-8 bg-white/50 dark:bg-white/5 backdrop-blur-sm px-4 py-2 rounded-full border border-white/50 dark:border-white/10 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-on-surface-variant dark:text-zinc-400 uppercase font-semibold">
              {hero.badge}
            </span>
          </div>
        </Reveal>

        <Reveal delay={0.4}>
          <h1 className="font-display text-6xl md:text-8xl text-primary dark:text-white leading-[1.1] mb-8 tracking-tight font-semibold">
            <Typewriter
              phrases={hero.phrases}
              className="text-accent italic"
            />
            <br />
            {hero.titleSuffix}
          </h1>
        </Reveal>

        <Reveal delay={0.6}>
          <p className="font-body text-lg md:text-xl text-on-surface-variant dark:text-zinc-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            {hero.description}
          </p>
        </Reveal>

        <Reveal delay={0.8}>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <Button size="lg" className="px-10">{hero.primaryCta.text}</Button>
            <Button variant="secondary" size="lg" className="px-10">{hero.secondaryCta.text}</Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
