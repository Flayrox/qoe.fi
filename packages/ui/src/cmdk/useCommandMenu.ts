"use client";

import { useState, useEffect } from "react";

const listeners = new Set<(open: boolean) => void>();
let globalIsOpen = false;

export function setCommandMenuOpen(open: boolean) {
  globalIsOpen = open;
  listeners.forEach((listener) => listener(open));
}

export function useCommandMenu() {
  const [isOpen, setIsOpenState] = useState(globalIsOpen);

  useEffect(() => {
    const listener = (open: boolean) => setIsOpenState(open);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandMenuOpen(!globalIsOpen);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const setIsOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === "function" ? open(globalIsOpen) : open;
    setCommandMenuOpen(next);
  };

  return { isOpen, setIsOpen };
}
