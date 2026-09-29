package ebooks

// Bornage des notes : logique PURE (aucune DB) — les règles qui décident de
// ce qu'on accepte, tronque ou refuse sont vérifiées ici, les gardes
// d'appartenance en base sont couvertes par le contrat routeur.

import (
	"errors"
	"strings"
	"testing"
)

func TestNormalizeNote_Rules(t *testing.T) {
	t.Run("passage seul accepté", func(t *testing.T) {
		got, err := normalizeNote(NoteInput{Excerpt: "  un passage  "})
		if err != nil {
			t.Fatalf("err = %v", err)
		}
		if got.Excerpt != "un passage" {
			t.Fatalf("extrait trimé attendu, obtenu %q", got.Excerpt)
		}
	})

	t.Run("note seule acceptée", func(t *testing.T) {
		if _, err := normalizeNote(NoteInput{Note: "  à relire  "}); err != nil {
			t.Fatalf("err = %v", err)
		}
	})

	t.Run("les deux vides refusés", func(t *testing.T) {
		for _, in := range []NoteInput{{}, {Excerpt: "   ", Note: "\n"}} {
			if _, err := normalizeNote(in); !errors.Is(err, ErrNoteEmpty) {
				t.Fatalf("attendu ErrNoteEmpty, obtenu %v", err)
			}
		}
	})

	t.Run("extrait tronqué, jamais refusé", func(t *testing.T) {
		got, err := normalizeNote(NoteInput{Excerpt: strings.Repeat("é", MaxNoteExcerpt+50)})
		if err != nil {
			t.Fatalf("err = %v", err)
		}
		if n := len([]rune(got.Excerpt)); n != MaxNoteExcerpt {
			t.Fatalf("extrait borné à %d runes, obtenu %d", MaxNoteExcerpt, n)
		}
	})

	t.Run("note écrite trop longue refusée (jamais coupée)", func(t *testing.T) {
		in := NoteInput{Note: strings.Repeat("a", MaxNoteLength+1)}
		if _, err := normalizeNote(in); !errors.Is(err, ErrNoteTooLong) {
			t.Fatalf("attendu ErrNoteTooLong, obtenu %v", err)
		}
		// Exactement à la borne : accepté.
		if _, err := normalizeNote(NoteInput{Note: strings.Repeat("a", MaxNoteLength)}); err != nil {
			t.Fatalf("borne exacte refusée : %v", err)
		}
	})

	t.Run("titre de chapitre borné au même plafond que les métadonnées", func(t *testing.T) {
		got, err := normalizeNote(NoteInput{Note: "x", ChapterTitle: strings.Repeat("t", 400)})
		if err != nil {
			t.Fatalf("err = %v", err)
		}
		if n := len([]rune(got.ChapterTitle)); n != maxMetadataLength {
			t.Fatalf("titre borné à %d runes, obtenu %d", maxMetadataLength, n)
		}
	})

	t.Run("troncature par runes (pas par octets)", func(t *testing.T) {
		// 3 runes multi-octets : un slice d'octets produirait de l'UTF-8 cassé.
		s := strings.Repeat("é", 10)
		if got := truncateRunes(s, 3); got != "ééé" {
			t.Fatalf("troncature runes attendue, obtenu %q", got)
		}
		if got := truncateRunes("court", 10); got != "court" {
			t.Fatalf("chaîne plus courte modifiée : %q", got)
		}
	})
}
