// =====================================================================
// 📧 @qoe/auth — Transactional Security Mailer
// =====================================================================

export interface SecurityLoginAlertData {
  toEmail: string;
  userName: string;
  deviceInfo?: string;
  ipAddress?: string;
  timestamp?: string;
}

export interface SecurityPasswordChangeData {
  toEmail: string;
  userName: string;
  timestamp?: string;
}

export interface SecurityEmailChangeData {
  toEmail: string;
  userName: string;
  newEmail: string;
}

export interface GdprArchiveData {
  toEmail: string;
  userName: string;
  downloadUrl: string;
  expiresInHours?: number;
}

/**
 * Base HTML email layout with Apple / Silicon Valley design standards
 */
function buildEmailTemplate(
  title: string,
  bodyContent: string,
  actionButton?: { label: string; url: string }
) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f4f4f5;
      color: #18181b;
      margin: 0;
      padding: 40px 12px;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 560px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      border: 1px solid #e4e4e7;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
      overflow: hidden;
      padding: 36px 32px;
    }
    .brand-header {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
      color: #18181b;
      margin-bottom: 28px;
    }
    .brand-accent {
      color: #ff3b30;
    }
    .email-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.3px;
      color: #09090b;
      margin-bottom: 12px;
      line-height: 1.3;
    }
    .email-body {
      font-size: 14px;
      line-height: 1.6;
      color: #3f3f46;
      margin-bottom: 24px;
    }
    .details-box {
      background-color: #fafafa;
      border: 1px solid #f4f4f5;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
      font-size: 13px;
    }
    .details-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #f4f4f5;
    }
    .details-row:last-child {
      border-bottom: none;
    }
    .details-label {
      color: #71717a;
      font-weight: 500;
    }
    .details-value {
      color: #18181b;
      font-weight: 600;
    }
    .button-container {
      margin-top: 28px;
      margin-bottom: 28px;
    }
    .cta-button {
      display: inline-block;
      background-color: #18181b;
      color: #ffffff !important;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 10px;
      text-align: center;
      transition: opacity 0.2s ease;
    }
    .cta-button:hover {
      opacity: 0.9;
    }
    .email-footer {
      font-size: 11px;
      color: #a1a1aa;
      border-top: 1px solid #f4f4f5;
      padding-top: 20px;
      margin-top: 28px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="brand-header">
      qoe<span class="brand-accent">.fi</span>
    </div>
    
    <div class="email-title">${title}</div>
    
    <div class="email-body">
      ${bodyContent}
    </div>

    ${
      actionButton
        ? `
    <div class="button-container">
      <a href="${actionButton.url}" class="cta-button" target="_blank">${actionButton.label}</a>
    </div>
    `
        : ''
    }

    <div class="email-footer">
      Cet e-mail automatique de sécurité vous est envoyé par <strong>qoe.fi</strong> pour la protection de votre compte.<br>
      Si vous avez des questions, contactez notre équipe sur <a href="mailto:support@qoe.fi" style="color:#71717a;">support@qoe.fi</a>.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Universal email dispatcher (Resend API or Dev Logger)
 */
export async function sendTransactionalEmail(data: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'qoe.fi Security <security@qoe.fi>',
          to: [data.to],
          subject: data.subject,
          html: data.html,
        }),
      });

      if (res.ok) {
        console.log(`[MAILER] Email successfully sent to ${data.to} via Resend API`);
        return { success: true };
      } else {
        const errJson = await res.json();
        console.error(`[MAILER ERROR] Resend API error:`, errJson);
      }
    } catch (err) {
      console.error(`[MAILER ERROR] Failed to send email via Resend API:`, err);
    }
  }

  // Development Fallback: Log simulated transactional email
  console.log(`\n=====================================================================`);
  console.log(`✉️ [SIMULATED TRANSACTIONAL EMAIL]`);
  console.log(`To: ${data.to}`);
  console.log(`Subject: ${data.subject}`);
  console.log(`=====================================================================\n`);

  return { success: true, simulated: true };
}

/**
 * Send New Login Security Alert
 */
export async function sendSecurityLoginAlert(data: SecurityLoginAlertData) {
  const formattedTime =
    data.timestamp || new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const device = data.deviceInfo || 'Navigateur Web';
  const ip = data.ipAddress || 'Non spécifiée';

  const html = buildEmailTemplate(
    'Alerte de Sécurité : Nouvelle Connexion Détectée',
    `<p>Bonjour ${data.userName || 'Utilisateur'},</p>
     <p>Une nouvelle connexion à votre compte <strong>qoe.fi</strong> vient d'être enregistrée depuis un nouvel appareil.</p>
     
     <div class="details-box">
       <div class="details-row">
         <span class="details-label">Date & Heure :</span>
         <span class="details-value">${formattedTime}</span>
       </div>
       <div class="details-row">
         <span class="details-label">Appareil :</span>
         <span class="details-value">${device}</span>
       </div>
       <div class="details-row">
         <span class="details-label">Adresse IP :</span>
         <span class="details-value">${ip}</span>
       </div>
     </div>
     
     <p>Si vous êtes à l'origine de cette connexion, aucune action n'est requise.</p>
     <p><strong>Si vous ne reconnaissez pas cette activité</strong>, veuillez immédiatement révoquer cette session et modifier votre mot de passe pour sécuriser votre compte.</p>`,
    {
      label: 'Gérer la Sécurité du Compte ↗',
      url: 'https://qoe.fi/settings',
    }
  );

  return sendTransactionalEmail({
    to: data.toEmail,
    subject: '🔐 Alerte de Sécurité — Nouvelle connexion à votre compte qoe.fi',
    html,
  });
}

/**
 * Send Password Changed Notification
 */
export async function sendSecurityPasswordChangedAlert(data: SecurityPasswordChangeData) {
  const formattedTime =
    data.timestamp || new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  const html = buildEmailTemplate(
    'Confirmation : Votre mot de passe a été modifié',
    `<p>Bonjour ${data.userName || 'Utilisateur'},</p>
     <p>Le mot de passe associé à votre compte <strong>qoe.fi</strong> (${data.toEmail}) a été modifié avec succès le <strong>${formattedTime}</strong>.</p>
     
     <p>Si vous êtes à l'origine de ce changement, vous pouvez ignorer ce message.</p>
     <p><strong>Si vous n'avez pas demandé cette modification</strong>, contactez immédiatement notre équipe de support technique pour verrouiller l'accès à votre compte.</p>`,
    {
      label: 'Accéder à mes Réglages ↗',
      url: 'https://qoe.fi/settings',
    }
  );

  return sendTransactionalEmail({
    to: data.toEmail,
    subject: '🔑 Mot de Passe Modifié — qoe.fi',
    html,
  });
}

/**
 * Send GDPR Data Archive Download Link
 */
export async function sendGdprArchiveReadyEmail(data: GdprArchiveData) {
  const expiresIn = data.expiresInHours || 24;

  const html = buildEmailTemplate(
    'Votre Archive de Données RGPD est Prête',
    `<p>Bonjour ${data.userName || 'Utilisateur'},</p>
     <p>Conformément à l'Article 20 du Règlement Général sur la Protection des Données (RGPD), votre archive complète de données personnelles est prête au téléchargement.</p>
     
     <p>L'archive contient vos informations de profil, l'historique de vos abonnements, vos bookmarks et vos transactions au format JSON portable.</p>
     
     <p><em>Attention : Pour des raisons de confidentialité, ce lien de téléchargement chiffré expirera automatiquement dans ${expiresIn} heures.</em></p>`,
    {
      label: 'Télécharger mon Archive JSON ↗',
      url: data.downloadUrl,
    }
  );

  return sendTransactionalEmail({
    to: data.toEmail,
    subject: '📦 Votre Archive de Données RGPD — qoe.fi',
    html,
  });
}
