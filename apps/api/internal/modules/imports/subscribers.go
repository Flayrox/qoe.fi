package imports

// Package imports — import de listes d'abonnés : quarantaine et revue staff.
// =====================================================================
// **Importer n'est pas envoyer.** Ce fichier ne touche jamais `Subscriber`,
// n'enfile aucune tâche et n'envoie aucun email : il range un fichier déposé
// dans une quarantaine examinable, produit un bilan, et laisse le staff
// décider. Une décision est un enregistrement immuable (contrainte de base) ;
// un changement d'avis ajoute une décision au lieu de réécrire l'historique.
//
// Ce que ce fichier remplace : `importSubscribersCsvAction` (Studio) lisait un
// CSV puis appelait POST /v1/home/subscribe **une fois par adresse**, or cet
// endpoint crée un abonné avec `confirmedAt = now()` et
// `receiveArticles = true`. Déposer un fichier suffisait donc à rendre des
// milliers d'adresses immédiatement destinataires de la prochaine campagne,
// avec une confirmation que personne n'avait effectuée.
//
// Répartition des responsabilités, pour éviter deux politiques qui divergent :
//   • le **garde d'autorisation** (internal/authz, action `import_request`)
//     vérifie le *niveau de preuve* : téléphone vérifié, step-up éventuel ;
//   • ce service vérifie ce que le garde ne peut pas savoir : la permission
//     `subscribers:import_request` sur **cette** publication, la complétude des
//     déclarations, les limites de ressources et l'opposition déjà connue.

import (
	"context"
	"crypto/sha256"
	"encoding/csv"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/qoefi/api/internal/permissions"
)

// ── Limites ──────────────────────────────────────────────────────────────
// Choisies pour borner la mémoire et la durée d'analyse d'une requête, pas
// pour décrire une politique commerciale : les seuils de revue renforcée sont
// paramétrés côté staff, pas figés ici.
const (
	// MaxSubscriberImportRows borne le nombre d'adresses analysées par lot.
	MaxSubscriberImportRows = 50000
	// MaxSubscriberImportBytes borne le corps CSV accepté (8 Mio).
	MaxSubscriberImportBytes = 8 << 20
	// maxOpenImportsPerPublication borne les lots ouverts simultanément : un
	// dépôt ne doit pas servir à saturer la file de revue.
	maxOpenImportsPerPublication = 5
	// maxImportExclusions borne les exclusions prononcées par une décision.
	maxImportExclusions = 2000
	// maxEmailLength : longueur maximale d'une adresse (RFC 5321).
	maxEmailLength = 254
	maxLocalPart   = 64
	// maxReviewRowsPreview borne l'échantillon renvoyé au staff.
	maxReviewRowsPreview = 200
	// maxProofRefs borne les références de pièces justificatives.
	maxProofRefs = 20
	// importSourceDetailMax borne les champs libres descriptifs.
	importSourceDetailMax = 2000
)

// Statuts de lot, alignés sur la contrainte CHECK de la migration 00031.
const (
	BatchDraft             = "draft"
	BatchSubmitted         = "submitted"
	BatchReviewing         = "reviewing"
	BatchNeedsInfo         = "needs_info"
	BatchRejected          = "rejected"
	BatchApprovedReconfirm = "approved_reconfirm"
	BatchApprovedDirect    = "approved_direct"
	BatchRunning           = "running"
	BatchCompleted         = "completed"
	BatchSuspended         = "suspended"
	BatchCancelled         = "cancelled"
)

// Verdicts de quarantaine d'une ligne.
const (
	RowInvalid             = "invalid"
	RowDuplicate           = "duplicate"
	RowSuppressed          = "suppressed"
	RowAlreadySubscribed   = "already_subscribed"
	RowPendingConfirmation = "pending_confirmation"
	RowEligibleDirect      = "eligible_direct"
	RowExcluded            = "excluded"
	RowActive              = "active"
)

var (
	// errImportDeclarations : déclarations de provenance incomplètes.
	errImportDeclarations = errors.New("déclarations de provenance incomplètes")
	// errImportTooLarge : fichier trop volumineux.
	errImportTooLarge = errors.New("fichier trop volumineux")
	// errImportNoRows : aucune adresse exploitable.
	errImportNoRows = errors.New("aucune adresse exploitable dans le fichier")
	// errImportOpenBatches : trop de lots en attente de revue.
	errImportOpenBatches = errors.New("trop de lots en attente de revue pour cette publication")
	// errImportStaleDecision : la décision vise une autre version du fichier.
	errImportStaleDecision = errors.New("la décision ne porte pas sur la version courante du fichier")
	// errImportTransition : transition d'état interdite.
	errImportTransition = errors.New("transition d'état interdite")
)

// Sentinelles exportées : la console admin (paquet `admin`) expose la revue
// staff et doit pouvoir distinguer un dossier introuvable d'une transition
// interdite sans dupliquer ces notions.
var (
	// ErrNotFound : lot d'import inconnu (ou hors du périmètre du demandeur).
	ErrNotFound = errNotFound
	// ErrForbidden : demandeur non autorisé sur la publication.
	ErrForbidden = errForbidden
	// ErrImportStaleDecision : la décision ne vise pas la version courante.
	ErrImportStaleDecision = errImportStaleDecision
	// ErrImportTransition : transition d'état interdite pour ce lot.
	ErrImportTransition = errImportTransition
)

// allowedImportSources : sources déclarables. Fermé volontairement — « autre »
// existe pour les cas non prévus, mais une source non reconnue est refusée
// plutôt que stockée telle quelle.
var allowedImportSources = map[string]bool{
	"substack": true, "ghost": true, "beehiiv": true, "mailchimp": true,
	"cms_export": true, "csv_manual": true, "other": true,
}

// importEmailRegex valide une adresse déjà normalisée (minuscules).
// Volontairement stricte : on préfère classer une adresse douteuse en
// `invalid` plutôt que d'inventer une adresse qui pourrait appartenir à
// quelqu'un d'autre.
var importEmailRegex = regexp.MustCompile(
	`^[a-z0-9!#$%&'*+/=?^_{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_{|}~-]+)*@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$`,
)

// emailHeaderAliases : libellés d'en-tête reconnus pour la colonne adresse.
var emailHeaderAliases = map[string]bool{
	"email": true, "e-mail": true, "mail": true, "courriel": true,
	"email address": true, "email_address": true, "adresse email": true,
	"adresse e-mail": true, "subscriber email": true, "adresse": true,
}

// ── Entrées de quarantaine ───────────────────────────────────────────────

// SubscriberImportDeclarations reprend les déclarations du demandeur décrites
// par la fiche 03 §3.4. Une déclaration n'est pas une preuve : elle est
// conservée pour l'audit et confrontée aux contrôles techniques, mais une
// déclaration manquante bloque la soumission.
type SubscriberImportDeclarations struct {
	NoPurchased               bool   `json:"noPurchased"`
	NoScraped                 bool   `json:"noScraped"`
	NoUnsubscribed            bool   `json:"noUnsubscribed"`
	SuppressionListIdentified bool   `json:"suppressionListIdentified"`
	ConsentPurpose            string `json:"consentPurpose"`
}

// Complete indique si toutes les déclarations obligatoires sont faites.
func (d SubscriberImportDeclarations) Complete() bool {
	return d.NoPurchased && d.NoScraped && d.NoUnsubscribed &&
		d.SuppressionListIdentified && strings.TrimSpace(d.ConsentPurpose) != ""
}

// SubscriberImportRequest est le corps de POST /v1/import/subscribers.
type SubscriberImportRequest struct {
	PublicationID    string                       `json:"publicationId"`
	Source           string                       `json:"source"`
	SourceDetail     string                       `json:"sourceDetail"`
	CollectionPeriod string                       `json:"collectionPeriod"`
	OptInMethod      string                       `json:"optInMethod"`
	LastSendAt       *time.Time                   `json:"lastSendAt"`
	Declarations     SubscriberImportDeclarations `json:"declarations"`
	ProofRefs        []string                     `json:"proofRefs"`
	Content          string                       `json:"content"`
}

// SubscriberImportStats est le bilan **agrégé** du parsing : aucune adresse
// individuelle n'y figure, c'est le seul contenu communicable au demandeur.
type SubscriberImportStats struct {
	Received            int  `json:"received"`
	Valid               int  `json:"valid"`
	Invalid             int  `json:"invalid"`
	Duplicates          int  `json:"duplicates"`
	Suppressed          int  `json:"suppressed"`
	AlreadySubscribed   int  `json:"alreadySubscribed"`
	PendingConfirmation int  `json:"pendingConfirmation"`
	Excluded            int  `json:"excluded"`
	Truncated           bool `json:"truncated"`
}

// SubscriberImportBatchDTO est la vue API d'un lot.
type SubscriberImportBatchDTO struct {
	ID            string `json:"id"`
	PublicationID string `json:"publicationId"`
	Status        string `json:"status"`
	Source        string `json:"source"`
	SourceDetail  string `json:"sourceDetail,omitempty"`
	FileVersion   int    `json:"fileVersion"`
	// Empreinte SHA256 du fichier (hash, pas le contenu) : le staff en a
	// besoin pour désigner la version exacte visée par sa décision.
	FileFingerprint string                `json:"fileFingerprint,omitempty"`
	RowCount        int                   `json:"rowCount"`
	Stats           SubscriberImportStats `json:"stats"`
	// Dernière décision : ce que le demandeur voit de la revue.
	Decision     string `json:"decision,omitempty"`
	PublicReason string `json:"publicReason,omitempty"`
	SubmittedAt  string `json:"submittedAt,omitempty"`
	ReviewDueAt  string `json:"reviewDueAt,omitempty"`
	SuspendedAt  string `json:"suspendedAt,omitempty"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// ── Parsing ──────────────────────────────────────────────────────────────

// parsedSubscriberRow est une ligne issue du CSV, avant confrontation à la base.
type parsedSubscriberRow struct {
	Email  string
	Status string
	Reason string
}

// parseSubscriberCSV lit le CSV côté serveur sans faire confiance à
// l'extension, au type MIME ni au nom de fichier. Le parsing est borné en
// nombre de lignes ; les cellules ne sont jamais interprétées comme du code.
func parseSubscriberCSV(content string) ([]parsedSubscriberRow, SubscriberImportStats, error) {
	var stats SubscriberImportStats
	reader := csv.NewReader(strings.NewReader(content))
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true
	reader.TrimLeadingSpace = true

	rows := make([]parsedSubscriberRow, 0, 256)
	seen := map[string]bool{}
	emailCol := -1

	for {
		record, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			// Ligne illisible : on la compte comme invalide et on poursuit —
			// un export d'ancien prestataire contient souvent des lignes
			// cassées qui ne doivent pas condamner tout le lot.
			stats.Invalid++
			continue
		}
		if len(record) == 0 {
			continue
		}

		// En-tête : détecté une seule fois, sur la première ligne exploitable.
		if emailCol == -1 && stats.Received == 0 {
			trimmed := make([]string, len(record))
			for i, cell := range record {
				trimmed[i] = strings.ToLower(strings.TrimSpace(strings.Trim(cell, "\"'")))
			}
			// Un en-tête ne contient jamais d'adresse valide.
			hasAddress := false
			for _, cell := range trimmed {
				if importEmailRegex.MatchString(normalizeImportEmail(cell)) {
					hasAddress = true
					break
				}
			}
			if !hasAddress {
				for i, cell := range trimmed {
					if emailHeaderAliases[cell] {
						emailCol = i
						break
					}
				}
				continue // la ligne d'en-tête n'est pas une donnée
			}
		}

		if stats.Received >= MaxSubscriberImportRows {
			stats.Truncated = true
			break
		}
		stats.Received++

		candidate := ""
		if emailCol >= 0 && emailCol < len(record) {
			candidate = record[emailCol]
		} else {
			// Sans en-tête reconnu, on retient la première cellule qui
			// ressemble à une adresse.
			for _, cell := range record {
				if importEmailRegex.MatchString(normalizeImportEmail(cell)) {
					candidate = cell
					break
				}
			}
		}

		email := normalizeImportEmail(candidate)
		if !validImportEmail(email) {
			stats.Invalid++
			rows = append(rows, parsedSubscriberRow{Email: email, Status: RowInvalid, Reason: "adresse invalide"})
			continue
		}
		if seen[email] {
			stats.Duplicates++
			continue
		}
		seen[email] = true
		stats.Valid++
		rows = append(rows, parsedSubscriberRow{Email: email, Status: RowPendingConfirmation})
	}

	if stats.Valid == 0 {
		return rows, stats, errImportNoRows
	}
	return rows, stats, nil
}

// normalizeImportEmail déplie les formes d'export courantes (« Nom <a@b> ») et
// met en minuscules. On ne « corrige » jamais une adresse : aucune tentative de
// réparation, aucun retrait de point, aucune complétion de domaine — une
// « correction » hasardeuse pourrait désigner la boîte d'une autre personne.
func normalizeImportEmail(raw string) string {
	e := strings.TrimSpace(raw)
	e = strings.Trim(e, "\"'")
	e = strings.TrimSpace(e)
	if i := strings.LastIndex(e, "<"); i >= 0 && strings.HasSuffix(e, ">") {
		e = strings.TrimSpace(e[i+1 : len(e)-1])
	}
	return strings.ToLower(e)
}

// validImportEmail applique la validation stricte d'une adresse normalisée.
func validImportEmail(email string) bool {
	if email == "" || len(email) > maxEmailLength {
		return false
	}
	at := strings.LastIndex(email, "@")
	if at <= 0 || at == len(email)-1 || at > maxLocalPart {
		return false
	}
	if strings.Contains(email, "..") {
		return false
	}
	return importEmailRegex.MatchString(email)
}

// sanitizeImportCell neutralise une cellule destinée à l'affichage ou à
// l'export staff : les cellules commençant par `=`, `+`, `-`, `@` ou un
// caractère de contrôle deviennent des formules de tableur ou du HTML
// exécutable dans certains outils. On les préfixe d'une apostrophe et on
// retire les caractères de contrôle.
func sanitizeImportCell(raw string) string {
	cleaned := strings.Map(func(r rune) rune {
		if r < 0x20 && r != '\t' {
			return -1
		}
		return r
	}, raw)
	cleaned = strings.TrimSpace(cleaned)
	if cleaned == "" {
		return ""
	}
	switch cleaned[0] {
	case '=', '+', '-', '@':
		return "'" + cleaned
	}
	return cleaned
}

// fingerprintImport calcule l'empreinte du contenu soumis : une approbation
// porte sur cette version exacte, jamais sur « le dernier fichier reçu ».
func fingerprintImport(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// ── Autorisation du demandeur ────────────────────────────────────────────

// importRequester décrit le contexte d'autorisation résolu pour un dépôt.
type importRequester struct {
	MediaID      string // vide pour une publication personnelle
	Personal     bool
	PhoneVerifed bool
}

// authorizeImportRequester vérifie que le demandeur peut déposer une liste
// pour cette publication.
//
// Règle (fiche 03 §2) : la permission `subscribers:import_request` est exigée.
// Elle n'est **pas** impliquée par `media:publish:any` ni par
// `api_keys:manage` — publier ou gérer des clés ne doit pas suffire à faire
// entrer des adresses dans le périmètre d'envoi. Le propriétaire d'une
// publication personnelle est autorisé sur la sienne.
//
// Returns errForbidden si la publication n'existe pas pour ce demandeur.
func (s *Service) authorizeImportRequester(ctx context.Context, userID, publicationID string) (importRequester, error) {
	var out importRequester
	var personal string
	err := s.pool.QueryRow(ctx, `SELECT COALESCE("publicationId", '') FROM "User" WHERE id = $1`, toUUID(userID)).Scan(&personal)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return out, err
	}
	if personal != "" && personal == publicationID {
		out.Personal = true
		return out, nil
	}

	var role string
	var override []string
	var status string
	err = s.pool.QueryRow(ctx, `
		SELECT m.role, COALESCE(m.permissions, '{}'), m.status
		FROM "MediaMember" m
		JOIN "Media" md ON md.id = m."mediaId"
		WHERE md."publicationId" = $1 AND m."userId" = $2
		LIMIT 1`, publicationID, toUUID(userID)).Scan(&role, &override, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, errForbidden
	}
	if err != nil {
		return out, err
	}

	member := &permissions.MediaMember{Role: role, Permissions: override, Status: status}
	if !permissions.CanMedia(member, permissions.PermImportSubscribers) {
		return out, errForbidden
	}
	out.MediaID = publicationID // conservé pour l'audit : le média de rattachement
	if mediaID, err := s.mediaIDForPublication(ctx, publicationID); err == nil {
		out.MediaID = mediaID
	}
	return out, nil
}

// mediaIDForPublication résout le média d'une publication (vide si personnelle).
func (s *Service) mediaIDForPublication(ctx context.Context, publicationID string) (string, error) {
	var mediaID string
	err := s.pool.QueryRow(ctx, `SELECT id FROM "Media" WHERE "publicationId" = $1 LIMIT 1`, publicationID).Scan(&mediaID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return mediaID, err
}

// ── Dépôt en quarantaine ─────────────────────────────────────────────────

// SubmitSubscriberImport range un CSV dans la quarantaine et le soumet à revue.
//
// Effets : création d'un lot, de ses lignes classées, d'événements d'audit et
// d'antagonismes rendus durables. **Aucun envoi, aucune écriture dans
// `Subscriber`** — c'est l'invariant central de ce chemin.
func (s *Service) SubmitSubscriberImport(ctx context.Context, userID string, req SubscriberImportRequest) (SubscriberImportBatchDTO, error) {
	if strings.TrimSpace(req.PublicationID) == "" {
		return SubscriberImportBatchDTO{}, errors.New("publicationId requis")
	}
	if !req.Declarations.Complete() {
		return SubscriberImportBatchDTO{}, errImportDeclarations
	}
	if len(req.Content) > MaxSubscriberImportBytes {
		return SubscriberImportBatchDTO{}, errImportTooLarge
	}
	if len(req.Content) == 0 {
		return SubscriberImportBatchDTO{}, errImportNoRows
	}
	if !allowedImportSources[req.Source] {
		req.Source = "other"
	}
	if len(req.ProofRefs) > maxProofRefs {
		req.ProofRefs = req.ProofRefs[:maxProofRefs]
	}

	requester, err := s.authorizeImportRequester(ctx, userID, req.PublicationID)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	open, err := s.countOpenImports(ctx, req.PublicationID)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	if open >= maxOpenImportsPerPublication {
		return SubscriberImportBatchDTO{}, errImportOpenBatches
	}

	rows, stats, err := parseSubscriberCSV(req.Content)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	declarations, err := json.Marshal(req.Declarations)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	proofRefs, err := json.Marshal(req.ProofRefs)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	fingerprint := fingerprintImport(req.Content)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	batchID := newID()
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportBatch" (
			"id", "publicationId", "mediaId", "requesterId", "status", "source",
			"sourceDetail", "collectionPeriod", "optInMethod", "lastSendAt",
			"declarations", "proofRefs", "fileFingerprint", "fileVersion",
			"rowCount", "stats", "submittedAt", "createdAt", "updatedAt"
		) VALUES ($1, $2, NULLIF($3, ''), $4, 'submitted', $5, NULLIF($6, ''), NULLIF($7, ''),
		          NULLIF($8, ''), $9, $10, $11, $12, 1, $13, '{}'::jsonb, now(), now(), now())`,
		batchID, req.PublicationID, requester.MediaID, toUUID(userID), req.Source,
		clip(req.SourceDetail, importSourceDetailMax), clip(req.CollectionPeriod, 120),
		clip(req.OptInMethod, 500), req.LastSendAt, declarations, proofRefs,
		fingerprint, len(rows),
	); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	classified, err := s.classifyRows(ctx, tx, batchID, req.PublicationID, rows, &stats)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'deposited', $3, 'requester', $4)`,
		newID(), batchID, toUUID(userID),
		mustJSON(map[string]any{"rows": len(rows), "fingerprint": fingerprint}),
	); err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO "SubscriberImportEvent" ("id", "batchId", "type", "actorId", "actorKind", "detail")
		VALUES ($1, $2, 'submitted', $3, 'requester', '{}'::jsonb)`,
		newID(), batchID, toUUID(userID),
	); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	statsJSON := mustJSON(stats)
	if _, err := tx.Exec(ctx, `
		UPDATE "SubscriberImportBatch"
		SET "stats" = $2, "rowCount" = $3, "updatedAt" = now()
		WHERE "id" = $1`, batchID, statsJSON, len(classified)); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return SubscriberImportBatchDTO{}, err
	}

	return s.GetSubscriberImport(ctx, userID, batchID)
}

// countOpenImports compte les lots en attente de revue pour une publication.
func (s *Service) countOpenImports(ctx context.Context, publicationID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM "SubscriberImportBatch"
		WHERE "publicationId" = $1
		  AND "status" IN ('submitted', 'reviewing', 'needs_info')`, publicationID).Scan(&n)
	return n, err
}

// classifyRows confronte les lignes du lot à l'état réel de qoe.fi et les
// insère avec leur verdict de quarantaine.
//
// Ordre de priorité des verdicts — l'opposition passe avant tout :
//  1. opposition connue (liste de suppression, ou abonné désabonné côté
//     qoe.fi) → `suppressed`, et l'opposition est rendue **durable** ;
//  2. contact déjà présent → `already_subscribed` (jamais réécrit) ;
//  3. adresse nouvelle → `pending_confirmation`, la branche stricte.
//
// Une adresse nouvelle n'est jamais classée `eligible_direct` d'office :
// seule une décision staff peut élever un segment, ce qui traduit dans la
// donnée le principe « confiance graduée, jamais automatique ».
func (s *Service) classifyRows(
	ctx context.Context,
	tx pgx.Tx,
	batchID, publicationID string,
	rows []parsedSubscriberRow,
	stats *SubscriberImportStats,
) ([]parsedSubscriberRow, error) {
	emails := make([]string, 0, len(rows))
	for _, row := range rows {
		if row.Status != RowInvalid {
			emails = append(emails, row.Email)
		}
	}
	if len(emails) > 0 {
		// Une seule requête ensembliste : un appel par adresse ferait N+1
		// requêtes sur un fichier de plusieurs dizaines de milliers de lignes.
		found, err := s.lookupRowState(ctx, tx, publicationID, emails)
		if err != nil {
			return nil, err
		}
		var durable []string
		for i := range rows {
			row := &rows[i]
			if row.Status == RowInvalid {
				continue
			}
			state, ok := found[row.Email]
			if !ok {
				continue
			}
			switch {
			case state.Suppressed:
				row.Status = RowSuppressed
				row.Reason = "opposition déjà enregistrée"
			case state.SubscriberID != "" && (!state.IsActive || !state.ReceiveArticles):
				// Opposition prioritaire : une adresse désabonnée chez qoe.fi
				// ne doit jamais revenir par un import. On en profite pour
				// rendre l'opposition durable, afin qu'un réimport ultérieur
				// du même CSV la retrouve même si l'abonné est supprimé.
				row.Status = RowSuppressed
				row.Reason = "désabonné de qoefi"
				durable = append(durable, row.Email)
			case state.SubscriberID != "":
				row.Status = RowAlreadySubscribed
				row.Reason = "contact déjà présent dans cette publication"
			}
		}
		if len(durable) > 0 {
			if err := s.persistSuppressions(ctx, tx, publicationID, durable, "unsubscribe", "import_quarantine"); err != nil {
				return nil, err
			}
		}
	}

	for _, row := range rows {
		switch row.Status {
		case RowSuppressed:
			stats.Suppressed++
		case RowAlreadySubscribed:
			stats.AlreadySubscribed++
		case RowPendingConfirmation:
			stats.PendingConfirmation++
		}
	}

	if err := s.insertRows(ctx, tx, batchID, rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// rowState est l'état connu de qoe.fi pour une adresse d'un lot.
type rowState struct {
	SubscriberID    string
	IsActive        bool
	ReceiveArticles bool
	Suppressed      bool
}

// lookupRowState lit en une requête l'abonné existant et l'opposition
// enregistrée pour chaque adresse du lot.
func (s *Service) lookupRowState(ctx context.Context, tx pgx.Tx, publicationID string, emails []string) (map[string]rowState, error) {
	out := make(map[string]rowState, len(emails))
	rows, err := tx.Query(ctx, `
		SELECT e.email,
		       COALESCE(s.id, ''),
		       COALESCE(s."isActive", false),
		       COALESCE(s."receiveArticles", false),
		       EXISTS(
		           SELECT 1 FROM "EmailSuppression" x
		           WHERE x.email = e.email
		             AND (x."scope" = 'global'
		                  OR (x."scope" = 'publication' AND x."publicationId" = $1))
		       )
		FROM unnest($2::text[]) AS e(email)
		LEFT JOIN "Subscriber" s
		       ON s."publicationId" = $1 AND s.email = e.email`,
		publicationID, emails)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var email, subscriberID string
		var isActive, receiveArticles, suppressed bool
		if err := rows.Scan(&email, &subscriberID, &isActive, &receiveArticles, &suppressed); err != nil {
			return nil, err
		}
		out[email] = rowState{
			SubscriberID: subscriberID, IsActive: isActive,
			ReceiveArticles: receiveArticles, Suppressed: suppressed,
		}
	}
	return out, rows.Err()
}

// persistSuppressions enregistre durablement une opposition pour des adresses.
// Best-effort assumé au niveau du lot : une opposition déjà présente est
// ignorée (index uniques partiels), une erreur ici n'annule pas le dépôt.
func (s *Service) persistSuppressions(ctx context.Context, tx pgx.Tx, publicationID string, emails []string, reason, source string) error {
	if len(emails) == 0 {
		return nil
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO "EmailSuppression" ("id", "email", "scope", "publicationId", "reason", "source")
		SELECT gen_random_uuid()::text, e.email, 'publication', $1, $2, $3
		FROM unnest($4::text[]) AS e(email)
		ON CONFLICT DO NOTHING`,
		publicationID, reason, source, emails)
	return err
}

// insertRows écrit les lignes de quarantaine en une passe.
func (s *Service) insertRows(ctx context.Context, tx pgx.Tx, batchID string, rows []parsedSubscriberRow) error {
	if len(rows) == 0 {
		return nil
	}
	copyRows := make([][]any, 0, len(rows))
	for _, row := range rows {
		copyRows = append(copyRows, []any{
			newID(), batchID, row.Email, row.Status, nullableText(row.Reason), nil, nil,
		})
	}
	_, err := tx.CopyFrom(ctx,
		pgx.Identifier{"SubscriberImportRow"},
		[]string{"id", "batchId", "email", "status", "reason", "subscriberId", "excludedBy"},
		pgx.CopyFromRows(copyRows),
	)
	return err
}

// ── Lecture côté demandeur ───────────────────────────────────────────────

// GetSubscriberImport renvoie un lot du demandeur (agrégats + dernière décision).
func (s *Service) GetSubscriberImport(ctx context.Context, userID, batchID string) (SubscriberImportBatchDTO, error) {
	return s.getBatch(ctx, batchID, toUUID(userID), false)
}

// ListSubscriberImports liste les lots récents du demandeur (20 max).
func (s *Service) ListSubscriberImports(ctx context.Context, userID string) ([]SubscriberImportBatchDTO, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT b."id", b."publicationId", b."status", b."source", COALESCE(b."sourceDetail", ''),
		       b."fileVersion", b."fileFingerprint", b."rowCount", b."stats",
		       COALESCE(d."decision", ''), COALESCE(d."publicReason", ''),
		       b."submittedAt", b."reviewDueAt", b."suspendedAt", b."createdAt", b."updatedAt"
		FROM "SubscriberImportBatch" b
		LEFT JOIN LATERAL (
		    SELECT "decision", "publicReason"
		    FROM "SubscriberImportDecision" dd
		    WHERE dd."batchId" = b."id"
		    ORDER BY dd."createdAt" DESC
		    LIMIT 1
		) d ON true
		WHERE b."requesterId" = $1
		ORDER BY b."createdAt" DESC
		LIMIT 20`, toUUID(userID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanBatches(rows)
}

// getBatch charge un lot, avec filtre demandeur optionnel (staff : aucun filtre).
func (s *Service) getBatch(ctx context.Context, batchID string, requester pgtype.UUID, staff bool) (SubscriberImportBatchDTO, error) {
	var rows pgx.Rows
	var err error
	if staff {
		rows, err = s.pool.Query(ctx, batchSelect+` WHERE b."id" = $1`, batchID)
	} else {
		rows, err = s.pool.Query(ctx, batchSelect+` WHERE b."id" = $1 AND b."requesterId" = $2`, batchID, requester)
	}
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	defer rows.Close()
	out, err := scanBatches(rows)
	if err != nil {
		return SubscriberImportBatchDTO{}, err
	}
	if len(out) == 0 {
		return SubscriberImportBatchDTO{}, errNotFound
	}
	return out[0], nil
}

const batchSelect = `
	SELECT b."id", b."publicationId", b."status", b."source", COALESCE(b."sourceDetail", ''),
	       b."fileVersion", b."fileFingerprint", b."rowCount", b."stats",
	       COALESCE(d."decision", ''), COALESCE(d."publicReason", ''),
	       b."submittedAt", b."reviewDueAt", b."suspendedAt", b."createdAt", b."updatedAt"
	FROM "SubscriberImportBatch" b
	LEFT JOIN LATERAL (
	    SELECT "decision", "publicReason"
	    FROM "SubscriberImportDecision" dd
	    WHERE dd."batchId" = b."id"
	    ORDER BY dd."createdAt" DESC
	    LIMIT 1
	) d ON true`

func scanBatches(rows pgx.Rows) ([]SubscriberImportBatchDTO, error) {
	out := []SubscriberImportBatchDTO{}
	for rows.Next() {
		var (
			dto                             SubscriberImportBatchDTO
			statsRaw                        []byte
			submitted, reviewDue, suspended *time.Time
			created, updated                time.Time
		)
		if err := rows.Scan(
			&dto.ID, &dto.PublicationID, &dto.Status, &dto.Source, &dto.SourceDetail,
			&dto.FileVersion, &dto.FileFingerprint, &dto.RowCount, &statsRaw,
			&dto.Decision, &dto.PublicReason,
			&submitted, &reviewDue, &suspended, &created, &updated,
		); err != nil {
			return nil, err
		}
		if len(statsRaw) > 0 {
			if err := json.Unmarshal(statsRaw, &dto.Stats); err != nil {
				// Bilan illisible : on ne bloque pas la lecture du lot.
				log.Printf("[imports] stats lot %s: %v", dto.ID, err)
			}
		}
		dto.SubmittedAt = formatTimePtr(submitted)
		dto.ReviewDueAt = formatTimePtr(reviewDue)
		dto.SuspendedAt = formatTimePtr(suspended)
		dto.CreatedAt = created.Format(time.RFC3339)
		dto.UpdatedAt = updated.Format(time.RFC3339)
		out = append(out, dto)
	}
	return out, rows.Err()
}

// ── Helpers ──────────────────────────────────────────────────────────────

func nullableText(v string) any {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return v
}

func clip(v string, max int) string {
	v = strings.TrimSpace(v)
	if len(v) <= max {
		return v
	}
	return v[:max]
}

func mustJSON(v any) []byte {
	raw, err := json.Marshal(v)
	if err != nil {
		return []byte("{}")
	}
	return raw
}

func formatTimePtr(t *time.Time) string {
	if t == nil || t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

// newID produit un identifiant texte, comme le reste du schéma (TEXT + uuid).
func newID() string { return uuid.NewString() }

// pgtypeZero est l'UUID nul utilisé quand la requête n'a pas de filtre
// utilisateur (vue staff).
func pgtypeZero() pgtype.UUID { return pgtype.UUID{} }
