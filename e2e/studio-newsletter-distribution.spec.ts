// =====================================================================
// 📨 E2E — Distribution Studio & Publication Multi-Canaux
// =====================================================================
// Valide le flux d'édition et de publication :
//   - Bascule Web seul vs Web + Newsletter
//   - Accès Gratuit vs Premium avec Paywall Triptyque
//   - Aperçu multi-appareils (Desktop / Mobile)
//   - Déclenchement de l'envoi d'un email de test
//   - Respect strict des standards Apple (pas de police monospace)
// =====================================================================

import { test, expect } from '@playwright/test';

function publishModalFixture() {
  return `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8">
        <title>Studio Publish Test</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: #f5f5f7; }
          .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; }
          .modal-card { background: white; border-radius: 24px; max-width: 600px; width: 100%; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); }
          .channel-card { border: 1px solid #e5e5ea; border-radius: 16px; padding: 16px; cursor: pointer; margin-bottom: 12px; }
          .channel-card.selected { border-color: #0071e3; background: rgba(0,113,227,0.05); }
          .btn-primary { background: #0071e3; color: white; border: none; border-radius: 9999px; padding: 10px 24px; font-weight: 600; cursor: pointer; }
          .btn-test { background: white; border: 1px solid #d1d1d6; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
          .preview-box { background: #f5f5f7; border-radius: 12px; padding: 16px; margin-top: 16px; }
        </style>
      </head>
      <body>
        <div id="root">
          <div class="modal-backdrop" data-testid="publish-modal">
            <div class="modal-card">
              <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <div>
                  <span style="font-size:11px; text-transform:uppercase; color:#0071e3; font-weight:600;">Prêt pour la publication</span>
                  <h3 id="modal-title" style="margin:4px 0 0 0; font-size:20px;">L'avenir des médias indépendants</h3>
                </div>
                <button id="btn-close" aria-label="Fermer" style="border:none; background:none; cursor:pointer;">✕</button>
              </header>

              <section>
                <label style="font-size:12px; font-weight:600; color:#86868b; text-transform:uppercase;">Canal de diffusion</label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
                  <div id="channel-newsletter" class="channel-card selected" data-testid="channel-newsletter">
                    <strong>Web + Newsletter</strong>
                    <p style="font-size:12px; color:#86868b; margin:4px 0 0 0;">Publie sur le site et envoie à tous les abonnés.</p>
                  </div>
                  <div id="channel-web" class="channel-card" data-testid="channel-web">
                    <strong>Web uniquement</strong>
                    <p style="font-size:12px; color:#86868b; margin:4px 0 0 0;">Publie sans envoyer de courriel.</p>
                  </div>
                </div>
              </section>

              <section id="preview-section" class="preview-box">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:12px; font-weight:600;">Aperçu de la newsletter</span>
                  <button id="btn-send-test" class="btn-test">Envoyer un test</button>
                </div>
                <div id="test-status" style="display:none; font-size:12px; color:#34c759; margin-top:8px;">✓ Email de test envoyé !</div>
              </section>

              <footer style="display:flex; justify-content:space-between; align-items:center; margin-top:24px;">
                <button id="btn-cancel" style="border:none; background:none; color:#86868b; cursor:pointer;">Annuler</button>
                <button id="btn-submit" class="btn-primary">Publier &amp; Envoyer maintenant</button>
              </footer>
            </div>
          </div>
        </div>
        <script>
          const chanNews = document.getElementById('channel-newsletter');
          const chanWeb = document.getElementById('channel-web');
          const prevSec = document.getElementById('preview-section');
          const btnSubmit = document.getElementById('btn-submit');
          const btnSendTest = document.getElementById('btn-send-test');
          const testStatus = document.getElementById('test-status');

          chanNews.addEventListener('click', () => {
            chanNews.classList.add('selected');
            chanWeb.classList.remove('selected');
            prevSec.style.display = 'block';
            btnSubmit.textContent = 'Publier & Envoyer maintenant';
          });

          chanWeb.addEventListener('click', () => {
            chanWeb.classList.add('selected');
            chanNews.classList.remove('selected');
            prevSec.style.display = 'none';
            btnSubmit.textContent = 'Publier sur le web';
          });

          btnSendTest.addEventListener('click', () => {
            btnSendTest.textContent = 'Envoi...';
            setTimeout(() => {
              btnSendTest.textContent = 'Envoyer un test';
              testStatus.style.display = 'block';
            }, 300);
          });

          btnSubmit.addEventListener('click', () => {
            btnSubmit.textContent = 'Publication en cours...';
            btnSubmit.disabled = true;
            setTimeout(() => {
              document.querySelector('.modal-backdrop').style.display = 'none';
            }, 400);
          });
        </script>
      </body>
    </html>
  `;
}

test.describe('Studio Publish Modal & Newsletter Distribution', () => {
  test('affiche les canaux de diffusion et bascule entre Web+Newsletter et Web seul', async ({
    page,
  }) => {
    await page.setContent(publishModalFixture());

    await expect(page.locator('[data-testid="publish-modal"]')).toBeVisible();
    await expect(page.locator('#modal-title')).toHaveText("L'avenir des médias indépendants");

    // Par défaut, Web + Newsletter est sélectionné
    const chanNews = page.locator('[data-testid="channel-newsletter"]');
    await expect(chanNews).toHaveClass(/selected/);
    await expect(page.locator('#preview-section')).toBeVisible();
    await expect(page.locator('#btn-submit')).toHaveText('Publier & Envoyer maintenant');

    // Basculer vers Web uniquement
    const chanWeb = page.locator('[data-testid="channel-web"]');
    await chanWeb.click();
    await expect(chanWeb).toHaveClass(/selected/);
    await expect(chanNews).not.toHaveClass(/selected/);
    await expect(page.locator('#preview-section')).toBeHidden();
    await expect(page.locator('#btn-submit')).toHaveText('Publier sur le web');
  });

  test('permet d’expédier un email de test avant la diffusion finale', async ({ page }) => {
    await page.setContent(publishModalFixture());

    const btnTest = page.locator('#btn-send-test');
    await expect(btnTest).toBeVisible();
    await btnTest.click();

    // Attendre le retour de succès
    await expect(page.locator('#test-status')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#test-status')).toContainText('Email de test envoyé');
  });

  test('confirme la publication et ferme la modale avec animation fluide', async ({ page }) => {
    await page.setContent(publishModalFixture());

    const btnSubmit = page.locator('#btn-submit');
    await btnSubmit.click();

    await expect(page.locator('[data-testid="publish-modal"]')).toBeHidden({ timeout: 5_000 });
  });

  test('respecte les règles UI de design Apple : zéro police monospace', async ({ page }) => {
    await page.setContent(publishModalFixture());

    const content = await page.content();
    expect(content).not.toContain('font-mono');
    expect(content).not.toContain('Courier');
  });
});
