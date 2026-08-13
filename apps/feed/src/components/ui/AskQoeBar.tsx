'use client';

import React, { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Search,
  Compass,
  BookOpen,
  User,
  Mail,
  Sun,
  Moon,
  CornerDownLeft,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslate } from '@qoe/i18n';
import { useRouter } from 'next/navigation';

export const AskQoeBar = () => {
  const { t } = useTranslate();
  const router = useRouter();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  // Toggle command menu with Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <>
      {/* Floating Bar at Bottom of viewport */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-6 pointer-events-none">
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
          onClick={() => setOpen(true)}
          className="pointer-events-auto cursor-pointer group flex items-center justify-between p-1.5 bg-card/70 dark:bg-card/65 backdrop-blur-2xl border border-border/60 hover:border-primary/50 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.4)] transition-all duration-500 overflow-hidden relative"
        >
          {/* Animated background gradient halo inside the bar */}
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />

          <div className="flex items-center gap-3 pl-4 py-2">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-xs text-muted-foreground font-sans">
              {t('ask_bar_placeholder', 'Demandez à qoe.fi ou cherchez... (⌘K)')}
            </span>
          </div>

          <div className="flex items-center gap-2 pr-1">
            <kbd className="hidden sm:inline-flex h-7 select-none items-center gap-1 rounded-full bg-muted px-3 text-[10px] font-mono text-muted-foreground border border-border/40 font-semibold">
              <span className="text-xs">⌘</span>K
            </kbd>
            <div className="p-2 bg-foreground text-background dark:bg-foreground dark:text-background rounded-full hover:scale-105 active:scale-95 transition-all">
              <Search className="w-3.5 h-3.5" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Command Palette Modal */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-background/60 backdrop-blur-md"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
              className="relative w-full max-w-xl bg-card border border-border/60 rounded-[2.5rem] shadow-2xl overflow-hidden pointer-events-auto"
            >
              {/* Animated borders with custom theme values */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />

              <Command label="Command Menu" className="flex flex-col h-full max-h-[480px]">
                {/* Search Input Box */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-border/40 relative">
                  <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <Command.Input
                    autoFocus
                    placeholder={t('ask_modal_placeholder', 'Que recherchez-vous ?')}
                    value={searchVal}
                    onValueChange={setSearchVal}
                    className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/60 outline-none border-none py-1 focus:ring-0"
                  />
                  {searchVal && (
                    <button
                      onClick={() => setSearchVal('')}
                      className="text-[10px] font-mono text-muted-foreground hover:text-foreground px-2 py-1 bg-muted rounded-md transition-all"
                    >
                      CLEAR
                    </button>
                  )}
                </div>

                {/* Command Lists */}
                <Command.List className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                  <Command.Empty className="py-12 text-center text-xs text-muted-foreground italic">
                    {t('ask_empty', 'Aucun résultat trouvé.')}
                  </Command.Empty>

                  <Command.Group
                    heading={t('ask_group_nav', 'Raccourcis')}
                    className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-foreground/80 px-3 mb-2"
                  >
                    <CommandItem
                      icon={<Compass className="w-4 h-4 text-primary" />}
                      label="Explorer les publications"
                      shortcut="G P"
                      onSelect={() => {
                        setOpen(false);
                        router.push('#feed');
                      }}
                    />
                    <CommandItem
                      icon={<BookOpen className="w-4 h-4 text-primary" />}
                      label="Lire le Manifeste"
                      shortcut="G M"
                      onSelect={() => {
                        setOpen(false);
                        router.push('/login');
                      }}
                    />
                  </Command.Group>

                  <Command.Group
                    heading={t('ask_group_action', 'Actions rapides')}
                    className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-foreground/80 px-3 mb-2"
                  >
                    <CommandItem
                      icon={<Mail className="w-4 h-4 text-primary" />}
                      label="S'abonner aux newsletters"
                      shortcut="S U B"
                      onSelect={() => {
                        setOpen(false);
                        router.push('#cta');
                      }}
                    />
                    <CommandItem
                      icon={<User className="w-4 h-4" />}
                      label="Rejoindre en tant que créateur"
                      shortcut="J O I N"
                      onSelect={() => {
                        setOpen(false);
                        router.push('/login');
                      }}
                    />
                  </Command.Group>

                  <Command.Group
                    heading={t('ask_group_theme', 'Préférences')}
                    className="text-[10px] font-sans font-bold uppercase tracking-wider text-muted-foreground/80 px-3 mb-2"
                  >
                    <CommandItem
                      icon={<Sun className="w-4 h-4 text-highlight" />}
                      label="Passer en Mode Clair (Nuages & Lumière)"
                      onSelect={() => {
                        setTheme('light');
                        setOpen(false);
                      }}
                    />
                    <CommandItem
                      icon={<Moon className="w-4 h-4 text-primary" />}
                      label="Passer en Mode Sombre (Neural Expressive)"
                      onSelect={() => {
                        setTheme('dark');
                        setOpen(false);
                      }}
                    />
                  </Command.Group>
                </Command.List>

                {/* Footer hints */}
                <div className="px-6 py-4 bg-muted/20 border-t border-border/40 flex items-center justify-between text-[10px] font-sans font-medium text-muted-foreground uppercase tracking-widest">
                  <div className="flex items-center gap-4">
                    <span>↑↓ Naviguer</span>
                    <span>⏎ Valider</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>Ask qoe.fi</span>
                    <CornerDownLeft className="w-3 h-3" />
                  </div>
                </div>
              </Command>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

interface CommandItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}

const CommandItem = ({ icon, label, shortcut, onSelect }: CommandItemProps) => {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex items-center justify-between p-3.5 rounded-2xl hover:bg-muted/60 data-[selected=true]:bg-muted/80 cursor-pointer transition-all duration-200 select-none group"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted/60 rounded-xl group-data-[selected=true]:bg-card group-data-[selected=true]:scale-105 transition-all">
          {icon}
        </div>
        <span className="text-xs text-foreground font-medium group-data-[selected=true]:text-primary transition-colors">
          {label}
        </span>
      </div>
      {shortcut && (
        <span className="text-[10px] font-mono text-muted-foreground/60 px-2 py-0.5 bg-muted rounded border border-border/30">
          {shortcut}
        </span>
      )}
    </Command.Item>
  );
};
