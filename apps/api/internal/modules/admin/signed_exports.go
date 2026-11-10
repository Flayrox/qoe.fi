package admin

// =====================================================================
// 📜 signed_exports.go — Exports signés Ed25519 multi-registres (Lot D3)
// =====================================================================
// Généralise les exports signés créés pour le consentement aux registres
// d'audit administratif (AdminAuditLog) et d'abonnés (Subscriber).
// Chaque export produit un document JSON scellé par signature Ed25519
// autonome : la clé publique est incluse, permettant à tout auditeur,
// autorité ou tiers de vérifier l'authenticité sans accès secret.
// =====================================================================

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/qoefi/api/internal/response"
)

const (
	signedExportAlgorithm = "Ed25519"
)

// adminExportSigner gère la paire de clés Ed25519 utilisée pour sceller les exports.
type adminExportSigner struct {
	priv   ed25519.PrivateKey
	keyID  string
	pubB64 string
}

var (
	adminSignerInstance *adminExportSigner
	adminSignerOnce     sync.Once
)

func getAdminExportSigner() *adminExportSigner {
	adminSignerOnce.Do(func() {
		encoded := strings.TrimSpace(os.Getenv("ADMIN_EXPORT_SIGNING_KEY"))
		if encoded != "" {
			seed, err := base64.StdEncoding.DecodeString(encoded)
			if err == nil && len(seed) == ed25519.SeedSize {
				priv := ed25519.NewKeyFromSeed(seed)
				pub := priv.Public().(ed25519.PublicKey)
				fp := sha256.Sum256(pub)
				adminSignerInstance = &adminExportSigner{
					priv:   priv,
					keyID:  "ed25519:" + hex.EncodeToString(fp[:8]),
					pubB64: base64.StdEncoding.EncodeToString(pub),
				}
				return
			}
			log.Printf("[admin] ADMIN_EXPORT_SIGNING_KEY invalide : bascule sur clé éphémère")
		}

		// En développement / test : génération d'une clé éphémère
		_, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			log.Printf("[admin] erreur lors de la génération de clé éphémère: %v", err)
			return
		}
		pub := priv.Public().(ed25519.PublicKey)
		fp := sha256.Sum256(pub)
		adminSignerInstance = &adminExportSigner{
			priv:   priv,
			keyID:  "ed25519:" + hex.EncodeToString(fp[:8]),
			pubB64: base64.StdEncoding.EncodeToString(pub),
		}
	})
	return adminSignerInstance
}

// SignedExportEnvelope est l'en-tête de scellement cryptographique d'un export.
type SignedExportEnvelope struct {
	ID               string         `json:"id"`
	Scope            string         `json:"scope"`
	Subject          string         `json:"subject,omitempty"`
	Reason           string         `json:"reason,omitempty"`
	Filters          map[string]any `json:"filters"`
	GeneratedAt      string         `json:"generatedAt"`
	RequestedBy      string         `json:"requestedBy"`
	RequestedByEmail string         `json:"requestedByEmail,omitempty"`
	Counts           map[string]int `json:"counts"`
	ContentSha256    string         `json:"contentSha256"`
	Canonical        string         `json:"canonical"`
	ChainSha256      string         `json:"chainSha256"`
	Algorithm        string         `json:"algorithm"`
	KeyID            string         `json:"keyId"`
	PublicKey        string         `json:"publicKey"`
	Signature        string         `json:"signature"`
	Verification     string         `json:"verification"`
}

// SignedExportDocument est l'enveloppe finale sérialisée prête à être servie.
type SignedExportDocument struct {
	Envelope SignedExportEnvelope `json:"envelope"`
	Payload  map[string]any       `json:"payload"`
}

// SignedExportVerificationResult est le verdict du contrôle d'un export signé.
type SignedExportVerificationResult struct {
	IsValid     bool   `json:"isValid"`
	Scope       string `json:"scope,omitempty"`
	Algorithm   string `json:"algorithm,omitempty"`
	KeyID       string `json:"keyId,omitempty"`
	GeneratedAt string `json:"generatedAt,omitempty"`
	Error       string `json:"error,omitempty"`
}

// ─── Export Signé : Journal d'Audit ──────────────────────────────────────────

type AuditExportInput struct {
	Subject    string `json:"subject,omitempty"`
	Reason     string `json:"reason,omitempty"`
	Actor      string `json:"actor,omitempty"`
	Capability string `json:"capability,omitempty"`
	Action     string `json:"action,omitempty"`
	Target     string `json:"target,omitempty"`
	Since      string `json:"since,omitempty"`
	Until      string `json:"until,omitempty"`
	Limit      int    `json:"limit,omitempty"`
}

func (s *Service) ExportSignedAudit(
	ctx context.Context,
	staffID string,
	in AuditExportInput,
) (*SignedExportDocument, []byte, error) {
	signer := getAdminExportSigner()
	if signer == nil {
		return nil, nil, errors.New("signataire d'export indisponible")
	}

	limit := in.Limit
	if limit <= 0 || limit > 5000 {
		limit = 1000
	}

	// 1. Récupération des entrées d'audit
	entries := make([]map[string]any, 0)
	if s.pool != nil {
		query := `
			SELECT
				a."id",
				a."actorId",
				COALESCE(u."email", 'Inconnu'),
				a."action",
				a."targetType",
				COALESCE(a."targetId", ''),
				a."metadata",
				a."createdAt"
			FROM "AdminAuditLog" a
			LEFT JOIN "User" u ON u."id" = a."actorId"
			WHERE 1=1
		`
		var args []any
		argIdx := 1

		if in.Action != "" {
			query += fmt.Sprintf(` AND a."action" = $%d`, argIdx)
			args = append(args, in.Action)
			argIdx++
		}
		if in.Target != "" {
			query += fmt.Sprintf(` AND a."targetId" = $%d`, argIdx)
			args = append(args, in.Target)
			argIdx++
		}
		if in.Since != "" {
			if t, err := time.Parse(time.RFC3339, in.Since); err == nil {
				query += fmt.Sprintf(` AND a."createdAt" >= $%d`, argIdx)
				args = append(args, t)
				argIdx++
			}
		}
		if in.Until != "" {
			if t, err := time.Parse(time.RFC3339, in.Until); err == nil {
				query += fmt.Sprintf(` AND a."createdAt" <= $%d`, argIdx)
				args = append(args, t)
				argIdx++
			}
		}

		query += fmt.Sprintf(` ORDER BY a."createdAt" DESC LIMIT $%d`, argIdx)
		args = append(args, limit)

		rows, err := s.pool.Query(ctx, query, args...)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var (
					id, actorID, actorEmail, action, targetType, targetID string
					metaJSON                                              []byte
					createdAt                                             time.Time
				)
				if err := rows.Scan(&id, &actorID, &actorEmail, &action, &targetType, &targetID, &metaJSON, &createdAt); err == nil {
					var meta map[string]any
					if len(metaJSON) > 0 {
						_ = json.Unmarshal(metaJSON, &meta)
					}
					entries = append(entries, map[string]any{
						"id":         id,
						"actorId":    actorID,
						"actorEmail": actorEmail,
						"action":     action,
						"targetType": targetType,
						"targetId":   targetID,
						"metadata":   meta,
						"createdAt":  createdAt.UTC().Format(time.RFC3339),
					})
				}
			}
		}
	}

	payload := map[string]any{
		"entries": entries,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, err
	}
	contentSum := sha256.Sum256(payloadBytes)
	contentSha := hex.EncodeToString(contentSum[:])

	now := time.Now().UTC()
	exportID := uuid.New().String()
	filters := map[string]any{
		"action": in.Action,
		"target": in.Target,
		"since":  in.Since,
		"until":  in.Until,
		"limit":  limit,
	}

	canonical := fmt.Sprintf(
		"scope:admin.audit|id:%s|generatedAt:%s|contentSha:%s|requestedBy:%s",
		exportID, now.Format(time.RFC3339), contentSha, staffID,
	)
	chainSum := sha256.Sum256([]byte(canonical))
	chainSha := hex.EncodeToString(chainSum[:])
	signature := hex.EncodeToString(ed25519.Sign(signer.priv, []byte(chainSha)))

	envelope := SignedExportEnvelope{
		ID:            exportID,
		Scope:         "admin.audit",
		Subject:       in.Subject,
		Reason:        in.Reason,
		Filters:       filters,
		GeneratedAt:   now.Format(time.RFC3339),
		RequestedBy:   staffID,
		Counts:        map[string]int{"entries": len(entries)},
		ContentSha256: contentSha,
		Canonical:     canonical,
		ChainSha256:   chainSha,
		Algorithm:     signedExportAlgorithm,
		KeyID:         signer.keyID,
		PublicKey:     signer.pubB64,
		Signature:     signature,
		Verification:  "Vérifier sha256(canonical) == chainSha256, puis Ed25519(publicKey, chainSha256, signature)",
	}

	doc := &SignedExportDocument{
		Envelope: envelope,
		Payload:  payload,
	}
	docBytes, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, nil, err
	}

	// Journalisation inconditionnelle de l'export signé
	if s.q != nil {
		s.logAudit(ctx, staffID, "audit.signed_export", "system", "audit_log", map[string]any{
			"exportId":   exportID,
			"entries":    len(entries),
			"chainSha":   chainSha,
			"contentSha": contentSha,
		})
	}

	return doc, docBytes, nil
}

// ─── Export Signé : Registre des Abonnés ──────────────────────────────────────

type SubscriberExportInput struct {
	Subject       string `json:"subject,omitempty"`
	Reason        string `json:"reason,omitempty"`
	PublisherID string `json:"publisherId,omitempty"`
	Status        string `json:"status,omitempty"`
	Limit         int    `json:"limit,omitempty"`
}

func (s *Service) ExportSignedSubscribers(
	ctx context.Context,
	staffID string,
	in SubscriberExportInput,
) (*SignedExportDocument, []byte, error) {
	signer := getAdminExportSigner()
	if signer == nil {
		return nil, nil, errors.New("signataire d'export indisponible")
	}

	limit := in.Limit
	if limit <= 0 || limit > 10000 {
		limit = 2000
	}

	subscribers := make([]map[string]any, 0)
	countConfirmed := 0
	countActive := 0

	if s.pool != nil {
		query := `
			SELECT
				s."id",
				s."email",
				s."status",
				s."isActive",
				s."isPremium",
				s."receiveArticles",
				s."confirmedAt",
				s."createdAt",
				s."publisherId"
			FROM "Subscriber" s
			WHERE 1=1
		`
		var args []any
		argIdx := 1

		if in.PublisherID != "" {
			query += fmt.Sprintf(` AND s."publisherId" = $%d`, argIdx)
			args = append(args, in.PublisherID)
			argIdx++
		}
		if in.Status != "" {
			query += fmt.Sprintf(` AND s."status"::text = $%d`, argIdx)
			args = append(args, in.Status)
			argIdx++
		}

		query += fmt.Sprintf(` ORDER BY s."createdAt" DESC LIMIT $%d`, argIdx)
		args = append(args, limit)

		rows, err := s.pool.Query(ctx, query, args...)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var (
					id, email, status, pubID string
					isActive, isPremium, rec bool
					confirmedAt              *time.Time
					createdAt                time.Time
				)
				if err := rows.Scan(&id, &email, &status, &isActive, &isPremium, &rec, &confirmedAt, &createdAt, &pubID); err == nil {
					var confStr *string
					if confirmedAt != nil {
						formatted := confirmedAt.UTC().Format(time.RFC3339)
						confStr = &formatted
						countConfirmed++
					}
					if isActive {
						countActive++
					}

					// Hachage de l'adresse email pour le registre d'intégrité
					emailSum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
					emailHash := hex.EncodeToString(emailSum[:])

					subscribers = append(subscribers, map[string]any{
						"id":              id,
						"email":           email,
						"emailHash":       emailHash,
						"status":          status,
						"isActive":        isActive,
						"isPremium":       isPremium,
						"receiveArticles": rec,
						"confirmedAt":     confStr,
						"createdAt":       createdAt.UTC().Format(time.RFC3339),
						"publisherId":   pubID,
					})
				}
			}
		}
	}

	payload := map[string]any{
		"subscribers": subscribers,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, err
	}
	contentSum := sha256.Sum256(payloadBytes)
	contentSha := hex.EncodeToString(contentSum[:])

	now := time.Now().UTC()
	exportID := uuid.New().String()
	filters := map[string]any{
		"publisherId": in.PublisherID,
		"status":        in.Status,
		"limit":         limit,
	}

	canonical := fmt.Sprintf(
		"scope:subscribers|id:%s|generatedAt:%s|contentSha:%s|requestedBy:%s",
		exportID, now.Format(time.RFC3339), contentSha, staffID,
	)
	chainSum := sha256.Sum256([]byte(canonical))
	chainSha := hex.EncodeToString(chainSum[:])
	signature := hex.EncodeToString(ed25519.Sign(signer.priv, []byte(chainSha)))

	envelope := SignedExportEnvelope{
		ID:          exportID,
		Scope:       "subscribers",
		Subject:     in.Subject,
		Reason:      in.Reason,
		Filters:     filters,
		GeneratedAt: now.Format(time.RFC3339),
		RequestedBy: staffID,
		Counts: map[string]int{
			"total":     len(subscribers),
			"active":    countActive,
			"confirmed": countConfirmed,
		},
		ContentSha256: contentSha,
		Canonical:     canonical,
		ChainSha256:   chainSha,
		Algorithm:     signedExportAlgorithm,
		KeyID:         signer.keyID,
		PublicKey:     signer.pubB64,
		Signature:     signature,
		Verification:  "Vérifier sha256(canonical) == chainSha256, puis Ed25519(publicKey, chainSha256, signature)",
	}

	doc := &SignedExportDocument{
		Envelope: envelope,
		Payload:  payload,
	}
	docBytes, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, nil, err
	}

	// Journalisation inconditionnelle
	if s.q != nil {
		s.logAudit(ctx, staffID, "subscribers.signed_export", "system", "subscribers", map[string]any{
			"exportId":   exportID,
			"total":      len(subscribers),
			"confirmed":  countConfirmed,
			"chainSha":   chainSha,
			"contentSha": contentSha,
		})
	}

	return doc, docBytes, nil
}

// ─── Contrôle & Vérification Universelle d'Export Signé ─────────────────────

func (s *Service) VerifySignedExport(docBytes []byte) (*SignedExportVerificationResult, error) {
	var doc struct {
		Envelope SignedExportEnvelope `json:"envelope"`
		Payload  map[string]any       `json:"payload"`
	}
	if err := json.Unmarshal(docBytes, &doc); err != nil {
		return &SignedExportVerificationResult{
			IsValid: false,
			Error:   "Document JSON invalide ou structure d'export non reconnue",
		}, nil
	}

	env := doc.Envelope
	if env.Algorithm != signedExportAlgorithm {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   fmt.Sprintf("Algorithme non supporté : %s (attendu Ed25519)", env.Algorithm),
		}, nil
	}

	// 1. Contrôle du hash du contenu
	payloadBytes, err := json.Marshal(doc.Payload)
	if err != nil {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   "Impossible de sérialiser le contenu pour vérification",
		}, nil
	}
	payloadSum := sha256.Sum256(payloadBytes)
	computedContentSha := hex.EncodeToString(payloadSum[:])
	if computedContentSha != env.ContentSha256 {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   "L'empreinte du contenu ne correspond pas (contenu altéré)",
		}, nil
	}

	// 2. Contrôle du hash canonique
	canonicalSum := sha256.Sum256([]byte(env.Canonical))
	computedChainSha := hex.EncodeToString(canonicalSum[:])
	if computedChainSha != env.ChainSha256 {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   "L'empreinte canonique ne correspond pas (métadonnées altérées)",
		}, nil
	}

	// 3. Contrôle de la signature Ed25519
	pubBytes, err := base64.StdEncoding.DecodeString(env.PublicKey)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   "Clé publique Ed25519 invalide ou corrompue",
		}, nil
	}

	sigBytes, err := hex.DecodeString(env.Signature)
	if err != nil || len(sigBytes) != ed25519.SignatureSize {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   "Signature cryptographique hexadécimale invalide",
		}, nil
	}

	if !ed25519.Verify(pubBytes, []byte(env.ChainSha256), sigBytes) {
		return &SignedExportVerificationResult{
			IsValid: false,
			Scope:   env.Scope,
			Error:   "Signature Ed25519 invalide : le document a été altéré ou la clé ne correspond pas",
		}, nil
	}

	return &SignedExportVerificationResult{
		IsValid:     true,
		Scope:       env.Scope,
		Algorithm:   env.Algorithm,
		KeyID:       env.KeyID,
		GeneratedAt: env.GeneratedAt,
	}, nil
}

// ─── Handlers HTTP ────────────────────────────────────────────────────────────

func (h *Handler) exportSignedAudit(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in AuditExportInput
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&in)
	}

	doc, docBytes, err := h.svc.ExportSignedAudit(r.Context(), staffID, in)
	if err != nil {
		h.handleErr(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Qoe-Export-Hash", doc.Envelope.ChainSha256)
	w.Header().Set("X-Qoe-Content-Hash", doc.Envelope.ContentSha256)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="audit-signed-export-%d.json"`, time.Now().Unix()))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(docBytes)
}

func (h *Handler) exportSignedSubscribers(w http.ResponseWriter, r *http.Request) {
	staffID, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in SubscriberExportInput
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&in)
	}

	doc, docBytes, err := h.svc.ExportSignedSubscribers(r.Context(), staffID, in)
	if err != nil {
		h.handleErr(w, err)
		return
	}

	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Qoe-Export-Hash", doc.Envelope.ChainSha256)
	w.Header().Set("X-Qoe-Content-Hash", doc.Envelope.ContentSha256)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="subscribers-signed-export-%d.json"`, time.Now().Unix()))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(docBytes)
}

func (h *Handler) verifySignedExport(w http.ResponseWriter, r *http.Request) {
	_, ok := h.requireAuthenticated(w, r)
	if !ok {
		return
	}

	var in json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.BadRequest(w, "JSON invalide")
		return
	}

	res, err := h.svc.VerifySignedExport([]byte(in))
	if err != nil {
		h.handleErr(w, err)
		return
	}

	response.OK(w, res)
}
