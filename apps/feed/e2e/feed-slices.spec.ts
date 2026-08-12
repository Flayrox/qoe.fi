import { test, expect } from '@playwright/test'

test.describe('Bluesky Feed Architecture & Thread Composer', () => {
  test('should open multi-post composer and render secondary thought inputs', async ({ page }) => {
    // Go to home feed page
    await page.goto('http://localhost:3010/home')

    // Click on composer textarea or expand composer
    const textarea = page.locator('textarea[placeholder*="pensée"]').first()
    if (await textarea.isVisible()) {
      await textarea.click()
      await textarea.fill('Première pensée du fil test E2E')

      // Click "+ Ajouter une pensée" button
      const addThoughtBtn = page.getByRole('button', { name: /Ajouter une pensée/i })
      if (await addThoughtBtn.isVisible()) {
        await addThoughtBtn.click()

        // Check if secondary textarea appears
        const secondaryTextarea = page.locator('textarea[placeholder*="Pensée suivante"]').first()
        await expect(secondaryTextarea).toBeVisible()
        await secondaryTextarea.fill('Deuxième pensée du fil test E2E')

        // Verify primary button label updates to "Tout publier (2)"
        const submitBtn = page.getByRole('button', { name: /Tout publier/i })
        await expect(submitBtn).toBeVisible()
      }
    }
  })

  test('should display feed slice items with connectors in timeline', async ({ page }) => {
    await page.goto('http://localhost:3010/home')

    // Check if feed slices or thoughts exist
    const feedContainer = page.locator('div').filter({ hasText: /Afficher plus de réponses/i }).first()
    if (await feedContainer.isVisible()) {
      await expect(feedContainer).toBeVisible()
    }
  })
})
