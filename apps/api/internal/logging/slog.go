// Package logging fournit le logger structuré slog et la rédaction automatique des PII/secrets.
package logging

import (
	"context"
	"io"
	"log/slog"
	"os"
	"regexp"
	"strings"
)

type reqIDCtxKey struct{}

var (
	bearerRe  = regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9\-._~+/=]+`)
	qoeLiveRe = regexp.MustCompile(`\bqoe_live_[A-Za-z0-9\-_]+`)
	jwtRe     = regexp.MustCompile(`\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*`)
	emailRe   = regexp.MustCompile(`[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}`)
)

var sensitiveKeys = map[string]bool{
	"password":      true,
	"secret":        true,
	"token":         true,
	"authorization": true,
	"cookie":        true,
	"email":         true,
	"apikey":        true,
}

// WithRequestID attache l'identifiant de requête au contexte.
func WithRequestID(ctx context.Context, id string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, reqIDCtxKey{}, id)
}

// RequestIDFromContext extrait l'identifiant de requête du contexte.
func RequestIDFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	v, _ := ctx.Value(reqIDCtxKey{}).(string)
	return v
}

// RedactString masque les données sensibles (emails, tokens Bearer, clés qoe_live_, JWT).
func RedactString(s string) string {
	if s == "" {
		return ""
	}
	s = bearerRe.ReplaceAllString(s, "Bearer [REDACTED]")
	s = qoeLiveRe.ReplaceAllString(s, "qoe_live_[REDACTED]")
	s = jwtRe.ReplaceAllString(s, "[REDACTED]")
	s = emailRe.ReplaceAllStringFunc(s, maskEmail)
	return s
}

func maskEmail(email string) string {
	at := strings.IndexByte(email, '@')
	if at <= 0 {
		return "[REDACTED]"
	}
	return email[:1] + "***@" + email[at+1:]
}

// NewLogger construit un *slog.Logger avec rédaction automatique des clés sensibles et valeurs PII.
func NewLogger(w io.Writer, level slog.Level, jsonFormat bool) *slog.Logger {
	if w == nil {
		w = os.Stdout
	}
	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, a slog.Attr) slog.Attr {
			if sensitiveKeys[strings.ToLower(a.Key)] {
				return slog.String(a.Key, "[REDACTED]")
			}
			if a.Value.Kind() == slog.KindString {
				return slog.String(a.Key, RedactString(a.Value.String()))
			}
			if err, ok := a.Value.Any().(error); ok && err != nil {
				return slog.String(a.Key, RedactString(err.Error()))
			}
			return a
		},
	}
	var handler slog.Handler
	if jsonFormat {
		handler = slog.NewJSONHandler(w, opts)
	} else {
		handler = slog.NewTextHandler(w, opts)
	}
	return slog.New(handler)
}

// FromContext renvoie le logger par défaut enrichi du reqId s'il est présent dans ctx.
func FromContext(ctx context.Context) *slog.Logger {
	l := slog.Default()
	if reqID := RequestIDFromContext(ctx); reqID != "" {
		return l.With("reqId", reqID)
	}
	return l
}

// InitDefault configure le logger global slog selon LOG_LEVEL et LOG_FORMAT.
func InitDefault() {
	level := parseLevel(os.Getenv("LOG_LEVEL"))
	jsonFormat := strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT"))) != "text"
	slog.SetDefault(NewLogger(os.Stdout, level, jsonFormat))
}

func parseLevel(raw string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
