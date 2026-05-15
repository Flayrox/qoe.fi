import React from "react";
import { landingConfig } from "@/config/landing";

export const Marquee = () => {
  const { marquee } = landingConfig;

  return (
    <section className="py-12 border-y border-outline-variant/10 bg-white/30 dark:bg-zinc-950/30 backdrop-blur-sm overflow-hidden">
      <div className="max-w-5xl mx-auto px-6 text-center mb-8">
        <span className="font-mono text-[10px] tracking-[0.2em] text-on-surface-variant/60 dark:text-zinc-500 uppercase font-semibold">
          Trusted by independent voices across Europe
        </span>
      </div>
      <div className="flex w-[200%] animate-marquee">
        <div className="flex justify-around w-1/2 gap-12">
          {marquee.map((brand, i) => (
            <span key={i} className="font-display text-2xl font-medium text-primary/40 dark:text-white/20 whitespace-nowrap px-8">
              {brand}
            </span>
          ))}
        </div>
        <div className="flex justify-around w-1/2 gap-12">
          {marquee.map((brand, i) => (
            <span key={i + marquee.length} className="font-display text-2xl font-medium text-primary/40 dark:text-white/20 whitespace-nowrap px-8">
              {brand}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
