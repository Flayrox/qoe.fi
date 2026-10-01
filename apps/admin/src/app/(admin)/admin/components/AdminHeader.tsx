'use client';

import { Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { SafeAvatar } from '@qoe/ui';

interface AdminHeaderUser {
  id: string;
  name: string | null;
  email: string;
  username: string | null;
}

interface AdminHeaderProps {
  user: AdminHeaderUser | null;
  /** Rôles réellement attribués (le header ne suppose plus « superadmin »). */
  roles?: readonly string[];
}

export function AdminHeader({ user, roles = [] }: AdminHeaderProps) {
  return (
    <header className="absolute top-8 right-8 md:top-12 md:right-12 z-10 flex items-center justify-end w-full pointer-events-none">
      <div className="flex items-center gap-4 pointer-events-auto bg-card/60 backdrop-blur-xl border border-border/50 p-1.5 rounded-full shadow-[0_8px_16px_-4px_rgba(0,0,0,0.05)]">
        <motion.div
          whileHover={{ scale: 0.98 }}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-2 cursor-pointer group px-3 py-1.5 rounded-full hover:bg-muted/80 transition-colors"
          data-testid="admin-open-command-palette"
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <div className="hidden sm:flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              Rechercher
            </span>
            <kbd className="font-mono text-[10px] bg-card border border-border text-muted-foreground px-1.5 py-0.5 rounded shadow-sm">
              ⌘K
            </kbd>
          </div>
        </motion.div>

        <div className="w-px h-5 bg-border/60 hidden sm:block" />

        {roles.length > 0 && (
          <div
            className="hidden md:flex items-center gap-1.5 pl-1"
            data-testid="admin-header-roles"
            title={`Rôles attribués : ${roles.join(', ')}`}
          >
            {roles.slice(0, 3).map((role) => (
              <span
                key={role}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {role}
              </span>
            ))}
            {roles.length > 3 && (
              <span className="text-[10px] font-medium text-muted-foreground">
                +{roles.length - 3}
              </span>
            )}
          </div>
        )}

        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="cursor-pointer pr-1"
          data-testid="admin-header-avatar"
        >
          <SafeAvatar name={user?.name} username={user?.username} size={32} shape="circle" />
        </motion.div>
      </div>
    </header>
  );
}
