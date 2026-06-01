import { create } from "zustand"

export interface Tab {
  id: string
  title: string
  type: "timeline" | "article" | "post" | "profile"
  slug?: string
  username?: string
  scrollPosition: number
}

interface TabStore {
  tabs: Tab[]
  activeTabId: string
  addTab: (tab: Omit<Tab, "scrollPosition">) => void
  removeTab: (id: string) => void
  setActiveTabId: (id: string) => void
  updateScrollPosition: (id: string, scroll: number) => void
}

export const useTabStore = create<TabStore>((set) => ({
  tabs: [{ id: "timeline", title: "Timeline", type: "timeline", scrollPosition: 0 }],
  activeTabId: "timeline",
  
  addTab: (newTab) => set((state) => {
    const exists = state.tabs.some((t) => t.id === newTab.id)
    if (exists) {
      return { activeTabId: newTab.id }
    }
    
    // Tab limit of 10 to prevent memory leaks in DOM (Feature 1)
    let updatedTabs = [...state.tabs, { ...newTab, scrollPosition: 0 }]
    if (updatedTabs.length > 10) {
      const oldestIndex = updatedTabs.findIndex(t => t.id !== "timeline" && t.id !== newTab.id)
      if (oldestIndex !== -1) {
        updatedTabs.splice(oldestIndex, 1)
      }
    }
    
    return {
      tabs: updatedTabs,
      activeTabId: newTab.id
    }
  }),
  
  removeTab: (id) => set((state) => {
    if (id === "timeline") return {} // Protect core timeline tab
    const filteredTabs = state.tabs.filter((t) => t.id !== id)
    let newActiveId = state.activeTabId
    
    if (state.activeTabId === id) {
      const idx = state.tabs.findIndex((t) => t.id === id)
      newActiveId = state.tabs[idx - 1]?.id || "timeline"
    }
    
    return {
      tabs: filteredTabs,
      activeTabId: newActiveId
    }
  }),
  
  setActiveTabId: (id) => set({ activeTabId: id }),
  
  updateScrollPosition: (id, scroll) => set((state) => ({
    tabs: state.tabs.map((t) => t.id === id ? { ...t, scrollPosition: scroll } : t)
  }))
}))
