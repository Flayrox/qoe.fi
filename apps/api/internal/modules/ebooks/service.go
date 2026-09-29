// Package ebooks — EPUBs personnels (fiche Plus P1 : bibliothèque).
// Strictement PERSONNEL : jamais publiés, jamais partagés (pas de route
// publique par id — seul l'ouvreur lit, via son JWT). Quota : 5 gratuits,
// illimités en Plus (HasPlus). Le brut uploadé est jeté après parse (pas
// de stockage de fichier — seul le parsé strict vit en base).
package ebooks

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/subscriptions"
)

// FreeEbookQuota : EPUBs gratuits par compte (fiche : « quelques imports »
// — 3 à 5 ; on retient 5, généreux et borné). Illimités en Plus.
const FreeEbookQuota = 5

// MaxUploadBytes : 20 Mo (même borne que le parseur — refusé avant lecture).
const MaxUploadBytes = 20 << 20

// ErrEbookQuota : quota gratuit atteint → 403 + code (upsell informatif,
// pas de vente de vent).
var ErrEbookQuota = errors.New("quota gratuit de 5 EPUBs atteint — Plus = illimités")

// ErrEbookDuplicate : même fichier déjà importé → 409 (pas de doublon
// silencieux — l'utilisateur retrouve l'existant via la liste).
var ErrEbookDuplicate = errors.New("cet EPUB est déjà dans votre bibliothèque")

// ErrEbookNotFound : inexistant ou pas à vous (pas de fuite : les deux se
// ressemblent — un EPUB d'autrui ressemble à un inexistant).
var ErrEbookNotFound = errors.New("livre introuvable")

// ErrEbookOfflinePlusRequired : le hors-ligne est un droit Plus (403 +
// code, comme le pack d'article — même doctrine, mêmes codes lisibles).
var ErrEbookOfflinePlusRequired = errors.New("le hors-ligne est réservé aux abonnés Plus")

// ErrEbookOfflineUnavailable : livre vide (aucun chapitre stockable).
var ErrEbookOfflineUnavailable = errors.New("ce livre ne peut pas être emporté hors-ligne")

// OfflinePackVersion : la forme du pack est versionnée — le client garde une
// enveloppe stable même si le livre change ou disparaît ensuite (elle est
// SA copie, elle n'a plus à demander la permission à chaque ouverture).
const OfflinePackVersion = 1

// Service porte les opérations EPUB (SQL direct — pas de sqlc ici : les
// requêtes sont petites et lisibles en ligne, comme les checks du module
// articles).
type Service struct {
	pool *pgxpool.Pool
}

// NewService construit le service.
func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// Ebook est un livre (sans le blob de couverture — endpoint dédié).
type Ebook struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Author       string `json:"author"`
	Language     string `json:"language"`
	ChapterCount int    `json:"chapterCount"`
	HasCover     bool   `json:"hasCover"`
	Progress     int    `json:"progressChapter"`
	ProgressPct  int    `json:"progressPct"`
	// ProgressParagraph : index du premier paragraphe VISIBLE du chapitre.
	// Granularité assumée : paragraphe et non caractère — un offset de
	// caractères survivrait mal au re-rendu (et donnerait une fausse
	// précision) alors qu'un index d'élément rendu est stable.
	ProgressParagraph int    `json:"progressParagraph"`
	CreatedAt         string `json:"createdAt"`
}

// EbookDetail est un livre avec ses chapitres (lecture).
type EbookDetail struct {
	Ebook
	Chapters []Chapter `json:"chapters"`
}

// Upload parse et stocke (quota + déduplication + bornes du parseur).
func (s *Service) Upload(ctx context.Context, userID string, raw []byte) (Ebook, error) {
	if userID == "" {
		return Ebook{}, errors.New("compte requis")
	}
	if len(raw) == 0 || len(raw) > MaxUploadBytes {
		return Ebook{}, ErrEpubInvalid
	}
	now := time.Now()
	if !subscriptions.HasPlus(ctx, s.pool, userID, now) {
		var n int
		if err := s.pool.QueryRow(ctx,
			`SELECT COUNT(*) FROM "Ebook" WHERE "ownerId" = $1::uuid`, userID).Scan(&n); err != nil {
			return Ebook{}, err
		}
		if n >= FreeEbookQuota {
			return Ebook{}, ErrEbookQuota
		}
	}
	book, err := ParseEbook(raw)
	if err != nil {
		return Ebook{}, err
	}
	chaptersJSON, err := json.Marshal(book.Chapters)
	if err != nil {
		return Ebook{}, err
	}
	var id string
	var createdAt time.Time
	err = s.pool.QueryRow(ctx, `
		INSERT INTO "Ebook" ("id", "ownerId", "title", "author", "language", "chapters", "chapterCount", "cover", "coverMime", "fileSha", "sizeBytes", "createdAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1::uuid, $2, $3, $4, $5, $6, $7, NULLIF($8, ''), $9, $10, $11, $11)
		ON CONFLICT ("ownerId", "fileSha") DO NOTHING
		RETURNING "id", "createdAt"`,
		userID, book.Title, book.Author, book.Language, string(chaptersJSON),
		len(book.Chapters), book.Cover, book.CoverMime, book.FileSha, book.SizeBytes, now.UTC()).Scan(&id, &createdAt)
	if err != nil {
		// 0 ligne = conflit (doublon) → 409 explicite (l'utilisateur le
		// retrouve dans sa liste). Toute autre erreur remonte telle quelle
		// (jamais masquée en doublon).
		if errors.Is(err, pgx.ErrNoRows) {
			return Ebook{}, ErrEbookDuplicate
		}
		return Ebook{}, err
	}
	return Ebook{ID: id, Title: book.Title, Author: book.Author, Language: book.Language,
		ChapterCount: len(book.Chapters), HasCover: len(book.Cover) > 0,
		CreatedAt: createdAt.UTC().Format(time.RFC3339)}, nil
}

// List renvoie la bibliothèque (sans blobs — les couvertures passent par
// Cover, les chapitres par Get).
func (s *Service) List(ctx context.Context, userID string, limit, offset int) ([]Ebook, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.pool.Query(ctx, `
		SELECT "id", "title", "author", "language", "chapterCount",
		       ("cover" IS NOT NULL), "progressChapter", "progressPct", "progressParagraph", "createdAt"
		FROM "Ebook" WHERE "ownerId" = $1::uuid
		ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Ebook{}
	for rows.Next() {
		var e Ebook
		var createdAt time.Time
		if err := rows.Scan(&e.ID, &e.Title, &e.Author, &e.Language, &e.ChapterCount,
			&e.HasCover, &e.Progress, &e.ProgressPct, &e.ProgressParagraph, &createdAt); err != nil {
			return nil, err
		}
		e.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		items = append(items, e)
	}
	return items, rows.Err()
}

// Get relit un livre AVEC ses chapitres (lecture). Strictement personnel :
// pas à vous = introuvable (pas de fuite).
func (s *Service) Get(ctx context.Context, userID, id string) (EbookDetail, error) {
	var d EbookDetail
	var chaptersJSON string
	var createdAt time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT "id", "title", "author", "language", "chapterCount",
		       ("cover" IS NOT NULL), "progressChapter", "progressPct", "progressParagraph", "createdAt", "chapters"
		FROM "Ebook" WHERE "id" = $1 AND "ownerId" = $2::uuid`,
		id, userID).Scan(
		&d.ID, &d.Title, &d.Author, &d.Language, &d.ChapterCount,
		&d.HasCover, &d.Progress, &d.ProgressPct, &d.ProgressParagraph, &createdAt, &chaptersJSON)
	if err != nil {
		return EbookDetail{}, ErrEbookNotFound
	}
	// JSON corrompu (ne devrait jamais arriver — écrit par nous) : log +
	// erreur générique (500 côté route). Masquer une corruption en 404
	// serait malhonnête — et empêcherait de la détecter.
	if err := json.Unmarshal([]byte(chaptersJSON), &d.Chapters); err != nil {
		log.Printf("[ebooks] chapitres illisibles %s: %v", id, err)
		return EbookDetail{}, err
	}
	d.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	return d, nil
}

// Cover renvoie (octets, mime) de la couverture (pas à vous = introuvable).
func (s *Service) Cover(ctx context.Context, userID, id string) ([]byte, string, error) {
	var data []byte
	var mime string
	err := s.pool.QueryRow(ctx,
		`SELECT "cover", COALESCE("coverMime", 'image/jpeg') FROM "Ebook" WHERE "id" = $1 AND "ownerId" = $2::uuid`,
		id, userID).Scan(&data, &mime)
	if err != nil || len(data) == 0 {
		return nil, "", ErrEbookNotFound
	}
	return data, mime, nil
}

// SetProgress enregistre la progression (chapitre + % + paragraphe visible —
// bornés par CHECK, clampés ici aussi pour un refus propre avant la base).
// Base de la synchro multi-appareils P1 : le client pousse, le serveur garde
// (last-write-wins assumé et documenté — pas de fusion vectorielle à cette
// échelle).
func (s *Service) SetProgress(ctx context.Context, userID, id string, chapter, pct, paragraph int) error {
	if chapter < 0 {
		chapter = 0
	}
	if pct < 0 {
		pct = 0
	}
	if pct > 100 {
		pct = 100
	}
	if paragraph < 0 {
		paragraph = 0
	}
	tag, err := s.pool.Exec(ctx, `
		UPDATE "Ebook" SET "progressChapter" = $3, "progressPct" = $4, "progressParagraph" = $5, "updatedAt" = now()
		WHERE "id" = $1 AND "ownerId" = $2::uuid`, id, userID, chapter, pct, paragraph)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrEbookNotFound
	}
	return nil
}

// OfflinePack : le livre prêt à emporter (chapitres + métadonnées), dans une
// enveloppe versionnée. Réservé à Plus (403), strictement personnel (404).
// Différence assumée avec le pack d'article : pas de « droit auteur » ici —
// c'est TON fichier, tu l'as importé ; le seul droit en jeu est l'abonnement.
func (s *Service) OfflinePack(ctx context.Context, userID, id string) (OfflinePack, error) {
	if !subscriptions.HasPlus(ctx, s.pool, userID, time.Now()) {
		return OfflinePack{}, ErrEbookOfflinePlusRequired
	}
	book, err := s.Get(ctx, userID, id)
	if err != nil {
		return OfflinePack{}, err
	}
	if len(book.Chapters) == 0 {
		return OfflinePack{}, ErrEbookOfflineUnavailable
	}
	return OfflinePack{
		Version:     OfflinePackVersion,
		GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		Book:        book,
	}, nil
}

// OfflinePack est l'enveloppe téléchargée par le client (versionnée).
type OfflinePack struct {
	Version     int         `json:"version"`
	GeneratedAt string      `json:"generatedAt"`
	Book        EbookDetail `json:"book"`
}

// Delete supprime (livre + notes en cascade par FK ; le brut n'a jamais été
// stocké, rien d'autre à purger).
func (s *Service) Delete(ctx context.Context, userID, id string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM "Ebook" WHERE "id" = $1 AND "ownerId" = $2::uuid`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrEbookNotFound
	}
	return nil
}
