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
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.key === "k" || e.key === "K" || e.code === "KeyK") &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        e.stopPropagation();
        setCommandMenuOpen(!globalIsOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);

  const setIsOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === "function" ? open(globalIsOpen) : open;
    setCommandMenuOpen(next);
  };

  return { isOpen, setIsOpen };
}
