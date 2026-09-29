package ebooks

// Notes de lecture d'un EPUB personnel : passage sélectionné et/ou mot à
// soi, ancrés à un chapitre. Table DÉDIÉE (décision produit) — les
// surlignages d'articles publiés restent dans "Highlight" (public, votés) ;
// une note de livre n'a ni visibilité ni vote et ne quitte jamais le compte.
// Règle de bornage : l'extrait (collage d'un passage) est TRONQUÉ, la note
// écrite est REFUSÉE si trop longue — on ne coupe jamais ce que quelqu'un a
// écrit, on refuse en expliquant.

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode"

	"github.com/jackc/pgx/v5"
	"golang.org/x/text/unicode/norm"
)

const (
	// MaxNoteExcerpt : taille du passage conservé (au-delà : tronqué).
	MaxNoteExcerpt = 1000
	// MaxNoteLength : taille de la note écrite (au-delà : refus explicite).
	MaxNoteLength = 4000
)

// ErrNoteEmpty : ni passage ni note — il n'y a rien à garder (400).
var ErrNoteEmpty = errors.New("note vide : sélectionnez un passage ou écrivez quelques mots")

// ErrNoteTooLong : la note écrite dépasse la borne (400, jamais tronquée).
var ErrNoteTooLong = errors.New("note trop longue (4000 caractères max)")

// ErrNoteNotFound : inexistante ou pas à vous (404 — pas de fuite).
var ErrNoteNotFound = errors.New("note introuvable")

// Note est une note de lecture (rendue telle quelle au lecteur).
type Note struct {
	ID           string `json:"id"`
	ChapterIndex int    `json:"chapterIndex"`
	ChapterTitle string `json:"chapterTitle"`
	Excerpt      string `json:"excerpt"`
	Note         string `json:"note"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// NoteInput est ce que le client propose (bornes appliquées AVANT la base :
// un refus clair vaut mieux qu'une erreur SQL).
type NoteInput struct {
	ChapterIndex int
	ChapterTitle string
	Excerpt      string
	Note         string
}

func truncateRunes(s string, limit int) string {
	r := []rune(s)
	if len(r) <= limit {
		return s
	}
	return string(r[:limit])
}

// normalizeNote applique les bornes et refuse une note vide.
func normalizeNote(in NoteInput) (NoteInput, error) {
	in.ChapterTitle = clampMeta(in.ChapterTitle) // trim + ≤ 300 runes
	in.Excerpt = truncateRunes(strings.TrimSpace(in.Excerpt), MaxNoteExcerpt)
	in.Note = strings.TrimSpace(in.Note)
	if len([]rune(in.Note)) > MaxNoteLength {
		return in, ErrNoteTooLong
	}
	if in.Excerpt == "" && in.Note == "" {
		return in, ErrNoteEmpty
	}
	return in, nil
}

// chapterCount renvoie le nombre de chapitres SI le livre est à vous (sinon
// introuvable : le même 404 pour inexistant et pour autrui).
func (s *Service) chapterCount(ctx context.Context, userID, ebookID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx,
		`SELECT "chapterCount" FROM "Ebook" WHERE "id" = $1 AND "ownerId" = $2::uuid`,
		ebookID, userID).Scan(&n)
	if err != nil {
		return 0, ErrEbookNotFound
	}
	return n, nil
}

// AddNote crée une note sur un chapitre (le chapitre est borné au livre :
// un index hors bornes est ramené, jamais rejeté pour une erreur d'UI).
func (s *Service) AddNote(ctx context.Context, userID, ebookID string, in NoteInput) (Note, error) {
	if userID == "" {
		return Note{}, ErrEbookNotFound
	}
	in, err := normalizeNote(in)
	if err != nil {
		return Note{}, err
	}
	count, err := s.chapterCount(ctx, userID, ebookID)
	if err != nil {
		return Note{}, err
	}
	if in.ChapterIndex < 0 {
		in.ChapterIndex = 0
	}
	if count > 0 && in.ChapterIndex > count-1 {
		in.ChapterIndex = count - 1
	}
	now := time.Now().UTC()
	var id string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO "EbookNote" ("id", "ebookId", "ownerId", "chapterIndex", "chapterTitle", "excerpt", "note", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2::uuid, $3, $4, $5, $6, $7, $7)
		RETURNING "id"`,
		ebookID, userID, in.ChapterIndex, in.ChapterTitle, in.Excerpt, in.Note, now).Scan(&id)
	if err != nil {
		return Note{}, err
	}
	return Note{
		ID: id, ChapterIndex: in.ChapterIndex, ChapterTitle: in.ChapterTitle,
		Excerpt: in.Excerpt, Note: in.Note,
		CreatedAt: now.Format(time.RFC3339), UpdatedAt: now.Format(time.RFC3339),
	}, nil
}

// Notes liste les notes d'un livre (du premier au dernier chapitre, puis
// dans l'ordre d'écriture — l'ordre de lecture).
func (s *Service) Notes(ctx context.Context, userID, ebookID string) ([]Note, error) {
	if _, err := s.chapterCount(ctx, userID, ebookID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "chapterIndex", "chapterTitle", "excerpt", "note", "createdAt", "updatedAt"
		FROM "EbookNote" WHERE "ebookId" = $1 AND "ownerId" = $2::uuid
		ORDER BY "chapterIndex" ASC, "createdAt" ASC`, ebookID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Note{}
	for rows.Next() {
		var n Note
		var created, updated time.Time
		if err := rows.Scan(&n.ID, &n.ChapterIndex, &n.ChapterTitle, &n.Excerpt, &n.Note, &created, &updated); err != nil {
			return nil, err
		}
		n.CreatedAt = created.UTC().Format(time.RFC3339)
		n.UpdatedAt = updated.UTC().Format(time.RFC3339)
		items = append(items, n)
	}
	return items, rows.Err()
}

// UpdateNote remplace le texte de la note (l'extrait ne bouge pas). Vider
// la note reste possible TANT QU'il reste un extrait ; sinon la ligne ne
// dirait plus rien et le refus est explicite.
func (s *Service) UpdateNote(ctx context.Context, userID, ebookID, noteID, note string) (Note, error) {
	note = strings.TrimSpace(note)
	if len([]rune(note)) > MaxNoteLength {
		return Note{}, ErrNoteTooLong
	}
	var n Note
	var created, updated time.Time
	err := s.pool.QueryRow(ctx, `
		UPDATE "EbookNote" SET "note" = $4, "updatedAt" = now()
		WHERE "id" = $1 AND "ownerId" = $2::uuid AND "ebookId" = $3
		  AND (char_length("excerpt") > 0 OR char_length($4) > 0)
		RETURNING "id", "chapterIndex", "chapterTitle", "excerpt", "note", "createdAt", "updatedAt"`,
		noteID, userID, ebookID, note).Scan(
		&n.ID, &n.ChapterIndex, &n.ChapterTitle, &n.Excerpt, &n.Note, &created, &updated)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return Note{}, err
		}
		// Soit la note n'est pas à vous, soit la modification la viderait.
		// On interroge pour distinguer les deux (l'utilisateur a droit à la
		// vraie raison) — cas rare, une requête de plus ne coûte rien.
		var excerpt string
		if err := s.pool.QueryRow(ctx,
			`SELECT "excerpt" FROM "EbookNote" WHERE "id" = $1 AND "ownerId" = $2::uuid AND "ebookId" = $3`,
			noteID, userID, ebookID).Scan(&excerpt); err != nil {
			return Note{}, ErrNoteNotFound
		}
		return Note{}, ErrNoteEmpty
	}
	n.CreatedAt = created.UTC().Format(time.RFC3339)
	n.UpdatedAt = updated.UTC().Format(time.RFC3339)
	return n, nil
}

// NoteRef est une note replacée dans son livre (vue « toutes mes notes »).
// Champs à plat (pas d'embedding de Note) : `Note` porterait le même nom que
// le texte de la note, et un JSON imbriqué compliquerait le client pour rien.
type NoteRef struct {
	ID           string `json:"id"`
	ChapterIndex int    `json:"chapterIndex"`
	ChapterTitle string `json:"chapterTitle"`
	Excerpt      string `json:"excerpt"`
	Note         string `json:"note"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	EbookID      string `json:"ebookId"`
	EbookTitle   string `json:"ebookTitle"`
	EbookAuthor  string `json:"ebookAuthor"`
}

// MaxNotesScan : nombre de notes relues pour la vue transversale. Le filtre
// texte est fait en Go (insensible à la casse ET aux accents) plutôt qu'en
// SQL, parce que l'extension `unaccent` n'est pas garantie sur toutes les
// bases — un ORM ne doit pas décider de ce qui est installé. On borne donc
// le scan, et on le DIT au client quand la borne est atteinte.
const MaxNotesScan = 500

// foldText : minuscules + diacritiques retirés (miroir du helper TS de
// recherche dans un livre — même promesse des deux côtés).
func foldText(s string) string {
	s = norm.NFD.String(strings.ToLower(s))
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if unicode.Is(unicode.Mn, r) {
			continue // marque diacritique
		}
		b.WriteRune(r)
	}
	return b.String()
}

// AllNotes : toutes mes notes, tous livres confondus, les plus récentes
// d'abord. `q` filtre sur le passage, la note, le chapitre, le livre et
// l'auteur. `truncated` dit honnêtement si la borne de scan a coupé la
// liste (jamais de silence sur une limite).
func (s *Service) AllNotes(ctx context.Context, userID, q string) ([]NoteRef, bool, error) {
	if userID == "" {
		return nil, false, ErrEbookNotFound
	}
	rows, err := s.pool.Query(ctx, `
		SELECT n."id", n."chapterIndex", n."chapterTitle", n."excerpt", n."note", n."createdAt", n."updatedAt",
		       n."ebookId", e."title", e."author"
		FROM "EbookNote" n JOIN "Ebook" e ON e."id" = n."ebookId"
		WHERE n."ownerId" = $1::uuid
		ORDER BY n."createdAt" DESC
		LIMIT $2`, userID, MaxNotesScan)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	needle := foldText(strings.TrimSpace(q))
	items := []NoteRef{}
	scanned := 0
	for rows.Next() {
		var n NoteRef
		var created, updated time.Time
		if err := rows.Scan(&n.ID, &n.ChapterIndex, &n.ChapterTitle, &n.Excerpt, &n.Note,
			&created, &updated, &n.EbookID, &n.EbookTitle, &n.EbookAuthor); err != nil {
			return nil, false, err
		}

		n.CreatedAt = created.UTC().Format(time.RFC3339)
		n.UpdatedAt = updated.UTC().Format(time.RFC3339)
		scanned++
		if needle != "" {
			hay := foldText(strings.Join([]string{
				n.Excerpt, n.Note, n.ChapterTitle, n.EbookTitle, n.EbookAuthor,
			}, "\n"))
			if !strings.Contains(hay, needle) {
				continue
			}
		}
		items = append(items, n)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}
	return items, scanned >= MaxNotesScan, nil
}

// DeleteNote supprime une note (pas à vous = introuvable).
func (s *Service) DeleteNote(ctx context.Context, userID, ebookID, noteID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM "EbookNote" WHERE "id" = $1 AND "ownerId" = $2::uuid AND "ebookId" = $3`,
		noteID, userID, ebookID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNoteNotFound
	}
	return nil
}
