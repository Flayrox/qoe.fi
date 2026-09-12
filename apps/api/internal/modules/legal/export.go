package legal

// =====================================================================
// 🧾 Export signé du registre des consentements
// =====================================================================
// Une demande de contrôle, une réquisition ou une mise en demeure demandent la
// même chose : « prouvez qui a accepté quoi, quand, et que la pièce n'a pas été
// retouchée ». Un export CSV sorti d'une console ne prouve rien — n'importe qui
// peut le réécrire.
//
// On produit donc un document qui se défend tout seul :
//
//   - **signé** — chaque export est signé en Ed25519. La vérification ne
//     demande que la clé PUBLIQUE, embarquée dans l'enveloppe : un tiers, une
//     autorité ou un auditeur peuvent contrôler la signature sans nous faire
//     confiance et sans détenir de secret. Une signature HMAC aurait été
//     invérifiable par le destinataire, donc inutile ici.
//   - **chaîné** — chaque export porte l'empreinte du précédent. Retirer une
//     pièce du registre casse la chaîne, et la rupture est détectable sans
//     avoir conservé les anciens fichiers.
//   - **horodaté** — la date de génération fait partie du message signé, donc
//     une date ne peut pas être réécrite après coup.
//   - **auto-descriptif** — le message exact qui a été signé est inclus tel
//     quel (`canonical`) : aucune ambiguïté de canonicalisation JSON à
//     reproduire de mémoire.
//
// Le contenu exporté est le périmètre brut : les versions de documents (corps
// inclus, avec leur empreinte SHA-256), les preuves d'acceptation et le journal
// des choix de traceurs. C'est ce qui permet de reconstituer une suite de
// décisions pour une personne, y compris celles prises sans compte.
// =====================================================================

import (
	"bytes"
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
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

const (
	exportAlgorithm   = "Ed25519"
	exportCanonicalV1 = "qoe.legal-consent-export/v1"
	exportDefaultRows = int32(5000)
	exportMaxRows     = int32(50000)
)

// ─── Signataire ──────────────────────────────────────────────────────

// exportSigner porte la paire de clés des exports. La clé PUBLIQUE voyage dans
// chaque enveloppe : c'est ce qui rend la signature vérifiable par un tiers.
type exportSigner struct {
	priv   ed25519.PrivateKey
	keyID  string
	pubB64 string
}

func newExportSigner(priv ed25519.PrivateKey) *exportSigner {
	pub := priv.Public().(ed25519.PublicKey)
	fingerprint := sha256.Sum256(pub)
	return &exportSigner{
		priv:   priv,
		keyID:  "ed25519:" + hex.EncodeToString(fingerprint[:8]),
		pubB64: base64.StdEncoding.EncodeToString(pub),
	}
}

// SetExportSigningKey charge la graine Ed25519 (base64, 32 octets) utilisée
// pour signer les exports. Absente ou illisible → les exports signés sont
// désactivés : mieux vaut une erreur explicite qu'une signature qui n'en est
// pas une.
func (s *Service) SetExportSigningKey(encoded string) {
	trimmed := strings.TrimSpace(encoded)
	if trimmed == "" {
		s.exportSigner = nil
		return
	}
	seed, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil || len(seed) != ed25519.SeedSize {
		log.Printf("[legal] LEGAL_EXPORT_SIGNING_KEY illisible (attendu : base64 d'une graine Ed25519 de 32 octets) — export signé désactivé")
		s.exportSigner = nil
		return
	}
	s.exportSigner = newExportSigner(ed25519.NewKeyFromSeed(seed))
}

// signer retourne le signataire configuré. En développement seulement, une clé
// éphémère est générée : les exports restent signés, mais la clé change à
// chaque redémarrage — donc une pièce produite avant redémarrage n'est plus
// vérifiable. Les journaux le disent explicitement.
func (s *Service) signer() *exportSigner {
	if s.exportSigner != nil {
		return s.exportSigner
	}
	s.exportSignerOnce.Do(func() {
		_, priv, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			log.Printf("[legal] génération de clé d'export impossible: %v", err)
			return
		}
		log.Printf("[legal] ⚠️ LEGAL_EXPORT_SIGNING_KEY absente : clé d'export ÉPHÉMÈRE générée (développement uniquement — les exports ne survivront pas au redémarrage)")
		s.exportSigner = newExportSigner(priv)
	})
	return s.exportSigner
}

// ─── Entrée / sortie ─────────────────────────────────────────────────

// ExportFilters décrit le périmètre exact d'un export. Il est rejoué tel quel
// pour vérifier a posteriori qu'un export correspond bien à ce périmètre.
type ExportFilters struct {
	Slug                 string `json:"slug,omitempty"`
	UserID               string `json:"userId,omitempty"`
	ConsentID            string `json:"consentId,omitempty"`
	From                 string `json:"from,omitempty"`
	To                   string `json:"to,omitempty"`
	MaxRows              int32  `json:"maxRows"`
	IncludeCookieJournal bool   `json:"includeCookieJournal"`
}

// ConsentExportInput est la demande d'export formulée par un superadmin.
type ConsentExportInput struct {
	Subject string        `json:"subject"`
	Reason  string        `json:"reason"`
	Filters ExportFilters `json:"filters"`
}

// ConsentExportCounts résume ce que contient la pièce.
type ConsentExportCounts struct {
	Documents     int `json:"documents"`
	Versions      int `json:"versions"`
	Acceptances   int `json:"acceptances"`
	CookieRecords int `json:"cookieRecords"`
	DistinctUsers int `json:"distinctUsers"`
}

// ConsentExportResult est le document prêt à être servi, sous forme d'octets.
//
// On renvoie des octets et non une structure : l'empreinte du contenu est
// calculée sur ces octets exacts. Laisser le framework re-sérialiser ensuite
// (échappement HTML, ordre des clés) casserait la preuve.
type ConsentExportResult struct {
	Document []byte
	Record   *ConsentExportRecord
}

// ConsentExportRecord est la pièce telle qu'elle apparaît au registre.
type ConsentExportRecord struct {
	ID                 string        `json:"id"`
	Seq                int64         `json:"seq"`
	Scope              string        `json:"scope"`
	Subject            *string       `json:"subject,omitempty"`
	Reason             *string       `json:"reason,omitempty"`
	Filters            ExportFilters `json:"filters"`
	GeneratedAt        *time.Time    `json:"generatedAt,omitempty"`
	RequestedBy        *string       `json:"requestedBy,omitempty"`
	RequestedByEmail   *string       `json:"requestedByEmail,omitempty"`
	DocumentsCount     int32         `json:"documentsCount"`
	AcceptancesCount   int32         `json:"acceptancesCount"`
	CookieRecordsCount int32         `json:"cookieRecordsCount"`
	ContentSha256      string        `json:"contentSha256"`
	PreviousChain      *string       `json:"previousChain,omitempty"`
	ChainSha256        string        `json:"chainSha256"`
	Signature          string        `json:"signature"`
	KeyID              string        `json:"keyId"`
	Algorithm          string        `json:"algorithm"`
}

// ─── Contenu exporté ─────────────────────────────────────────────────

type consentExportVersion struct {
	ID                 string `json:"id"`
	DocumentSlug       string `json:"documentSlug"`
	DocumentCategory   string `json:"documentCategory"`
	Audience           string `json:"audience"`
	RequiresAcceptance bool   `json:"requiresAcceptance"`
	Locale             string `json:"locale"`
	Version            string `json:"version"`
	Title              string `json:"title"`
	Summary            string `json:"summary"`
	Body               string `json:"body"`
	Status             string `json:"status"`
	Changelog          string `json:"changelog,omitempty"`
	EffectiveAt        string `json:"effectiveAt,omitempty"`
	PublishedAt        string `json:"publishedAt,omitempty"`
	ArchivedAt         string `json:"archivedAt,omitempty"`
	ScheduledAt        string `json:"scheduledAt,omitempty"`
	CreatedAt          string `json:"createdAt,omitempty"`
	BodySha256         string `json:"bodySha256"`
	BodyLength         int    `json:"bodyLength"`
}

type consentExportAcceptance struct {
	ID           string `json:"id"`
	UserID       string `json:"userId,omitempty"`
	UserEmail    string `json:"userEmail,omitempty"`
	DocumentSlug string `json:"documentSlug"`
	VersionID    string `json:"versionId"`
	Version      string `json:"version"`
	Locale       string `json:"locale"`
	AcceptedAt   string `json:"acceptedAt"`
	Source       string `json:"source"`
	Method       string `json:"method"`
	IP           string `json:"ip,omitempty"`
	UserAgent    string `json:"userAgent,omitempty"`
}

type consentExportCookieRecord struct {
	ID            string          `json:"id"`
	Seq           int64           `json:"seq"`
	ConsentID     string          `json:"consentId,omitempty"`
	UserID        string          `json:"userId,omitempty"`
	Locale        string          `json:"locale"`
	PolicyVersion string          `json:"policyVersion"`
	Categories    map[string]bool `json:"categories"`
	Source        string          `json:"source"`
	Country       string          `json:"country,omitempty"`
	IP            string          `json:"ip,omitempty"`
	UserAgent     string          `json:"userAgent,omitempty"`
	CreatedAt     string          `json:"createdAt"`
}

type consentExportPayload struct {
	Versions      []consentExportVersion      `json:"versions"`
	Acceptances   []consentExportAcceptance   `json:"acceptances"`
	CookieConsent []consentExportCookieRecord `json:"cookieConsent"`
}

type consentExportEnvelope struct {
	ID                   string              `json:"id"`
	Seq                  int64               `json:"seq"`
	Scope                string              `json:"scope"`
	Subject              string              `json:"subject,omitempty"`
	Reason               string              `json:"reason,omitempty"`
	Filters              ExportFilters       `json:"filters"`
	GeneratedAt          string              `json:"generatedAt"`
	RequestedBy          string              `json:"requestedBy,omitempty"`
	RequestedByEmail     string              `json:"requestedByEmail,omitempty"`
	Counts               ConsentExportCounts `json:"counts"`
	ContainsPersonalData bool                `json:"containsPersonalData"`
	ContentSha256        string              `json:"contentSha256"`
	PreviousChain        string              `json:"previousChain,omitempty"`
	Canonical            string              `json:"canonical"`
	ChainSha256          string              `json:"chainSha256"`
	Algorithm            string              `json:"algorithm"`
	KeyID                string              `json:"keyId"`
	PublicKey            string              `json:"publicKey"`
	Signature            string              `json:"signature"`
	Verification         string              `json:"verification"`
}

// ─── Production ──────────────────────────────────────────────────────

// ExportConsentRegister produit, signe et archive un export du registre.
func (s *Service) ExportConsentRegister(ctx context.Context, actor string, in ConsentExportInput) (*ConsentExportResult, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	signer := s.signer()
	if signer == nil {
		return nil, fmt.Errorf("%w: clé de signature indisponible", errInvalid)
	}

	filters := normalizeExportFilters(in.Filters)
	from, to := parseExportTime(filters.From), parseExportTime(filters.To)

	versionRows, err := s.q.ListLegalVersionsForExport(ctx, optText(filters.Slug))
	if err != nil {
		return nil, err
	}
	acceptanceRows, err := s.q.ListLegalAcceptancesForExport(ctx, db.ListLegalAcceptancesForExportParams{
		Slug:       optText(filters.Slug),
		UserID:     toUUID(filters.UserID),
		FromAt:     from,
		ToAt:       to,
		LimitCount: filters.MaxRows,
	})
	if err != nil {
		return nil, err
	}

	var cookieRows []db.CookieConsentRecord
	if filters.IncludeCookieJournal {
		cookieRows, err = s.q.ListCookieConsentForExport(ctx, db.ListCookieConsentForExportParams{
			ConsentID:  optText(filters.ConsentID),
			FromAt:     from,
			ToAt:       to,
			LimitCount: filters.MaxRows,
		})
		if err != nil {
			return nil, err
		}
	}

	payload := buildExportPayload(versionRows, acceptanceRows, cookieRows)
	payloadBytes, err := canonicalJSONBytes(payload)
	if err != nil {
		return nil, err
	}
	contentSum := sha256.Sum256(payloadBytes)
	contentSha := hex.EncodeToString(contentSum[:])

	counts, _ := exportCounts(versionRows, acceptanceRows, cookieRows)
	scope := exportScope(filters)
	subject := sanitizeCanonicalLine(in.Subject)
	reason := sanitizeCanonicalLine(in.Reason)
	requestedByEmail := s.actorEmail(ctx, actor)

	generatedAt := time.Now().UTC().Truncate(time.Millisecond)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := s.q.WithTx(tx)

	// Le maillon précédent se lit AVANT l'insertion : une fois notre ligne
	// écrite, c'est elle que « le dernier export » désignerait.
	previousChain := ""
	if head, err := q.GetLatestLegalConsentExport(ctx); err == nil {
		previousChain = head.ChainSha256
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	inserted, err := q.InsertLegalConsentExport(ctx, db.InsertLegalConsentExportParams{
		Scope:              scope,
		Subject:            optText(subject),
		Reason:             optText(reason),
		Filters:            mustJSON(filters),
		RequestedBy:        toUUID(actor),
		RequestedByEmail:   optText(requestedByEmail),
		DocumentsCount:     int32(counts.Documents),
		AcceptancesCount:   int32(counts.Acceptances),
		CookieRecordsCount: int32(counts.CookieRecords),
		// Ces trois champs sont scellés juste après, dans la même transaction.
		ContentSha256: contentSha,
		ChainSha256:   "",
		Signature:     "",
		KeyID:         signer.keyID,
		Algorithm:     exportAlgorithm,
	})
	if err != nil {
		return nil, err
	}

	// Le rang et l'horodatage ne sont connus qu'après insertion : c'est
	// précisément pour ça que le scellement est un second temps — mais dans la
	// même transaction, donc jamais observé à moitié fait.
	if at := tsTime(inserted.GeneratedAt); at != nil {
		generatedAt = at.UTC().Truncate(time.Millisecond)
	}

	canonical := buildExportCanonical(
		inserted.ID, inserted.Seq, scope, generatedAt, contentSha,
		previousChain, counts, filters, subject, reason, actor,
	)
	chainSum := sha256.Sum256([]byte(canonical))
	chainSha := hex.EncodeToString(chainSum[:])
	signature := hex.EncodeToString(ed25519.Sign(signer.priv, []byte(chainSha)))

	sealed, err := q.SetLegalConsentExportSignature(ctx, db.SetLegalConsentExportSignatureParams{
		ID:            inserted.ID,
		ContentSha256: contentSha,
		PreviousChain: optText(previousChain),
		ChainSha256:   chainSha,
		Signature:     signature,
		KeyID:         signer.keyID,
		Algorithm:     exportAlgorithm,
	})
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	envelope := consentExportEnvelope{
		ID: inserted.ID, Seq: inserted.Seq, Scope: scope,
		Subject: subject, Reason: reason, Filters: filters,
		GeneratedAt: exportTimestamp(generatedAt), RequestedBy: actor,
		RequestedByEmail: requestedByEmail,
		Counts:           counts, ContainsPersonalData: true,
		ContentSha256: contentSha, PreviousChain: previousChain,
		Canonical: canonical, ChainSha256: chainSha,
		Algorithm: exportAlgorithm, KeyID: signer.keyID, PublicKey: signer.pubB64,
		Signature: signature,
		Verification: "Vérifier que sha256(envelope.canonical) == envelope.chainSha256, " +
			"puis que la signature Ed25519 (envelope.signature, hex) est valide pour ce " +
			"chainSha256 avec envelope.publicKey (base64), et enfin que envelope.previousChain " +
			"est égal au chainSha256 de l'export de rang seq-1.",
	}
	envelopeBytes, err := canonicalJSONBytes(envelope)
	if err != nil {
		return nil, err
	}

	document := make([]byte, 0, len(envelopeBytes)+len(payloadBytes)+32)
	document = append(document, `{"envelope":`...)
	document = append(document, envelopeBytes...)
	document = append(document, `,"payload":`...)
	document = append(document, payloadBytes...)
	document = append(document, '}')

	s.audit(ctx, actor, "legal.consent.export", sealed.ID, map[string]any{
		"scope": scope, "seq": sealed.Seq, "documents": counts.Documents,
		"acceptances": counts.Acceptances, "cookieRecords": counts.CookieRecords,
		"contentSha256": contentSha, "keyId": signer.keyID,
	})

	return &ConsentExportResult{
		Document: document,
		Record:   exportRecordFromRow(sealed),
	}, nil
}

// ListConsentExports renvoie le registre des exports produits (les maillons).
func (s *Service) ListConsentExports(ctx context.Context, actor string, limit int32) ([]ConsentExportRecord, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	rows, err := s.q.ListLegalConsentExports(ctx, limit)
	if err != nil {
		return nil, err
	}
	out := make([]ConsentExportRecord, 0, len(rows))
	for _, r := range rows {
		out = append(out, *exportRecordFromRow(r))
	}
	return out, nil
}

// ─── Vérification de la chaîne ───────────────────────────────────────

// ExportChainBreak décrit un maillon rompu.
type ExportChainBreak struct {
	ExportID string `json:"exportId"`
	Seq      int64  `json:"seq"`
	Reason   string `json:"reason"`
}

// ConsentExportVerification est le verdict d'un contrôle de chaîne.
type ConsentExportVerification struct {
	Total     int                `json:"total"`
	Valid     int                `json:"valid"`
	Broken    []ExportChainBreak `json:"broken"`
	HeadChain string             `json:"headChain,omitempty"`
	KeyID     string             `json:"keyId,omitempty"`
	CheckedAt time.Time          `json:"checkedAt"`
}

// VerifyConsentExports recompte toute la chaîne : c'est le contrôle qu'un
// auditeur ferait sur place, exécuté pour lui.
func (s *Service) VerifyConsentExports(ctx context.Context, actor string) (*ConsentExportVerification, error) {
	if err := s.checkSuperadmin(ctx, actor); err != nil {
		return nil, err
	}
	rows, err := s.q.ListLegalConsentExportsForVerify(ctx)
	if err != nil {
		return nil, err
	}
	signer := s.signer()
	verdict := &ConsentExportVerification{
		Total: len(rows), Broken: make([]ExportChainBreak, 0), CheckedAt: time.Now().UTC(),
	}
	if signer != nil {
		verdict.KeyID = signer.keyID
	}

	expectedPrevious := ""
	for _, row := range rows {
		if row.PreviousChain.String != expectedPrevious {
			verdict.Broken = append(verdict.Broken, ExportChainBreak{
				ExportID: row.ID, Seq: row.Seq,
				Reason: "maillon précédent incohérent : une pièce a été retirée ou réécrite",
			})
			expectedPrevious = row.ChainSha256
			continue
		}
		filters := decodeExportFilters(row.Filters)
		generated := time.Time{}
		if at := tsTime(row.GeneratedAt); at != nil {
			generated = at.UTC().Truncate(time.Millisecond)
		}
		canonical := buildExportCanonical(
			row.ID, row.Seq, row.Scope, generated, row.ContentSha256,
			row.PreviousChain.String, ConsentExportCounts{
				Documents: int(row.DocumentsCount), Acceptances: int(row.AcceptancesCount),
				CookieRecords: int(row.CookieRecordsCount),
			}, filters, row.Subject.String, row.Reason.String, uuidStr(row.RequestedBy),
		)
		chainSum := sha256.Sum256([]byte(canonical))
		chainSha := hex.EncodeToString(chainSum[:])
		if chainSha != row.ChainSha256 {
			verdict.Broken = append(verdict.Broken, ExportChainBreak{
				ExportID: row.ID, Seq: row.Seq,
				Reason: "l'empreinte de la pièce ne correspond pas à son contenu signé (données modifiées en base)",
			})
			expectedPrevious = row.ChainSha256
			continue
		}
		if signer != nil {
			sig, err := hex.DecodeString(row.Signature)
			if err != nil || !ed25519.Verify(signer.priv.Public().(ed25519.PublicKey), []byte(chainSha), sig) {
				verdict.Broken = append(verdict.Broken, ExportChainBreak{
					ExportID: row.ID, Seq: row.Seq,
					Reason: "signature Ed25519 invalide pour cette clé",
				})
				expectedPrevious = row.ChainSha256
				continue
			}
		}
		verdict.Valid++
		expectedPrevious = row.ChainSha256
	}
	verdict.HeadChain = expectedPrevious
	return verdict, nil
}

// ─── Fabrique de contenu ─────────────────────────────────────────────

func buildExportPayload(
	versions []db.ListLegalVersionsForExportRow,
	acceptances []db.ListLegalAcceptancesForExportRow,
	cookies []db.CookieConsentRecord,
) consentExportPayload {
	payload := consentExportPayload{
		Versions:      make([]consentExportVersion, 0, len(versions)),
		Acceptances:   make([]consentExportAcceptance, 0, len(acceptances)),
		CookieConsent: make([]consentExportCookieRecord, 0, len(cookies)),
	}
	for _, v := range versions {
		payload.Versions = append(payload.Versions, consentExportVersion{
			ID: v.ID, DocumentSlug: v.DocumentSlug, DocumentCategory: v.DocumentCategory,
			Audience: v.Audience, RequiresAcceptance: v.RequiresAcceptance,
			Locale: v.Locale, Version: v.Version, Title: v.Title, Summary: v.Summary,
			Body: v.Body, Status: v.Status, Changelog: v.Changelog.String,
			EffectiveAt: rfc3339(v.EffectiveAt), PublishedAt: rfc3339(v.PublishedAt),
			ArchivedAt: rfc3339(v.ArchivedAt), ScheduledAt: rfc3339(v.ScheduledAt),
			CreatedAt:  rfc3339(v.CreatedAt),
			BodySha256: v.BodySha256, BodyLength: int(v.BodyLength),
		})
	}
	for _, a := range acceptances {
		payload.Acceptances = append(payload.Acceptances, consentExportAcceptance{
			ID: a.ID, UserID: uuidStr(a.UserID), UserEmail: a.UserEmail,
			DocumentSlug: a.DocumentSlug, VersionID: a.VersionID, Version: a.Version,
			Locale: a.Locale, AcceptedAt: rfc3339(a.AcceptedAt), Source: a.Source,
			Method: a.Method, IP: a.Ip.String, UserAgent: a.UserAgent.String,
		})
	}
	for _, c := range cookies {
		categories := map[string]bool{}
		if len(c.Categories) > 0 {
			_ = json.Unmarshal(c.Categories, &categories)
		}
		payload.CookieConsent = append(payload.CookieConsent, consentExportCookieRecord{
			ID: c.ID, Seq: c.Seq, ConsentID: c.ConsentID.String, UserID: uuidStr(c.UserID),
			Locale: c.Locale, PolicyVersion: c.PolicyVersion, Categories: categories,
			Source: c.Source, Country: c.Country.String, IP: c.Ip.String,
			UserAgent: c.UserAgent.String, CreatedAt: rfc3339(c.CreatedAt),
		})
	}
	return payload
}

func exportCounts(
	versions []db.ListLegalVersionsForExportRow,
	acceptances []db.ListLegalAcceptancesForExportRow,
	cookies []db.CookieConsentRecord,
) (ConsentExportCounts, int) {
	documents := map[string]bool{}
	users := map[string]bool{}
	for _, v := range versions {
		documents[v.DocumentSlug] = true
	}
	for _, a := range acceptances {
		if id := uuidStr(a.UserID); id != "" {
			users[id] = true
		}
	}
	for _, c := range cookies {
		if id := uuidStr(c.UserID); id != "" {
			users[id] = true
		}
	}
	return ConsentExportCounts{
		Documents:     len(documents),
		Versions:      len(versions),
		Acceptances:   len(acceptances),
		CookieRecords: len(cookies),
		DistinctUsers: len(users),
	}, len(users)
}

// buildExportCanonical compose le message EXACT qui est signé. Il est inclus
// tel quel dans l'enveloppe : un vérificateur n'a pas à deviner une
// canonicalisation, il hache la chaîne qu'on lui donne.
func buildExportCanonical(
	id string,
	seq int64,
	scope string,
	generatedAt time.Time,
	contentSha, previousChain string,
	counts ConsentExportCounts,
	filters ExportFilters,
	subject, reason, requestedBy string,
) string {
	var b strings.Builder
	b.WriteString(exportCanonicalV1 + "\n")
	writeCanonicalLine(&b, "id", id)
	writeCanonicalLine(&b, "seq", strconv.FormatInt(seq, 10))
	writeCanonicalLine(&b, "scope", scope)
	// Exactement la même chaîne que celle publiée dans l'enveloppe : un
	// vérificateur n'a pas deux formats à réconcilier.
	writeCanonicalLine(&b, "generatedAt", exportTimestamp(generatedAt))
	writeCanonicalLine(&b, "contentSha256", contentSha)
	writeCanonicalLine(&b, "previousChain", dashIfEmpty(previousChain))
	// ⚠️ Ne figurer ici QUE des valeurs reconstructibles depuis la ligne
	// enregistrée : c'est ce qui permet à `VerifyConsentExports` de recalculer
	// le message signé des mois plus tard, sans avoir conservé la pièce.
	writeCanonicalLine(&b, "documents", strconv.Itoa(counts.Documents))
	writeCanonicalLine(&b, "acceptances", strconv.Itoa(counts.Acceptances))
	writeCanonicalLine(&b, "cookieRecords", strconv.Itoa(counts.CookieRecords))
	writeCanonicalLine(&b, "filters", string(mustJSON(filters)))
	writeCanonicalLine(&b, "subject", sanitizeCanonicalLine(subject))
	writeCanonicalLine(&b, "reason", sanitizeCanonicalLine(reason))
	writeCanonicalLine(&b, "requestedBy", dashIfEmpty(requestedBy))
	return b.String()
}

func writeCanonicalLine(b *strings.Builder, key, value string) {
	b.WriteString(key)
	b.WriteString("=")
	b.WriteString(value)
	b.WriteString("\n")
}

// sanitizeCanonicalLine garantit qu'une valeur libre ne peut pas injecter une
// fausse ligne dans le message signé.
func sanitizeCanonicalLine(v string) string {
	return strings.TrimSpace(strings.NewReplacer("\r", " ", "\n", " ").Replace(v))
}

func dashIfEmpty(v string) string {
	if strings.TrimSpace(v) == "" {
		return "-"
	}
	return v
}

// canonicalJSONBytes sérialise sans échappement HTML (qui rendrait l'empreinte
// dépendante du contexte d'écriture) et sans saut de ligne final.
func canonicalJSONBytes(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func mustJSON(v any) []byte {
	encoded, err := canonicalJSONBytes(v)
	if err != nil {
		return []byte("{}")
	}
	return encoded
}

func decodeExportFilters(raw []byte) ExportFilters {
	var filters ExportFilters
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &filters)
	}
	return filters
}

func normalizeExportFilters(in ExportFilters) ExportFilters {
	out := ExportFilters{
		Slug:      strings.TrimSpace(in.Slug),
		UserID:    strings.TrimSpace(in.UserID),
		ConsentID: strings.TrimSpace(in.ConsentID),
		From:      strings.TrimSpace(in.From),
		To:        strings.TrimSpace(in.To),
		// Le journal des traceurs est inclus par défaut : un export du
		// consentement qui l'omettrait serait trompeur.
		IncludeCookieJournal: true,
	}
	if in.IncludeCookieJournal == false && in.MaxRows != 0 {
		out.IncludeCookieJournal = in.IncludeCookieJournal
	}
	if in.MaxRows > 0 {
		out.MaxRows = in.MaxRows
	}
	if out.MaxRows <= 0 || out.MaxRows > exportMaxRows {
		out.MaxRows = exportDefaultRows
	}
	return out
}

func parseExportTime(raw string) pgtype.Timestamp {
	if strings.TrimSpace(raw) == "" {
		return pgtype.Timestamp{}
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02"} {
		if t, err := time.Parse(layout, raw); err == nil {
			return pgtype.Timestamp{Time: t.UTC(), Valid: true}
		}
	}
	return pgtype.Timestamp{}
}

func exportScope(filters ExportFilters) string {
	switch {
	case filters.UserID != "":
		return "user"
	case filters.Slug != "":
		return "document"
	case filters.From != "" || filters.To != "":
		return "window"
	default:
		return "full"
	}
}

func (s *Service) actorEmail(ctx context.Context, actor string) string {
	if strings.TrimSpace(actor) == "" {
		return ""
	}
	email, err := s.q.GetLegalActorEmail(ctx, toUUID(actor))
	if err != nil {
		return ""
	}
	return email
}

func exportRecordFromRow(row db.LegalConsentExport) *ConsentExportRecord {
	return &ConsentExportRecord{
		ID: row.ID, Seq: row.Seq, Scope: row.Scope,
		Subject: textPtr(row.Subject), Reason: textPtr(row.Reason),
		Filters:     decodeExportFilters(row.Filters),
		GeneratedAt: tsTime(row.GeneratedAt),
		RequestedBy: uuidPtr(row.RequestedBy), RequestedByEmail: textPtr(row.RequestedByEmail),
		DocumentsCount: row.DocumentsCount, AcceptancesCount: row.AcceptancesCount,
		CookieRecordsCount: row.CookieRecordsCount,
		ContentSha256:      row.ContentSha256, PreviousChain: textPtr(row.PreviousChain),
		ChainSha256: row.ChainSha256, Signature: row.Signature,
		KeyID: row.KeyID, Algorithm: row.Algorithm,
	}
}

// uuidStr formate un UUID pgtype en chaîne canonique, "" si absent.
func uuidStr(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// rfc3339 formate un timestamp en UTC avec une précision de milliseconde —
// stable après un aller-retour en base, donc vérifiable.
func rfc3339(t pgtype.Timestamp) string {
	if !t.Valid {
		return ""
	}
	return t.Time.UTC().Format("2006-01-02T15:04:05.000Z07:00")
}

// exportTimestamp est l'horodatage tel qu'il figure dans le document signé :
// UTC, milliseconde, suffixe Z. La même fonction sert à l'affichage et au
// message signé, donc les deux ne peuvent pas diverger.
func exportTimestamp(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}
