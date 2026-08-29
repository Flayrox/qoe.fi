// Package vectorfeed centralise la mise à jour comportementale du vecteur
// sémantique d'un utilisateur (EMA — Exponential Moving Average). C'est le
// cœur de la personnalisation « Pour vous » : chaque interaction (like,
// lecture complétée, post, bookmark, highlight…) rapproche le vecteur de
// l'utilisateur du vecteur du contenu consommé, sans jamais l'y fixer.
//
// Le package est partagé par feed (moteur), posts (likes/bookmarks/création),
// tracking (sessions de lecture, feedback négatif) et highlights, pour éviter
// un cycle d'import Go.
//
// Calibrage inspiré des grandes plateformes (Netflix, TikTok, YouTube) :
//  1. Explicite > implicite — un bookmark ou un surlignage est un signal
//     d'intention plus fort qu'un like, lui-même plus fort qu'un clic passif.
//  2. Complétion / dwell time — une lecture finie pèse plus qu'une lecture
//     partielle (Netflix optimise la complétion, TikTok le temps de lecture).
//  3. Récence — les interactions anciennes s'effacent : le vecteur dérive
//     vers le centroïde du corpus si l'utilisateur n'interagit plus
//     (demi-vie 60 jours), sinon les signaux d'il y a 6 mois pèseraient
//     autant que ceux d'aujourd'hui.
//  4. Négatif — masquer/bounce éloigne le vecteur du contenu rejeté.
package vectorfeed

import (
	"context"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// InteractionType identifie le type d'interaction (poids EMA associé).
type InteractionType string

const (
	InteractionHighlight    InteractionType = "HIGHLIGHT"
	InteractionBookmark     InteractionType = "BOOKMARK"
	InteractionShowMore     InteractionType = "SHOW_MORE"
	InteractionReadComplete InteractionType = "READ_COMPLETE"
	InteractionReadPartial  InteractionType = "READ_PARTIAL"
	InteractionLike         InteractionType = "LIKE"
	InteractionClick        InteractionType = "CLICK"
	InteractionCreatePost   InteractionType = "CREATE_POST"
)

// emaWeights — intensité du déplacement par interaction.
//
//	0.20 highlight      : l'engagement le plus profond (on surligne ce qu'on lit vraiment)
//	0.16 bookmark       : save-for-later = intention forte (Instagram/Save, Netflix playlist)
//	0.12 « voir plus »  : préférence positive explicite (montre-moi plus de ça)
//	0.12 lecture complète: complétion (proxy n°1 d'engagement chez Netflix/YouTube)
//	0.12 post créé      : l'utilisateur s'exprime sur le sujet (self-declared affinity)
//	0.08 like           : explicite mais bon marché (coût de clic quasi nul)
//	0.05 lecture partielle
//	0.03 clic           : passif, quasi bruit (signal faible volontairement)
var emaWeights = map[InteractionType]float64{
	InteractionHighlight:    0.20,
	InteractionBookmark:     0.16,
	InteractionShowMore:     0.12,
	InteractionReadComplete: 0.12,
	InteractionCreatePost:   0.12,
	InteractionLike:         0.08,
	InteractionReadPartial:  0.05,
	InteractionClick:        0.03,
}

// Alpha retourne le poids EMA de l'interaction (défaut 0.05).
func (t InteractionType) Alpha() float64 {
	if a, ok := emaWeights[t]; ok {
		return a
	}
	return 0.05
}

// Constantes de décroissance temporelle.
const (
	// decayHalfLifeDays : demi-vie de l'oubli du profil. Après 60 jours sans
	// interaction, la moitié du « biais » du vecteur a dérivé vers le
	// centroïde du corpus. (TikTok/Netflix pondèrent fortement la récence.)
	decayHalfLifeDays = 60.0
	// decayMinElapsedDays : en-deçà, pas de décroissance (évite le bruit sur
	// des sessions rapprochées).
	decayMinElapsedDays = 1.0
)

// ── Centroïde du corpus (prior) ────────────────────────────────────────────
// Le point d'ancrage de l'oubli : le contenu moyen publié sur la plateforme.
// Un utilisateur inactif dérive vers ce point plutôt que vers zéro (qui
// casserait la normalisation). Calculé une fois toutes les 10 min.

var (
	centroidMu   sync.Mutex
	centroidVec  []float32
	centroidAt   time.Time
	centroidTTL  = 10 * time.Minute
)

func corpusCentroid(ctx context.Context, pool *pgxpool.Pool) ([]float32, bool) {
	centroidMu.Lock()
	defer centroidMu.Unlock()
	if centroidVec != nil && time.Since(centroidAt) < centroidTTL {
		return centroidVec, true
	}
	var txt string
	err := pool.QueryRow(ctx, `SELECT COALESCE(AVG("embedding")::text,'') FROM "Article" WHERE "embedding" IS NOT NULL`).Scan(&txt)
	if err != nil || strings.TrimSpace(txt) == "" {
		return nil, false
	}
	v, ok := ParseLit(txt)
	if !ok {
		return nil, false
	}
	centroidVec = Normalize(v)
	centroidAt = time.Now()
	return centroidVec, true
}

// Normalize met le vecteur sur la sphère unité (cosinus). Une copie est
// retournée ; l'entrée n'est jamais modifiée.
func Normalize(v []float32) []float32 {
	var norm float64
	for _, x := range v {
		norm += float64(x) * float64(x)
	}
	norm = math.Sqrt(norm)
	if norm == 0 {
		return v
	}
	out := make([]float32, len(v))
	for i, x := range v {
		out[i] = float32(float64(x) / norm)
	}
	return out
}

// ParseLit décode un vecteur au format PostgreSQL text ('[1,2,3]').
func ParseLit(s string) ([]float32, bool) {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	if s == "" {
		return nil, false
	}
	parts := strings.Split(s, ",")
	out := make([]float32, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		f, err := strconv.ParseFloat(p, 32)
		if err != nil {
			return nil, false
		}
		out = append(out, float32(f))
	}
	if len(out) == 0 {
		return nil, false
	}
	return out, true
}

// Literal sérialise un vecteur au format texte PostgreSQL.
func Literal(v []float32) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, x := range v {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(float64(x), 'f', -1, 32))
	}
	b.WriteByte(']')
	return b.String()
}

// loadUserVector lit le vecteur courant + la date de dernière mise à jour.
// updatedAt sert d'horloge de récence : si l'utilisateur n'a pas interagi
// depuis longtemps, son vecteur dérive d'abord vers le centroïde (oubli).
func loadUserVector(ctx context.Context, pool *pgxpool.Pool, userID string) ([]float32, time.Time, bool) {
	var txt string
	var updatedAt time.Time
	err := pool.QueryRow(ctx, `SELECT COALESCE("embedding"::text,''), COALESCE("updatedAt", now()) FROM "User" WHERE id=$1::uuid`, userID).Scan(&txt, &updatedAt)
	if err != nil {
		return nil, time.Time{}, false
	}
	txt = strings.TrimSpace(txt)
	if txt == "" {
		return nil, time.Time{}, false
	}
	cur, ok := ParseLit(txt)
	if !ok {
		return nil, time.Time{}, false
	}
	return cur, updatedAt, true
}

// decayIfStale applique la dérive temporelle vers le centroïde du corpus :
// v' = (1-γ)·v + γ·centroid, avec γ = 1 - 0.5^(jours/60). No-op si le
// vecteur est récent ou si le centroïde est indisponible.
func decayIfStale(ctx context.Context, pool *pgxpool.Pool, cur []float32, updatedAt time.Time) []float32 {
	days := time.Since(updatedAt).Hours() / 24
	if days <= decayMinElapsedDays {
		return cur
	}
	prior, ok := corpusCentroid(ctx, pool)
	if !ok || len(prior) != len(cur) {
		return cur
	}
	gamma := 1 - math.Pow(0.5, days/decayHalfLifeDays)
	mixed := make([]float32, len(cur))
	for i, c := range cur {
		mixed[i] = float32((1-gamma)*float64(c) + gamma*float64(prior[i]))
	}
	return Normalize(mixed)
}

// ApplyInteraction déplace le vecteur de l'utilisateur vers target selon le
// poids EMA de l'interaction : new = (1-α)·old + α·target, normalisé L2.
// Si l'utilisateur n'a pas encore de vecteur, il prend celui de la cible.
// No-op silencieux si userID ou target vide (fire-and-forget, best-effort).
func ApplyInteraction(ctx context.Context, pool *pgxpool.Pool, userID string, target []float32, it InteractionType) error {
	if userID == "" || len(target) == 0 {
		return nil
	}
	alpha := it.Alpha()
	target = Normalize(target)

	cur, updatedAt, ok := loadUserVector(ctx, pool, userID)
	if !ok {
		_, err := pool.Exec(ctx, `UPDATE "User" SET embedding=$1::vector, "updatedAt"=now() WHERE id=$2::uuid`,
			Literal(target), userID)
		return err
	}
	if len(cur) != len(target) {
		return nil
	}
	// Décroissance temporelle : on oublie d'abord ce qui est vieux, puis on
	// applique l'interaction fraîche.
	cur = decayIfStale(ctx, pool, cur, updatedAt)
	updated := make([]float32, len(cur))
	for i, c := range cur {
		updated[i] = float32((1-alpha)*float64(c) + alpha*float64(target[i]))
	}
	updated = Normalize(updated)
	_, err := pool.Exec(ctx, `UPDATE "User" SET embedding=$1::vector, "updatedAt"=now() WHERE id=$2::uuid`,
		Literal(updated), userID)
	return err
}

// ApplyNegative éloigne le vecteur de l'utilisateur de target (feedback
// négatif : masquer un contenu, bounce). best-effort. strength est le taux
// d'éloignement (explicite « voir moins » ≈ 0.15, bounce implicite ≈ 0.06).
func ApplyNegative(ctx context.Context, pool *pgxpool.Pool, userID string, target []float32, strength float64) error {
	if strength == 0 {
		strength = 0.12
	}
	if userID == "" || len(target) == 0 {
		return nil
	}
	target = Normalize(target)
	cur, updatedAt, ok := loadUserVector(ctx, pool, userID)
	if !ok || len(cur) != len(target) {
		return nil
	}
	cur = decayIfStale(ctx, pool, cur, updatedAt)
	pushed := make([]float32, len(cur))
	for i, c := range cur {
		pushed[i] = float32(float64(c) + strength*(float64(c)-float64(target[i])))
	}
	pushed = Normalize(pushed)
	_, err := pool.Exec(ctx, `UPDATE "User" SET embedding=$1::vector, "updatedAt"=now() WHERE id=$2::uuid`,
		Literal(pushed), userID)
	return err
}
