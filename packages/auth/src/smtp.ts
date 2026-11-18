// =====================================================================
// 📧 SMTP — client minimal sans dépendance (node:net / node:tls)
// =====================================================================
// Envoie un email transactionnel via n'importe quel relais SMTP :
//   - Stalwart local (VPS), Hostinger, SendGrid, Resend SMTP…
//   - ports 25 (clair), 587 (STARTTLS) ou 465 (TLS implicite),
//   - AUTH LOGIN / AUTH PLAIN quand user/pass sont fournis.
// Sujet et noms d'affichage encodés RFC 2047 (UTF-8 → =?UTF-8?B?...?=).

import net from 'node:net';
import tls from 'node:tls';

export interface SMTPOptions {
  host: string;
  port?: number;
  user?: string;
  pass?: string;
  /** true = TLS implicite (port 465) ; false = STARTTLS si proposé (587/25). */
  secure?: boolean;
  /**
   * Autorise AUTH sans TLS (relais de test uniquement). Défaut false : sans
   * STARTTLS, envoyer le mot de passe en clair est un downgrade silencieux.
   */
  allowInsecureAuth?: boolean;
  from: string;
}

export interface SMTPMessage {
  to: string;
  subject: string;
  html: string;
}

export class SMTPError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly reply?: string
  ) {
    super(message);
    this.name = 'SMTPError';
  }
}

function encodeRFC2047(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return '=?UTF-8?B?' + Buffer.from(value, 'utf8').toString('base64') + '?=';
}

function extractAddress(addr: string): string {
  const m = /<([^>]+)>/.exec(addr);
  return m ? m[1] : addr;
}

/**
 * Refuse CR/LF/NUL : sans ce garde, un en-tête (sujet, adresse) peut injecter
 * des lignes SMTP supplémentaires (Bcc:, ou une commande DATA complète).
 */
function assertNoControl(value: string, label: string): void {
  if (/[\r\n\u0000]/.test(value)) {
    throw new SMTPError(`smtp: ${label} contient un saut de ligne interdit`);
  }
}

/**
 * Valide l'adresse d'enveloppe (MAIL FROM / RCPT TO) : jamais de nom
 * d'affichage, d'espace, de chevron ou de point-virgule, qui casseraient la
 * commande SMTP.
 */
function envelopeAddress(raw: string, label: string): string {
  assertNoControl(raw, label);
  const address = extractAddress(raw).trim();
  if (!/^[^\s<>@",;:]+@[^\s<>@",;:]+$/.test(address)) {
    throw new SMTPError(`smtp: ${label} invalide (adresse e-mail attendue)`);
  }
  return address;
}

function encodeAddressHeader(addr: string): string {
  const open = addr.indexOf('<');
  if (open <= 0) return addr;
  const name = addr.slice(0, open).trim();
  const email = addr.slice(open);
  if (/^[\x00-\x7F]*$/.test(name)) return addr;
  return encodeRFC2047(name) + ' ' + email;
}

export async function sendEmailViaSMTP(opts: SMTPOptions, msg: SMTPMessage): Promise<void> {
  const port = opts.port || 587;
  const host = opts.host;
  // Validation avant toute connexion : une adresse ou un sujet porteur de
  // CR/LF ne doit jamais atteindre le dialogue SMTP.
  const fromAddress = envelopeAddress(opts.from, 'expéditeur');
  const toAddress = envelopeAddress(msg.to, 'destinataire');
  assertNoControl(msg.subject, 'sujet');
  let sock: net.Socket | tls.TLSSocket = opts.secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });

  sock.setTimeout(20_000);

  let buffer = '';
  // TLS actif (implicite ou après STARTTLS) : condition d'un AUTH sûr.
  let tlsActive = opts.secure === true;
  let replyLines: string[] = []; // lignes de la dernière réponse (multi-lignes incluse)
  let intermediate: string[] = [];
  const waiters: Array<{ resolve: (line: string) => void; reject: (err: Error) => void }> = [];

  // ── Tampon de réponses : une réponse multi-lignes (250-… / 250 …) est
  //    assemblée ; le waiter reçoit la dernière ligne, replyLines garde tout.
  const attachData = (s: net.Socket | tls.TLSSocket) => {
    s.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (true) {
        const idx = buffer.indexOf('\r\n');
        if (idx === -1) break;
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (/^\d{3}-/.test(raw)) {
          intermediate.push(raw);
          continue;
        }
        replyLines = [...intermediate, raw];
        intermediate = [];
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(raw);
      }
    });
  };
  attachData(sock);

  const fail = (err: Error) => {
    const waiter = waiters.shift();
    if (waiter) waiter.reject(err);
    sock.destroy();
  };
  // Après STARTTLS, le socket est remplacé : sans ce rebranchement, une erreur
  // sur le socket chiffré devenait un événement 'error' non géré (crash du
  // process) et le listener restait sur le socket d'origine.
  const wire = (s: net.Socket | tls.TLSSocket) => {
    s.on('error', (err) => fail(new SMTPError(`smtp: erreur réseau: ${err.message}`)));
    s.on('timeout', () => fail(new SMTPError('smtp: timeout')));
  };
  wire(sock);

  const readReply = (): Promise<string> =>
    new Promise((resolve, reject) => {
      waiters.push({ resolve, reject });
    });

  const send = (cmd: string, accept: number[]): Promise<string> =>
    new Promise((resolve, reject) => {
      waiters.push({
        resolve: (line) => {
          const code = parseInt(line.slice(0, 3), 10);
          if (accept.includes(code)) resolve(line);
          else reject(new SMTPError(`smtp: ${cmd} → ${line}`, code, line));
        },
        reject,
      });
      sock.write(cmd + '\r\n');
    });

  try {
    const greeting = await readReply();
    if (parseInt(greeting.slice(0, 3), 10) !== 220) {
      throw new SMTPError(`smtp: bannière → ${greeting}`);
    }

    const ehlo = async () => {
      await new Promise<void>((resolve, reject) => {
        waiters.push({
          resolve: () => resolve(),
          reject,
        });
        sock.write(`EHLO ${host}\r\n`);
      });
    };
    await ehlo();
    const advertised = replyLines.join('\n');

    // STARTTLS si proposé (et qu'on n'est pas déjà en TLS implicite).
    if (!opts.secure && /STARTTLS/i.test(advertised)) {
      await send('STARTTLS', [220]);
      const upgraded = tls.connect({ socket: sock, servername: host } as never);
      await new Promise<void>((resolve, reject) => {
        upgraded.once('secureConnect', () => resolve());
        upgraded.once('error', (err) => reject(new SMTPError(`smtp: starttls: ${err.message}`)));
      });
      sock = upgraded;
      tlsActive = true;
      buffer = '';
      intermediate = [];
      replyLines = [];
      attachData(sock);
      wire(sock);
      await ehlo();
      replyLines = [];
    }

    // Authentification : AUTH LOGIN (universel), repli AUTH PLAIN.
    if (opts.user) {
      if (!tlsActive && !opts.allowInsecureAuth) {
        throw new SMTPError(
          'smtp: authentification refusée sans TLS (STARTTLS indisponible) — allowInsecureAuth pour un relais de test'
        );
      }
      try {
        await send('AUTH LOGIN', [334]);
        await send(Buffer.from(opts.user, 'utf8').toString('base64'), [334]);
        await send(Buffer.from(opts.pass || '', 'utf8').toString('base64'), [235]);
      } catch (err) {
        if (err instanceof SMTPError && err.code === 504) {
          const token = Buffer.from(`\u0000${opts.user}\u0000${opts.pass || ''}`, 'utf8').toString(
            'base64'
          );
          await send(`AUTH PLAIN ${token}`, [235]);
        } else {
          throw err;
        }
      }
    }

    await send(`MAIL FROM:<${fromAddress}>`, [250]);
    await send(`RCPT TO:<${toAddress}>`, [250]);
    await send('DATA', [354]);

    const body =
      `From: ${encodeAddressHeader(opts.from)}\r\n` +
      `To: ${encodeAddressHeader(msg.to)}\r\n` +
      `Subject: ${encodeRFC2047(msg.subject)}\r\n` +
      'MIME-Version: 1.0\r\n' +
      'Content-Type: text/html; charset=UTF-8\r\n' +
      `Date: ${new Date().toUTCString()}\r\n` +
      'X-Mailer: qoe-mailer\r\n' +
      '\r\n' +
      msg.html;

    // Dot-stuffing : les lignes commençant par « . » sont doublées.
    sock.write(body.replace(/^\./gm, '..') + '\r\n.\r\n');
    const done = await readReply();
    if (parseInt(done.slice(0, 3), 10) !== 250) {
      throw new SMTPError(`smtp: fin de message → ${done}`);
    }

    await send('QUIT', [221, 250]);
  } finally {
    sock.destroy();
  }
}
