"use client";

import { CommandMenu, useCommandMenu } from "@qoe/ui";
import { settingsTree, flattenSettingsTree } from "../../settings/config/settingsTree";
import { useMemo } from "react";

export function GlobalCommandMenu() {
  const { isOpen, setIsOpen } = useCommandMenu();

  const items = useMemo(() => {
    return flattenSettingsTree(settingsTree);
  }, []);

  return <CommandMenu open={isOpen} onOpenChange={setIsOpen} items={items} />;
}
