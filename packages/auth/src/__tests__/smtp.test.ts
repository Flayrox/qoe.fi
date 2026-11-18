// =====================================================================
// 🧪 SMTP client — envoi réel contre un serveur SMTP factice
// =====================================================================
// Vérifie le dialogue EHLO → AUTH LOGIN → MAIL/RCPT → DATA → QUIT et
// l'encodage RFC 2047 du sujet, sans dépendance externe.

import { describe, it, expect } from 'vitest';
import net from 'node:net';

import { sendEmailViaSMTP, SMTPError } from '../smtp';

interface FakeSMTP {
  port: number;
  message: () => string;
  close: () => void;
}

function startFakeSMTP(opts: { rejectMailFrom?: boolean } = {}): Promise<FakeSMTP> {
  let received = '';

  const server = net.createServer((conn) => {
    let buffer = '';
    let inData = false;
    let stage = 0; // 0=EHLO 1=AUTH LOGIN 2=user 3=pass 4=MAIL 5=RCPT 6=DATA 7=body 8=QUIT

    const reply = (s: string) => conn.write(s + '\r\n');

    // Bannière SMTP obligatoire (le client attend un 220 avant tout).
    reply('220 fake ESMTP ready');

    conn.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      while (buffer.includes('\n')) {
        const nl = buffer.indexOf('\n');
        const raw = buffer.slice(0, nl).replace(/\r$/, '');
        buffer = buffer.slice(nl + 1);

        if (inData) {
          if (raw === '.') {
            inData = false;
            reply('250 2.0.0 Ok: queued');
          } else {
            received += raw + '\n';
          }
          continue;
        }

        const cmd = raw.toUpperCase();
        if (cmd.startsWith('EHLO')) {
          reply('250-fake ESMTP');
          reply('250-AUTH LOGIN PLAIN');
          reply('250 OK');
          stage = 1;
        } else if (stage === 1 && cmd.startsWith('AUTH LOGIN')) {
          reply('334 VXNlcm5hbWU6'); // Username:
          stage = 2;
        } else if (stage === 2) {
          reply('334 UGFzc3dvcmQ6'); // Password:
          stage = 3;
        } else if (stage === 3) {
          reply('235 2.7.0 Authentication successful');
          stage = 4;
        } else if (cmd.startsWith('MAIL FROM')) {
          reply(opts.rejectMailFrom ? '550 5.1.0 Rejected' : '250 2.1.0 Ok');
          stage = 5;
        } else if (cmd.startsWith('RCPT TO')) {
          reply('250 2.1.5 Ok');
          stage = 6;
        } else if (cmd.startsWith('DATA')) {
          reply('354 End data with <CR><LF>.<CR><LF>');
          inData = true;
          stage = 7;
        } else if (cmd.startsWith('QUIT')) {
          reply('221 2.0.0 Bye');
          conn.end();
        } else {
          reply('250 Ok');
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        message: () => received,
        close: () => server.close(),
      });
    });
  });
}

describe('sendEmailViaSMTP', () => {
  it('envoie via AUTH LOGIN et encode le sujet RFC 2047', async () => {
    const smtp = await startFakeSMTP();
    try {
      await sendEmailViaSMTP(
        {
          host: '127.0.0.1',
          port: smtp.port,
          user: 'user',
          pass: 'pass',
          from: 'qoe.fi Security <security@qoe.fi>',
          // Relais de test en clair : l'AUTH sans TLS est un opt-in explicite.
          allowInsecureAuth: true,
        },
        { to: 'reader@example.com', subject: 'Alerte de Sécurité 🔐', html: '<p>Bonjour</p>' }
      );

      const msg = smtp.message();
      expect(msg).toContain('Subject: =?UTF-8?B?');
      expect(msg).toContain('To: reader@example.com');
      expect(msg).toContain('Content-Type: text/html; charset=UTF-8');
      expect(msg).toContain('<p>Bonjour</p>');
    } finally {
      smtp.close();
    }
  });

  it('rejette proprement quand le relais refuse le destinataire', async () => {
    const smtp = await startFakeSMTP({ rejectMailFrom: true });
    try {
      await expect(
        sendEmailViaSMTP(
          {
            host: '127.0.0.1',
            port: smtp.port,
            user: 'u',
            pass: 'p',
            from: 'a@qoe.fi',
            allowInsecureAuth: true,
          },
          { to: 'b@example.com', subject: 'Test', html: '<p>x</p>' }
        )
      ).rejects.toBeInstanceOf(SMTPError);
    } finally {
      smtp.close();
    }
  });

  it("refuse l'AUTH en clair quand le relais n'offre pas STARTTLS", async () => {
    const smtp = await startFakeSMTP();
    try {
      await expect(
        sendEmailViaSMTP(
          {
            host: '127.0.0.1',
            port: smtp.port,
            user: 'user',
            pass: 'secret',
            from: 'security@qoe.fi',
          },
          { to: 'reader@example.com', subject: 'Test', html: '<p>x</p>' }
        )
      ).rejects.toThrow(/refusée sans TLS/);
    } finally {
      smtp.close();
    }
  });

  it('rejette un destinataire porteur de CRLF (injection de commande)', async () => {
    await expect(
      sendEmailViaSMTP(
        { host: '127.0.0.1', port: 1, from: 'security@qoe.fi', allowInsecureAuth: true },
        {
          to: 'victim@example.com>\r\nRCPT TO:<attacker@evil.test',
          subject: 'Test',
          html: '<p>x</p>',
        }
      )
    ).rejects.toThrow(/destinataire contient un saut de ligne/);
  });

  it('rejette un sujet porteur de CRLF (injection d’en-tête)', async () => {
    await expect(
      sendEmailViaSMTP(
        { host: '127.0.0.1', port: 1, from: 'security@qoe.fi', allowInsecureAuth: true },
        {
          to: 'reader@example.com',
          subject: 'Bonjour\r\nBcc: attacker@evil.test',
          html: '<p>x</p>',
        }
      )
    ).rejects.toThrow(/sujet contient un saut de ligne/);
  });
});
