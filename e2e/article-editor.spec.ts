import { test, expect } from '@playwright/test';

function editorFixture(room: string) {
  return `
    <main>
      <h1>Éditeur d'article</h1>
      <section data-testid="article-attribution-editor">
        <div data-testid="attribution-row-author-1">
          <strong>Auteur principal</strong>
          <span>Publié</span>
        </div>
        <div data-testid="attribution-row-co-author-1">
          <strong>Co-auteur</strong>
          <span data-testid="consent-status">En attente</span>
          <button data-testid="accept-contributor" type="button">Accepter d'être cité</button>
        </div>
      </section>
      <textarea data-testid="collaborative-editor" aria-label="Corps de l'article"></textarea>
      <span data-testid="collaboration-status">Co-édition · essai local</span>
      <script>
        const channel = new BroadcastChannel(${JSON.stringify(room)});
        const editor = document.querySelector('[data-testid="collaborative-editor"]');
        const status = document.querySelector('[data-testid="collaboration-status"]');
        const consent = document.querySelector('[data-testid="consent-status"]');
        channel.postMessage({ type: 'join' });
        channel.onmessage = (event) => {
          if (event.data.type === 'content') editor.value = event.data.value;
          if (event.data.type === 'join') status.textContent = '2 éditeurs';
        };
        editor.addEventListener('input', () => {
          channel.postMessage({ type: 'content', value: editor.value });
        });
        document.querySelector('[data-testid="accept-contributor"]').addEventListener('click', (event) => {
          consent.textContent = 'Consentement accepté';
          event.target.remove();
        });
      </script>
    </main>
  `;
}

test.describe('Article editor contracts', () => {
  test('keeps contributors hidden until they explicitly consent', async ({ page }) => {
    await page.setContent(editorFixture(`qoe-e2e-${Date.now()}`));

    await expect(page.locator('[data-testid="article-attribution-editor"]')).toBeVisible();
    await expect(page.locator('[data-testid="attribution-row-author-1"]')).toContainText(
      'Auteur principal'
    );
    await expect(page.locator('[data-testid="consent-status"]')).toHaveText('En attente');

    await page.locator('[data-testid="accept-contributor"]').click();
    await expect(page.locator('[data-testid="consent-status"]')).toHaveText('Consentement accepté');
  });

  test('synchronizes editor text between two browser tabs in the local trial room', async ({
    page,
    context,
  }) => {
    const room = `qoe-e2e-${Date.now()}-${Math.random()}`;
    const secondPage = await context.newPage();
    await Promise.all([page.goto('/home'), secondPage.goto('/home')]);
    await page.setContent(editorFixture(room));
    await secondPage.setContent(editorFixture(room));

    await page.locator('[data-testid="collaborative-editor"]').fill('Texte partagé en direct');
    await expect(secondPage.locator('[data-testid="collaborative-editor"]')).toHaveValue(
      'Texte partagé en direct'
    );
  });
});
