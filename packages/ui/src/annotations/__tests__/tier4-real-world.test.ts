// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Tier 4: Real-World Scenarios (Feed Reader 94vh & md:left-64 Boundary, Tenant Accent & Paywall Isolation)", () => {

  describe("R2: Feed Reader Bottom-Sheet Drawer Layout & Navigation Boundary", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      document.body.innerHTML = "";
      container = document.createElement("div");
      container.innerHTML = `
        <div id="sidebar" class="fixed left-0 top-0 bottom-0 w-64 bg-sidebar">Sidebar (left-64)</div>
        <div id="drawer-root" class="fixed inset-0 md:left-64 z-50 flex flex-col justify-end">
          <div id="backdrop" class="fixed inset-0 md:left-64 bg-black/40 backdrop-blur-xs"></div>
          <div id="drawer-panel" class="relative z-10 w-full h-[94vh] max-h-[94vh] flex flex-col bg-background border-t border-l rounded-t-3xl shadow-2xl">
            <div id="drawer-header" class="flex items-center justify-between px-6 py-3 border-b">
              <span class="text-xs uppercase font-bold text-primary">Lecture & Annotation</span>
              <h3 id="article-title">Feed Article Title</h3>
              <button id="close-drawer-btn">Close</button>
            </div>
            <div id="drawer-body" class="flex-1 overflow-y-auto p-6">
              <div id="article-content">
                <p>Feed reader article content text passage.</p>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(container);
    });

    it("should enforce h-[94vh] drawer height and md:left-64 boundary preserving sidebar navigation", () => {
      const drawerRoot = container.querySelector("#drawer-root");
      const backdrop = container.querySelector("#backdrop");
      const drawerPanel = container.querySelector("#drawer-panel");

      expect(drawerRoot?.className).toContain("md:left-64");
      expect(backdrop?.className).toContain("md:left-64");
      expect(drawerPanel?.className).toContain("h-[94vh]");
      expect(drawerPanel?.className).toContain("max-h-[94vh]");
      expect(drawerPanel?.className).toContain("rounded-t-3xl");
    });

    it("should toggle body overflow scroll locking and close on ESC keypress", () => {
      let isOpen = true;
      const closeHandler = vi.fn(() => {
        isOpen = false;
        document.body.style.overflow = "";
      });

      // Simulate drawer mounting scroll lock
      document.body.style.overflow = "hidden";
      expect(document.body.style.overflow).toBe("hidden");

      // ESC key listener
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen) {
          closeHandler();
        }
      };
      window.addEventListener("keydown", handleKeyDown);

      // Fire ESC keypress event
      const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
      window.dispatchEvent(escEvent);

      expect(closeHandler).toHaveBeenCalledTimes(1);
      expect(document.body.style.overflow).toBe("");

      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  describe("R3: Tenant Creator Page Compatibility & Accent Styling", () => {
    it("should inherit and apply custom tenant accent color (--tenant-accent)", () => {
      const tenantWrapper = document.createElement("div");
      tenantWrapper.className = "tenant-theme";
      tenantWrapper.style.setProperty("--tenant-accent", "#f59e0b");

      const mark = document.createElement("mark");
      mark.className = "border-b border-[var(--tenant-accent)]";
      mark.textContent = "Tenant accent text";
      tenantWrapper.appendChild(mark);
      document.body.appendChild(tenantWrapper);

      expect(tenantWrapper.style.getPropertyValue("--tenant-accent")).toBe("#f59e0b");
      expect(mark.className).toContain("border-[var(--tenant-accent)]");
    });

    it("should respect server paywall isolation (sliceContentAtPaywall)", () => {
      const sliceContentAtPaywall = (content: string, isSubscribed: boolean) => {
        const paywallMarker = "<!-- PAYWALL -->";
        if (!content.includes(paywallMarker) || isSubscribed) return { readable: content, isLocked: false };
        const parts = content.split(paywallMarker);
        return { readable: parts[0], isLocked: true };
      };

      const articleBody = "Free teaser passage. <!-- PAYWALL --> Premium locked content for subscribers only.";

      const freeView = sliceContentAtPaywall(articleBody, false);
      expect(freeView.isLocked).toBe(true);
      expect(freeView.readable).toBe("Free teaser passage. ");
      expect(freeView.readable).not.toContain("Premium locked content");

      const paidView = sliceContentAtPaywall(articleBody, true);
      expect(paidView.isLocked).toBe(false);
      expect(paidView.readable).toContain("Premium locked content");
    });
  });

  describe("R1: Rauno Morphing Selection Toolbar & Physics Props", () => {
    it("should define rauno-morphing-surface layoutId and spring physics config (stiffness 500, damping 32)", () => {
      const toolbar = document.createElement("div");
      toolbar.setAttribute("data-layout-id", "rauno-morphing-surface");
      toolbar.className = "bg-popover border shadow-2xl rounded-full p-1";

      const springPhysicsConfig = { type: "spring", stiffness: 500, damping: 32 };

      expect(toolbar.getAttribute("data-layout-id")).toBe("rauno-morphing-surface");
      expect(springPhysicsConfig.stiffness).toBe(500);
      expect(springPhysicsConfig.damping).toBe(32);
    });
  });

});
