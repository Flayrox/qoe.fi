package main

import "testing"

func TestAnalyzeGalleryHTML_DetectsLegacyCorruption(t *testing.T) {
	content := `<p>intro</p>` +
		`<div data-image-gallery="true">` +
		`<img data-gallery-image="true" alt="">` +
		`</div>` +
		`<img src="https://cdn.qoe.fi/a.jpg" alt="">`

	f := analyzeGalleryHTML(content)
	if f.Galleries != 1 {
		t.Fatalf("galeries = %d, attendu 1", f.Galleries)
	}
	if f.GalleryImages != 1 {
		t.Fatalf("images de galerie = %d, attendu 1", f.GalleryImages)
	}
	if f.MissingSrc != 1 {
		t.Fatalf("images sans src = %d, attendu 1", f.MissingSrc)
	}
	if f.DuplicateAfter != 1 {
		t.Fatalf("doublons après galerie = %d, attendu 1", f.DuplicateAfter)
	}
	if !f.Suspicious {
		t.Fatal("l'article corrompu doit être marqué suspect")
	}
}

func TestAnalyzeGalleryHTML_HealthyGalleryWithAdjacentImage(t *testing.T) {
	content := `<div data-image-gallery="true">` +
		`<img data-gallery-image="true" src="https://cdn.qoe.fi/a.jpg" alt="A">` +
		`<img data-gallery-image="true" src="https://cdn.qoe.fi/b.jpg" alt="B">` +
		`</div>` +
		`<img src="https://cdn.qoe.fi/c.jpg" alt="C">`

	f := analyzeGalleryHTML(content)
	if f.Galleries != 1 || f.GalleryImages != 2 {
		t.Fatalf("galerie inattendue: %+v", f)
	}
	if f.MissingSrc != 0 || f.EmptyGalleries != 0 || f.DuplicateAfter != 0 {
		t.Fatalf("galerie saine marquée suspecte: %+v", f)
	}
	if f.Suspicious {
		t.Fatal("une image volontaire après une galerie saine ne doit pas être suspecte")
	}
}

func TestAnalyzeGalleryHTML_EmptyGallery(t *testing.T) {
	f := analyzeGalleryHTML(`<div data-image-gallery="true"></div>`)
	if f.EmptyGalleries != 1 {
		t.Fatalf("galeries vides = %d, attendu 1", f.EmptyGalleries)
	}
	if !f.Suspicious {
		t.Fatal("une galerie vide doit être suspecte")
	}
}

func TestAnalyzeGalleryHTML_NoGallery(t *testing.T) {
	f := analyzeGalleryHTML(`<p>Texte</p><img src="https://cdn.qoe.fi/x.jpg" alt="X">`)
	if f.Galleries != 0 || f.Suspicious {
		t.Fatalf("contenu sans galerie: %+v", f)
	}
}
