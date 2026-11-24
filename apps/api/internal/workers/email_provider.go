package workers

// =====================================================================
// 📧 EmailProvider — contrat d'envoi d'emails du worker (SMTP ou Resend)
// =====================================================================
// Le worker draine la boîte d'envoi (NotificationDelivery, channel EMAIL)
// via un EmailProvider injecté (usuellement enveloppé dans comms.Gateway).
// Le fournisseur est choisi par EMAIL_PROVIDER :
//   - "smtp"   → relais SMTP (Stalwart local, Hostinger, SendGrid…), via go-mail
//   - "resend" → API Resend (RESEND_API_KEY)
// Aucune valeur sensible dans Git : tout passe par l'environnement du worker.

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/qoefi/api/internal/comms"
	gomail "github.com/wneessen/go-mail"
)

// EmailMessage est un alias sur comms.Message (type unifié Go).
type EmailMessage = comms.Message

// EmailProvider est un alias sur comms.Transport (implémenté par SMTPProvider,
// ResendProvider et comms.Gateway).
type EmailProvider = comms.Transport

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
	m, err := buildGoMailMessage(p.cfg, msg)
	if err != nil {
		return err
	}

	client, err := gomail.NewClient(p.cfg.Host, p.clientOptions()...)
	if err != nil {
		return fmt.Errorf("smtp: client %s: %w", smtpAddr(p.cfg), err)
	}

	if err := client.DialAndSendWithContext(ctx, m); err != nil {
		return fmt.Errorf("smtp: %s: %w", smtpAddr(p.cfg), err)
	}
	return nil
}

func (p *SMTPProvider) clientOptions() []gomail.Option {
	port := p.cfg.Port
	if port == 0 {
		if p.cfg.Secure {
			port = 465
		} else {
			port = 587
		}
	}

	opts := []gomail.Option{
		gomail.WithPort(port),
		gomail.WithTimeout(15 * time.Second),
	}

	if p.cfg.User != "" {
		opts = append(opts,
			gomail.WithSMTPAuth(gomail.SMTPAuthPlain),
			gomail.WithUsername(p.cfg.User),
			gomail.WithPassword(p.cfg.Pass),
		)
	}

	switch {
	case p.cfg.Secure:
		opts = append(opts, gomail.WithSSL(), gomail.WithTLSPolicy(gomail.TLSMandatory))
		if isLoopbackOrDockerHost(p.cfg.Host) {
			opts = append(opts, gomail.WithTLSConfig(&tls.Config{
				ServerName:         p.cfg.Host,
				InsecureSkipVerify: true,
			}))
		}
	case p.cfg.User == "" && !p.cfg.Secure:
		// Relais local sans AUTH (ex: pnpm mail:dev sur 127.0.0.1:1025) : aucun TLS requis.
		opts = append(opts, gomail.WithTLSPolicy(gomail.NoTLS))
	case isLoopbackOrDockerHost(p.cfg.Host):
		// Sur les liaisons locales/bridge docker, le certificat TLS du serveur mail
		// porte souvent le nom de domaine public (ex. mail.qoe.fi).
		opts = append(opts,
			gomail.WithTLSPolicy(gomail.TLSOpportunistic),
			gomail.WithTLSConfig(&tls.Config{
				ServerName:         p.cfg.Host,
				InsecureSkipVerify: true,
			}),
		)
	default:
		opts = append(opts, gomail.WithTLSPolicy(gomail.TLSMandatory))
	}

	return opts
}

func isLoopbackOrDockerHost(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	return h == "host.docker.internal" || h == "localhost" || h == "127.0.0.1"
}

func smtpAddr(cfg SMTPConfig) string {
	port := cfg.Port
	if port == 0 {
		if cfg.Secure {
			port = 465
		} else {
			port = 587
		}
	}
	return net.JoinHostPort(cfg.Host, fmt.Sprintf("%d", port))
}

func resolveSenderAddresses(cfg SMTPConfig, rawFrom string) (headerFrom, envelopeFrom string) {
	from := strings.TrimSpace(rawFrom)
	envelopeFrom = cleanEnvelopeAddress(from)
	if envelopeFrom != "" {
		return from, envelopeFrom
	}
	envelopeFrom = cleanEnvelopeAddress(cfg.From)
	if envelopeFrom == "" {
		envelopeFrom = cleanEnvelopeAddress(cfg.User)
	}
	if envelopeFrom == "" {
		envelopeFrom = "noreply@qoe.fi"
	}

	// Si msg.From était incomplet (ex: "Nom <>" ou juste "Nom"),
	// on reformate From avec l'adresse d'enveloppe résolue pour l'en-tête RFC 5322.
	display := SanitizeHeaderValue(from)
	if start := strings.LastIndex(display, "<"); start != -1 {
		display = strings.TrimSpace(display[:start])
	}
	if display != "" {
		return fmt.Sprintf("%s <%s>", display, envelopeFrom), envelopeFrom
	}
	return envelopeFrom, envelopeFrom
}

func cleanEnvelopeAddress(addr string) string {
	if parsed, err := mail.ParseAddress(addr); err == nil && parsed.Address != "" {
		return strings.TrimSpace(parsed.Address)
	}
	addr = strings.TrimSpace(addr)
	if start := strings.LastIndex(addr, "<"); start != -1 {
		if end := strings.LastIndex(addr, ">"); end > start {
			extracted := strings.TrimSpace(addr[start+1 : end])
			if strings.Contains(extracted, "@") {
				return extracted
			}
			return ""
		}
	}
	if strings.Contains(addr, "@") && !strings.ContainsAny(addr, "<> \t\r\n") {
		return addr
	}
	return ""
}

// SanitizeHeaderValue élimine les caractères \r, \n et les caractères de contrôle
// ASCII non imprimables pour prévenir toute attaque par injection d'en-têtes CRLF
// ou découpage d'en-tête SMTP (SMTP header splitting).
func SanitizeHeaderValue(val string) string {
	var b strings.Builder
	b.Grow(len(val))
	prevSpace := false
	for _, r := range val {
		if r == '\r' || r == '\n' || (r < 32 && r != '\t') || r == 127 {
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
			continue
		}
		if r == ' ' || r == '\t' {
			if !prevSpace {
				b.WriteRune(' ')
				prevSpace = true
			}
			continue
		}
		b.WriteRune(r)
		prevSpace = false
	}
	return strings.TrimSpace(b.String())
}

// buildGoMailMessage compose le message RFC 5322/MIME via github.com/wneessen/go-mail :
// replis RFC 2047 automatiques sur les longs en-têtes UTF-8 (R28) et multipart/alternative
// quoted-printable (lignes ≤ 76 caractères).
func buildGoMailMessage(cfg SMTPConfig, msg EmailMessage) (*gomail.Msg, error) {
	headerFrom, envelopeFrom := resolveSenderAddresses(cfg, msg.From)
	envelopeTo := cleanEnvelopeAddress(SanitizeHeaderValue(msg.To))
	if envelopeTo == "" {
		return nil, fmt.Errorf("smtp: destinataire invalide (%q)", msg.To)
	}

	m := gomail.NewMsg(gomail.WithNoDefaultUserAgent())
	m.SetCharset(gomail.CharsetUTF8)
	m.SetEncoding(gomail.EncodingQP)
	m.SetMessageIDWithValue(fmt.Sprintf("%s@qoe.fi", messageID()))
	m.SetDate()
	m.SetGenHeader("X-Mailer", "qoe-worker")

	if err := m.From(SanitizeHeaderValue(headerFrom)); err != nil {
		return nil, fmt.Errorf("smtp: expéditeur invalide (%q): %w", headerFrom, err)
	}
	if err := m.EnvelopeFrom(envelopeFrom); err != nil {
		return nil, fmt.Errorf("smtp: envelope-from invalide (%q): %w", envelopeFrom, err)
	}
	if err := m.To(SanitizeHeaderValue(msg.To)); err != nil {
		return nil, fmt.Errorf("smtp: destinataire invalide (%q): %w", msg.To, err)
	}

	m.Subject(SanitizeHeaderValue(msg.Subject))

	if strings.TrimSpace(msg.ReplyTo) != "" {
		if err := m.ReplyTo(SanitizeHeaderValue(msg.ReplyTo)); err != nil {
			return nil, fmt.Errorf("smtp: reply-to invalide (%q): %w", msg.ReplyTo, err)
		}
	}
	if strings.TrimSpace(msg.ListID) != "" {
		m.SetGenHeader("List-Id", SanitizeHeaderValue(msg.ListID))
	}
	if strings.TrimSpace(msg.RefID) != "" {
		m.SetGenHeader("X-Entity-Ref-ID", SanitizeHeaderValue(msg.RefID))
	}
	if strings.TrimSpace(msg.MessageType) != "" {
		m.SetGenHeader("X-Qoefi-Message-Type", SanitizeHeaderValue(msg.MessageType))
	}
	if strings.TrimSpace(msg.ListUnsubscribe) != "" {
		cleanUnsub := SanitizeHeaderValue(msg.ListUnsubscribe)
		m.SetListUnsubscribe(cleanUnsub)
		m.SetListUnsubscribePost()
	}
	if msg.IsBulk {
		m.SetBulk()
		m.SetGenHeader("Auto-Submitted", "auto-generated")
	}

	textBody := strings.ReplaceAll(msg.Text, "\r\n", "\n")
	htmlBody := strings.ReplaceAll(msg.HTML, "\r\n", "\n")
	switch {
	case strings.TrimSpace(textBody) != "" && strings.TrimSpace(htmlBody) != "":
		m.SetBodyString(gomail.TypeTextPlain, textBody)
		m.AddAlternativeString(gomail.TypeTextHTML, htmlBody)
	case strings.TrimSpace(textBody) != "":
		m.SetBodyString(gomail.TypeTextPlain, textBody)
	default:
		m.SetBodyString(gomail.TypeTextHTML, htmlBody)
	}

	return m, nil
}

// renderSMTPMessage sérialise le message RFC 5322 complet (utilisé dans les tests).
func renderSMTPMessage(from string, msg EmailMessage) (string, error) {
	if msg.From == "" {
		msg.From = from
	}
	m, err := buildGoMailMessage(SMTPConfig{From: from}, msg)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if _, err := m.WriteTo(&buf); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// messageID génère un identifiant unique pour l'en-tête Message-ID.
func messageID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
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
	payloadMap := map[string]any{
		"from":    msg.From,
		"to":      []string{msg.To},
		"subject": msg.Subject,
		"html":    msg.HTML,
	}
	if strings.TrimSpace(msg.Text) != "" {
		payloadMap["text"] = msg.Text
	}
	if strings.TrimSpace(msg.ReplyTo) != "" {
		payloadMap["reply_to"] = msg.ReplyTo
	}
	customHeaders := map[string]string{}
	if msg.ListID != "" {
		customHeaders["List-Id"] = msg.ListID
	}
	if msg.RefID != "" {
		customHeaders["X-Entity-Ref-ID"] = msg.RefID
	}
	if msg.MessageType != "" {
		customHeaders["X-Qoefi-Message-Type"] = msg.MessageType
	}
	if msg.ListUnsubscribe != "" {
		customHeaders["List-Unsubscribe"] = fmt.Sprintf("<%s>", msg.ListUnsubscribe)
		customHeaders["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
	}
	if len(customHeaders) > 0 {
		payloadMap["headers"] = customHeaders
	}
	payload, err := json.Marshal(payloadMap)
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
