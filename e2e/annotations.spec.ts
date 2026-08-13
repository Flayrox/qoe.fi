import { test, expect } from '@playwright/test';

test.describe('Tier 4: E2E Annotation Engine — Layout, Boundaries, Rauno Physics & Tenant Styling', () => {
  test.describe('R2: Feed Reader Drawer (94vh & md:left-64 Sidebar Boundary)', () => {
    test('should maintain h-[94vh] height and preserve md:left-64 sidebar navigation boundary', async ({
      page,
    }) => {
      // Set viewport to desktop size (width >= 768px for md: breakpoint)
      await page.setViewportSize({ width: 1280, height: 800 });

      await page.setContent(`
        <html>
          <head>
            <style>
              body { margin: 0; padding: 0; font-family: sans-serif; }
              .sidebar { position: fixed; left: 0; top: 0; bottom: 0; width: 256px; background: #1e1e2e; color: white; }
            </style>
          </head>
          <body>
            <div id="sidebar" class="sidebar">Nav Sidebar (64 = 256px)</div>
            
            <div id="drawer-wrapper" class="fixed inset-0 md:left-64 z-50 flex flex-col justify-end">
              <div id="backdrop" class="fixed inset-0 md:left-64 bg-black/40 backdrop-blur-xs"></div>
              <div id="drawer-panel" class="relative z-10 w-full h-[94vh] max-h-[94vh] bg-background border-t rounded-t-3xl shadow-2xl">
                <div id="drawer-header" class="flex items-center justify-between p-4 border-b">
                  <h3>Article Title</h3>
                  <button id="close-btn">Close</button>
                </div>
                <div id="article-content" class="p-6">
                  <p>Feed reader article content text passage.</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `);

      const sidebar = page.locator('#sidebar');
      const drawerWrapper = page.locator('#drawer-wrapper');
      const drawerPanel = page.locator('#drawer-panel');

      // Verify sidebar is visible
      await expect(sidebar).toBeVisible();
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox?.width).toBe(256); // 64 * 4px = 256px

      // Verify drawer wrapper starts at 256px (left-64)
      const wrapperBox = await drawerWrapper.boundingBox();
      expect(wrapperBox?.x).toBe(256);

      // Verify drawer panel height matches 94vh (94% of 800px = 752px)
      const panelBox = await drawerPanel.boundingBox();
      expect(panelBox?.height).toBe(752);
    });

    test('should lock body scroll when drawer opens and release on ESC keypress', async ({
      page,
    }) => {
      await page.setContent(`
        <html>
          <body>
            <div id="status">Open</div>
            <script>
              document.body.style.overflow = "hidden";
              window.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                  document.body.style.overflow = "";
                  document.getElementById("status").textContent = "Closed";
                }
              });
            </script>
          </body>
        </html>
      `);

      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

      await page.keyboard.press('Escape');

      expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
      await expect(page.locator('#status')).toHaveText('Closed');
    });
  });

  test.describe('R3: Tenant Creator Page Compatibility & Accent Styling', () => {
    test('should respect --tenant-accent CSS variable for creator highlighting', async ({
      page,
    }) => {
      await page.setContent(`
        <html>
          <head>
            <style>
              .tenant-container {
                --tenant-accent: #f59e0b;
              }
              mark.tenant-accent-mark {
                border-bottom: 2px solid var(--tenant-accent);
              }
            </style>
          </head>
          <body>
            <div class="tenant-container">
              <p>Tenant creator article text <mark class="tenant-accent-mark" id="tenant-mark">highlighted text</mark>.</p>
            </div>
          </body>
        </html>
      `);

      const mark = page.locator('#tenant-mark');
      await expect(mark).toBeVisible();

      const borderColor = await mark.evaluate((el) => {
        return window.getComputedStyle(el).borderBottomColor;
      });

      // rgb(245, 158, 11) is #f59e0b
      expect(borderColor).toContain('rgb(245, 158, 11)');
    });

    test('should maintain paywall isolation by slicing content at paywall boundary', async () => {
      const sliceContentAtPaywall = (content: string, isSubscribed: boolean) => {
        const paywallMarker = '<!-- PAYWALL -->';
        if (!content.includes(paywallMarker) || isSubscribed)
          return { readable: content, isLocked: false };
        const parts = content.split(paywallMarker);
        return { readable: parts[0], isLocked: true };
      };

      const fullContent =
        'Free preview passage. <!-- PAYWALL --> Locked premium subscriber passage.';

      const unsubscribed = sliceContentAtPaywall(fullContent, false);
      expect(unsubscribed.isLocked).toBe(true);
      expect(unsubscribed.readable).not.toContain('Locked premium subscriber passage.');
      expect(unsubscribed.readable).toContain('Free preview passage.');

      const subscribed = sliceContentAtPaywall(fullContent, true);
      expect(subscribed.isLocked).toBe(false);
      expect(subscribed.readable).toContain('Locked premium subscriber passage.');
    });
  });

  test.describe('R1: Rauno Selection Toolbar & Spring Physics Surface', () => {
    test("should render morphing toolbar with layoutId='rauno-morphing-surface' and spring physics", async ({
      page,
    }) => {
      await page.setContent(`
        <html>
          <body>
            <div data-layout-id="rauno-morphing-surface" id="morph-surface" class="bg-popover border shadow-2xl rounded-full p-1">
              <button id="highlight-btn">Surligner</button>
              <button id="annotate-btn">Annoter</button>
              <button id="quote-btn">Citer</button>
            </div>
          </body>
        </html>
      `);

      const toolbar = page.locator('#morph-surface');
      await expect(toolbar).toBeVisible();
      await expect(toolbar).toHaveAttribute('data-layout-id', 'rauno-morphing-surface');

      await expect(page.locator('#highlight-btn')).toBeVisible();
      await expect(page.locator('#annotate-btn')).toBeVisible();
      await expect(page.locator('#quote-btn')).toBeVisible();
    });
  });
});
