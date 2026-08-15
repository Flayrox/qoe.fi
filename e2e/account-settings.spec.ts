import { test, expect } from '@playwright/test';

function settingsFixture() {
  return `
    <main>
      <h1>Réglages</h1>
      <nav aria-label="Sections des réglages">
        <button data-section="account">Compte</button>
        <button data-section="profile">Profil public</button>
        <button data-section="privacy">Confidentialité</button>
        <button data-section="data">Données & sécurité</button>
      </nav>
      <section data-testid="settings-content"><h2>Compte</h2></section>
      <section hidden data-section-content="privacy"><h2>Confidentialité</h2><label><input data-testid="mentions" type="checkbox" checked /> Autoriser les mentions</label></section>
      <section hidden data-section-content="data"><h2>Données & sécurité</h2><input data-testid="delete-confirmation" placeholder="Écrivez DELETE" /><button data-testid="delete-account" disabled>Demander la suppression</button></section>
      <script>
        const content = document.querySelector('[data-testid="settings-content"]');
        document.querySelectorAll('[data-section]').forEach((button) => button.addEventListener('click', () => {
          const section = button.dataset.section;
          content.innerHTML = document.querySelector('[data-section-content="' + section + '"]')?.innerHTML || '<h2>' + button.textContent + '</h2>';
        }));
        document.addEventListener('input', (event) => {
          if (event.target.matches('[data-testid="delete-confirmation"]')) {
            document.querySelectorAll('[data-testid="delete-account"]').forEach((button) => {
              button.disabled = event.target.value !== 'DELETE';
            });
          }
        });
      </script>
    </main>
  `;
}

test.describe('Account settings contracts', () => {
  test('navigates to privacy controls without losing the settings context', async ({ page }) => {
    await page.setContent(settingsFixture());
    await page.getByRole('button', { name: 'Confidentialité' }).click();
    await expect(page.locator('[data-testid="settings-content"]')).toContainText('Confidentialité');
    await expect(
      page.locator('[data-testid="settings-content"]').getByTestId('mentions')
    ).toBeChecked();
  });

  test('requires an explicit DELETE confirmation before account deletion', async ({ page }) => {
    await page.setContent(settingsFixture());
    await page.getByRole('button', { name: 'Données & sécurité' }).click();
    const settingsContent = page.locator('[data-testid="settings-content"]');
    const deleteButton = settingsContent.getByTestId('delete-account');
    await expect(deleteButton).toBeDisabled();
    await settingsContent.getByTestId('delete-confirmation').fill('delete');
    await expect(deleteButton).toBeDisabled();
    await settingsContent.getByTestId('delete-confirmation').fill('DELETE');
    await expect(deleteButton).toBeEnabled();
  });
});
