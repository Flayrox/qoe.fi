// Middleware d'auto-réparation « ligne User absente » des routes reader.
//
// Contexte : une session Supabase peut porter un sub (JWT) sans ligne User en
// base (login de démo via le panneau dev, compte recréé dans Auth AVANT un
// reseed de la DB, backup restauré…). Les endpoints Go du reader qui lisent la
// ligne User (/v1/me*, /v1/me/billing, /data-export…) répondent alors 404
// « Utilisateur introuvable », ce qui faisait crasher les pages.
//
// POST /v1/me/sync (SyncUserFromAuth) sait recréer la ligne depuis les claims
// du JWT. Ce middleware centralise CETTE réparation pour TOUS les endpoints
// reader d'un coup : si le handler répond 404 alors que la requête porte un
// sub + claims, on recrée la ligne puis on rejoue le handler une fois. Plus
// besoin de corriger chaque endpoint (ou chaque appelant côté client).
package middleware

import (
	"bufio"
	"bytes"
	"context"
	"log"
	"net"
	"net/http"
)

// RepairUserFunc recrée (ou met à jour) la ligne User depuis les claims du JWT
// — la logique exacte de POST /v1/me/sync. Retourne true si la ligne a été
// CRÉÉE (réparation effective) ; false si elle existait déjà (404 pour autre
// raison → ne pas rejouer le handler).
type RepairUserFunc func(ctx context.Context, userID string, claims map[string]any) (created bool, err error)

// AutoRepairReaderUser applique l'auto-réparation de la ligne User à tout
// endpoint reader qui répondrait 404 « Utilisateur introuvable ». Uniquement
// déclenché quand (1) la requête est authentifiée (sub + claims présents) et
// (2) la réparation a réellement créé la ligne — le handler est alors rejoué
// une fois. Sinon la réponse originale est passée telle quelle.
func AutoRepairReaderUser(repair RepairUserFunc) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := UserID(r.Context())
			claims := Claims(r.Context())
			if !ok || userID == "" || claims == nil {
				next.ServeHTTP(w, r)
				return
			}

			rec := newRepairRecorder(w)
			next.ServeHTTP(rec, r)

			if rec.status != http.StatusNotFound {
				rec.flush(w)
				return
			}

			created, err := repair(r.Context(), userID, claims)
			if err != nil || !created {
				rec.flush(w)
				return
			}

			log.Printf("[auto-repair] User %s recréé depuis les claims JWT (%s)", userID, r.URL.Path)
			rec2 := newRepairRecorder(w)
			next.ServeHTTP(rec2, r)
			rec2.flush(w)
		})
	}
}

// repairRecorder capture la réponse d'un handler sans l'écrire sur le réseau :
// on ne décide qu'à la fin (flush) si on renvoie la réponse d'origine ou une
// réponse rejouée après réparation. Implémente les interfaces optionnelles
// (Flusher/Hijacker/Pusher) pour rester transparent pour les middlewares chi.
type repairRecorder struct {
	real   http.ResponseWriter
	status int
	header http.Header
	body   bytes.Buffer
}

func newRepairRecorder(real http.ResponseWriter) *repairRecorder {
	return &repairRecorder{real: real, status: http.StatusOK, header: make(http.Header)}
}

func (r *repairRecorder) Header() http.Header         { return r.header }
func (r *repairRecorder) WriteHeader(code int)        { r.status = code }
func (r *repairRecorder) Write(b []byte) (int, error) { return r.body.Write(b) }
func (r *repairRecorder) Flush()                      {}

func (r *repairRecorder) flush(w http.ResponseWriter) {
	dh := w.Header()
	for k, vv := range r.header {
		for _, v := range vv {
			dh.Add(k, v)
		}
	}
	w.WriteHeader(r.status)
	_, _ = w.Write(r.body.Bytes())
}

func (r *repairRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := r.real.(http.Hijacker)
	if !ok {
		return nil, nil, http.ErrNotSupported
	}
	return h.Hijack()
}

func (r *repairRecorder) Push(target string, opts *http.PushOptions) error {
	p, ok := r.real.(http.Pusher)
	if !ok {
		return http.ErrNotSupported
	}
	return p.Push(target, opts)
}
