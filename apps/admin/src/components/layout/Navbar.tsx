'use client';

import React from 'react';
import Link from 'next/link';
import { t } from '@lingui/core/macro';
import { motion } from 'framer-motion';

export const Navbar = () => {
  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-8 left-0 right-0 z-50 px-6"
    >
      <div className="max-w-6xl mx-auto flex justify-between items-center p-2 bg-foreground/40 backdrop-blur-2xl border border-white/5 rounded-full shadow-2xl">
        <div className="flex items-center gap-10 pl-6">
          <Link href="/" className="font-classical text-2xl font-bold tracking-tighter text-white">
            QOE<span className="text-white/20">.</span>FI
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            <Link
              href="#"
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
            >
              {t`Manifeste`}
            </Link>
            <Link
              href="#"
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
            >
              {t`Le Réseau`}
            </Link>
            <Link
              href="#"
              className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
            >
              {t`Souveraineté`}
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-6 py-3 text-[10px] font-mono uppercase tracking-[0.2em] text-white/60 hover:text-white transition-all"
          >
            {t`Connexion`}
          </Link>
          <Link
            href="/login"
            className="px-8 py-3 bg-background text-foreground rounded-full text-[10px] font-mono uppercase tracking-[0.2em] font-bold hover:bg-border transition-all shadow-xl"
          >
            {t`Accès Souverain`}
          </Link>
        </div>
      </div>
    </motion.nav>
  );
};
