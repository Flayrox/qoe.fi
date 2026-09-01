package workers

// =====================================================================
// 📧 EmailProvider — contrat d'envoi d'emails du worker (SMTP ou Resend)
// =====================================================================
// Le worker draine la boîte d'envoi (NotificationDelivery, channel EMAIL)
// via un EmailProvider injecté. Le fournisseur est choisi par EMAIL_PROVIDER :
//   - "smtp"   → relais SMTP (Stalwart local, Hostinger, SendGrid…), variables SMTP_*
//   - "resend" → API Resend (RESEND_API_KEY)
// Aucune valeur sensible dans Git : tout passe par l'environnement du worker.

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

// EmailMessage est le message envoyé par un EmailProvider.
type EmailMessage struct {
	From    string
	To      string
	Subject string
	HTML    string
}

// EmailProvider envoie un email transactionnel.
type EmailProvider interface {
	// Name identifie le fournisseur (stocké dans NotificationDelivery.provider).
	Name() string
	Send(ctx context.Context, msg EmailMessage) error
}

// ─────────────────────────────────────────────────────────────────────
// SMTP (self-hosté : Stalwart local, relais Hostinger, SMTP de n'importe quel
// fournisseur compatible — ports 25, 587 STARTTLS ou 465 TLS implicite).
// ─────────────────────────────────────────────────────────────────────

// SMTPConfig configure un relais SMTP.
type SMTPConfig struct {
	Host   string
	Port   int
	User   string
	Pass   string
	From   string
	Secure bool // true = TLS implicite (port 465) ; false = STARTTLS si dispo (587/25)
}

type SMTPProvider struct {
	cfg SMTPConfig
}

func NewSMTPProvider(cfg SMTPConfig) *SMTPProvider {
	return &SMTPProvider{cfg: cfg}
}

func (p *SMTPProvider) Name() string { return "smtp" }

func (p *SMTPProvider) Send(ctx context.Context, msg EmailMessage) error {
	from := msg.From
	if from == "" {
		from = p.cfg.From
	}
	if from == "" {
		return fmt.Errorf("smtp: expéditeur manquant (EMAIL_FROM)")
	}

	// 1) Connexion : TLS implicite (465) ou TCP nu (25/587 → STARTTLS ensuite).
	var conn net.Conn
	var err error
	if p.cfg.Secure {
		dialer := &tls.Dialer{NetDialer: &net.Dialer{Timeout: 15 * time.Second}}
		conn, err = dialer.DialContext(ctx, "tcp", smtpAddr(p.cfg))
	} else {
		dialer := &net.Dialer{Timeout: 15 * time.Second}
		conn, err = dialer.DialContext(ctx, "tcp", smtpAddr(p.cfg))
	}
	if err != nil {
		return fmt.Errorf("smtp: connexion %s: %w", smtpAddr(p.cfg), err)
	}

	client, err := smtp.NewClient(conn, p.cfg.Host)
	if err != nil {
		_ = conn.Close()
		return fmt.Errorf("smtp: handshake: %w", err)
	}
	defer client.Close()

	if err := client.Hello(p.cfg.Host); err != nil {
		return fmt.Errorf("smtp: ehlo: %w", err)
	}

	// 2) STARTTLS si le serveur le propose (et qu'on n'est pas déjà en TLS).
	if !p.cfg.Secure {
		if ok, _ := client.Extension("STARTTLS"); ok {
			if err := client.StartTLS(&tls.Config{ServerName: p.cfg.Host}); err != nil {
				return fmt.Errorf("smtp: starttls: %w", err)
			}
			// Post-STARTTLS : re-EHLO (certains serveurs exigent une nouvelle EHLO).
			_ = client.Hello(p.cfg.Host)
		}
	}

	// 3) Authentification (PLAIN sur canal chiffré — universel : Hostinger,
	//    SendGrid, Postfix/Dovecot…). Sans user/pass, relais ouvert local.
	if p.cfg.User != "" {
		auth := smtp.PlainAuth("", p.cfg.User, p.cfg.Pass, p.cfg.Host)
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp: auth: %w", err)
		}
	}

	// 4) Enveloppe + contenu.
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp: mail from: %w", err)
	}
	if err := client.Rcpt(msg.To); err != nil {
		return fmt.Errorf("smtp: rcpt to %s: %w", msg.To, err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp: data: %w", err)
	}
	headers := buildSMTPHeaders(from, msg)
	body := headers + "\r\n" + msg.HTML
	if _, err := w.Write([]byte(body)); err != nil {
		_ = w.Close()
		return fmt.Errorf("smtp: écriture: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp: fin de message: %w", err)
	}

	return client.Quit()
}

func smtpAddr(cfg SMTPConfig) string {
	port := cfg.Port
	if port == 0 {
		port = 587
	}
	return net.JoinHostPort(cfg.Host, fmt.Sprintf("%d", port))
}

// buildSMTPHeaders compose les en-têtes RFC 5322 (sujet encodé RFC 2047 +
// Message-ID unique — absent côté GoTrue, pénalisé par Gmail/mail-tester).
func buildSMTPHeaders(from string, msg EmailMessage) string {
	return fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMessage-ID: <%s@qoe.fi>\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nDate: %s\r\nX-Mailer: qoe-worker",
		encodeAddressHeader(from), encodeAddressHeader(msg.To), encodeRFC2047(msg.Subject),
		messageID(), time.Now().UTC().Format(time.RFC1123Z))
}

// messageID génère un identifiant unique pour l'en-tête Message-ID.
func messageID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// encodeAddressHeader encode un « Display Name <addr> » si le nom contient
// des caractères non-ASCII (RFC 2047).
func encodeAddressHeader(addr string) string {
	if !strings.Contains(addr, "<") {
		// Simple adresse (ou adresse seule) : pas de nom d'affichage à encoder.
		return addr
	}
	open := strings.Index(addr, "<")
	name := strings.TrimSpace(addr[:open])
	email := addr[open:]
	if isASCII(name) {
		return addr
	}
	return encodeRFC2047(name) + " " + email
}

// encodeRFC2047 encode un sujet/nom UTF-8 en encoded-word Base64.
func encodeRFC2047(s string) string {
	if isASCII(s) {
		return s
	}
	return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?="
}

func isASCII(s string) bool {
	for _, r := range s {
		if r > 127 {
			return false
		}
	}
	return true
}

// ─────────────────────────────────────────────────────────────────────
// Resend (API HTTP — alternative cloud au SMTP self-hosté)
// ─────────────────────────────────────────────────────────────────────

type ResendProvider struct {
	apiKey string
	apiURL string
}

func NewResendProvider(apiKey string) *ResendProvider {
	return &ResendProvider{apiKey: apiKey, apiURL: "https://api.resend.com/emails"}
}

func (p *ResendProvider) Name() string { return "resend" }

func (p *ResendProvider) Send(ctx context.Context, msg EmailMessage) error {
	payload, err := json.Marshal(map[string]any{
		"from":    msg.From,
		"to":      []string{msg.To},
		"subject": msg.Subject,
		"html":    msg.HTML,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", p.apiURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("resend: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("resend: statut %d", resp.StatusCode)
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────
// Fabrique : switch de fournisseur via EMAIL_PROVIDER
// ─────────────────────────────────────────────────────────────────────

type EmailProviderConfig struct {
	// Provider : "smtp" | "resend" | "" (auto).
	Provider string
	SMTP     SMTPConfig
	// ResendAPIKey pour le fournisseur resend.
	ResendAPIKey string
}

// NewEmailProvider construit le fournisseur configuré (nil si aucun n'est
// prêt — le drain est alors désactivé proprement).
func NewEmailProvider(cfg EmailProviderConfig) EmailProvider {
	switch strings.ToLower(strings.TrimSpace(cfg.Provider)) {
	case "resend":
		if cfg.ResendAPIKey != "" {
			return NewResendProvider(cfg.ResendAPIKey)
		}
	case "smtp", "":
		if cfg.SMTP.Host != "" {
			return NewSMTPProvider(cfg.SMTP)
		}
	}
	return nil
}
