#!/usr/bin/env node
// =====================================================================
// 📬 SMTP local de développement — capture au lieu d'envoi
// =====================================================================
// Le poste de dev n'a ni Docker ni Mailpit (cf. AGENTS.md) : ce puits SMTP
// autonome, sans dépendance, écoute sur 127.0.0.1 et écrit chaque message
// dans `.mail-outbox/` (format `.eml` lisible par Mail.app/Thunderbird).
//
//   pnpm mail:dev            # écoute sur 127.0.0.1:1025
//   SMTP_DEV_PORT=2525 pnpm mail:dev
//
// Côté mailer (`packages/auth/src/mailer.ts`), il suffit de pointer :
//   EMAIL_PROVIDER=smtp
//   SMTP_HOST=127.0.0.1
//   SMTP_PORT=1025
//   SMTP_USER=            (vide → aucune AUTH, donc aucun TLS requis)
//
// 🔒 Ne jamais exposer ce port : il accepte tout message sans authentification.
// =====================================================================

import { createServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HOST = process.env.SMTP_DEV_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.SMTP_DEV_PORT || '1025', 10);
const OUTBOX = resolve(process.cwd(), process.env.SMTP_DEV_OUTBOX || '.mail-outbox');
const MAX_BYTES = 25 * 1024 * 1024;

mkdirSync(OUTBOX, { recursive: true });

function log(...args) {
  console.log(`[smtp-dev]`, ...args);
}

/** Retire le « dot-stuffing » SMTP (RFC 5321 §4.5.2). */
function unstuff(data) {
  return data.replace(/\r\n\.\./g, '\r\n.');
}

function safeFileName(value) {
  return (
    value
      .replace(/[^a-zA-Z0-9@._-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'mail'
  );
}

/** Extrait l'objet du message (pour les logs) sans parser tout le MIME. */
function subjectOf(raw) {
  const match = raw.match(/^Subject:\s*(.*)$/im);
  if (!match) return '(sans objet)';
  // Sujet encodé RFC 2047 : on affiche la forme brute, suffisante en dev.
  return match[1].trim().slice(0, 120);
}

const server = createServer((socket) => {
  socket.setEncoding('utf8');
  socket.setTimeout(60_000);

  let buffer = '';
  let inData = false;
  let data = '';
  let from = '';
  const recipients = [];

  const send = (line) => socket.write(`${line}\r\n`);
  send('220 smtp-dev local — messages capturés dans .mail-outbox');

  socket.on('data', (chunk) => {
    buffer += chunk;

    // En mode DATA, tout est corps jusqu'à la ligne « . » seule.
    if (inData) {
      data += buffer;
      buffer = '';
      const end = data.indexOf('\r\n.\r\n');
      if (end === -1) {
        if (data.length > MAX_BYTES) {
          send('552 5.3.4 Message trop volumineux');
          socket.destroy();
        }
        return;
      }
      const body = unstuff(data.slice(0, end + 2));
      const rest = data.slice(end + 5);
      data = '';
      inData = false;

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = resolve(OUTBOX, `${stamp}-${safeFileName(recipients[0] || 'mail')}.eml`);
      try {
        writeFileSync(file, body, 'utf8');
        log(`✉️  ${recipients.join(', ') || '(sans destinataire)'} — ${subjectOf(body)}`);
        log(`    → ${file}`);
        send('250 2.0.0 Message accepté');
      } catch (err) {
        log('écriture impossible :', err instanceof Error ? err.message : err);
        send('451 4.3.0 Erreur locale');
      }
      recipients.length = 0;
      from = '';
      if (rest) buffer = rest;
      return;
    }

    // Mode commandes : une ligne = une instruction.
    let newline;
    while ((newline = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 2);
      handleCommand(line);
      if (socket.destroyed) return;
    }
  });

  function handleCommand(line) {
    const upper = line.toUpperCase();

    if (upper.startsWith('EHLO')) {
      socket.write('250-smtp-dev\r\n250-8BITMIME\r\n250-SMTPUTF8\r\n250 OK\r\n');
      return;
    }
    if (upper.startsWith('HELO')) {
      send('250 smtp-dev');
      return;
    }
    if (upper.startsWith('MAIL FROM:')) {
      from = line.slice(10).trim();
      send('250 2.1.0 Expéditeur accepté');
      return;
    }
    if (upper.startsWith('RCPT TO:')) {
      recipients.push(line.slice(8).trim().replace(/^<|>$/g, ''));
      send('250 2.1.5 Destinataire accepté');
      return;
    }
    if (upper === 'DATA') {
      if (recipients.length === 0) {
        send('503 5.5.1 RCPT TO requis avant DATA');
        return;
      }
      inData = true;
      send('354 Envoyez le message, terminez par une ligne contenant un point');
      return;
    }
    if (upper === 'RSET') {
      recipients.length = 0;
      from = '';
      send('250 2.0.0 Réinitialisé');
      return;
    }
    if (upper === 'NOOP') {
      send('250 2.0.0 OK');
      return;
    }
    if (upper === 'QUIT') {
      send('221 2.0.0 Au revoir');
      socket.end();
      return;
    }
    send('502 5.5.2 Commande non implémentée');
  }

  socket.on('error', (err) => log('connexion en erreur :', err.message));
});

server.listen(PORT, HOST, () => {
  log(`écoute sur ${HOST}:${PORT}`);
  log(`capture dans ${OUTBOX}`);
  log('pointer le mailer dessus : EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=' + PORT);
});

process.on('SIGINT', () => {
  log('arrêt');
  server.close(() => process.exit(0));
});
