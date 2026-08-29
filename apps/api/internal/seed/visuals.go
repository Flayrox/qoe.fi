package seed

import (
	"embed"
	"encoding/base64"
	"fmt"
	"path/filepath"
	"strings"
)

//go:embed all:assets
var visualFiles embed.FS

// visualAsset décrit une image embarquée dans le binaire du seed.
type visualAsset struct {
	URL  string
	Kind string
	Alt  string
}

// Les visuels sont volontairement classés par usage. On évite ainsi de
// donner le même portrait à toute une timeline : chaque identité garde une
// empreinte visuelle stable, mais le catalogue reste varié (photo, dessin,
// pixel art, paysage, bureau, nature).
func embeddedVisual(path, mime string) string {
	data, err := visualFiles.ReadFile(filepath.ToSlash(path))
	if err != nil {
		return ""
	}
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

var topVisualAssets = []visualAsset{
	{URL: embeddedVisual("assets/portrait-1.jpg", "image/jpeg"), Kind: "realistic_portrait", Alt: "Portrait éditorial féminin"},
	{URL: embeddedVisual("assets/portrait-2.jpg", "image/jpeg"), Kind: "realistic_portrait", Alt: "Portrait éditorial masculin"},
	{URL: embeddedVisual("assets/portrait-3.jpg", "image/jpeg"), Kind: "realistic_portrait", Alt: "Portrait naturel"},
	{URL: embeddedVisual("assets/portrait-4.jpg", "image/jpeg"), Kind: "realistic_portrait", Alt: "Portrait urbain"},
	{URL: embeddedVisual("assets/avatar-1.svg", "image/svg+xml"), Kind: "illustrated_avatar", Alt: "Avatar illustré Ambre"},
	{URL: embeddedVisual("assets/avatar-2.svg", "image/svg+xml"), Kind: "illustrated_avatar", Alt: "Avatar illustré Noé"},
	{URL: embeddedVisual("assets/avatar-3.svg", "image/svg+xml"), Kind: "pixel_avatar", Alt: "Avatar pixel Clara"},
	{URL: embeddedVisual("assets/avatar-4.svg", "image/svg+xml"), Kind: "illustrated_avatar", Alt: "Avatar illustré Raphaël"},
	{URL: embeddedVisual("assets/landscape-1.jpg", "image/jpeg"), Kind: "editorial_landscape", Alt: "Paysage nocturne éditorial"},
	{URL: embeddedVisual("assets/landscape-2.jpg", "image/jpeg"), Kind: "editorial_workspace", Alt: "Espace de travail éditorial"},
	{URL: embeddedVisual("assets/landscape-3.jpg", "image/jpeg"), Kind: "technology", Alt: "Technologie et création"},
	{URL: embeddedVisual("assets/landscape-4.jpg", "image/jpeg"), Kind: "ecology", Alt: "Forêt et écologie"},
}

var visualGroups = map[string][]visualAsset{
	"avatar": {
		topVisualAssets[0], topVisualAssets[1], topVisualAssets[2], topVisualAssets[3],
		topVisualAssets[4], topVisualAssets[5], topVisualAssets[6], topVisualAssets[7],
	},
	"cover": {
		topVisualAssets[8], topVisualAssets[9], topVisualAssets[10], topVisualAssets[11],
	},
}

func visualGroupFor(kind string) string {
	switch kind {
	case "editorial_landscape", "editorial_workspace", "technology", "ecology":
		return "cover"
	default:
		return "avatar"
	}
}

func visualFor(index int, kind string) visualAsset {
	assets := visualGroups[visualGroupFor(kind)]
	if len(assets) == 0 {
		return visualAsset{URL: "", Kind: kind, Alt: "Visuel qoe.fi"}
	}
	// Une identité reçoit un choix stable dans tout le catalogue avatar. Pour
	// les couvertures, le kind sert seulement de préférence : il n'y a pas assez
	// de photos de chaque sous-type pour l'imposer sans répétitions.
	if kind == "" {
		return assets[index%len(assets)]
	}
	for offset := 0; offset < len(assets); offset++ {
		asset := assets[(index+offset)%len(assets)]
		if asset.Kind == kind {
			return asset
		}
	}
	return assets[index%len(assets)]
}

func visualURL(index int, kind string) string {
	url := visualFor(index, kind).URL
	if url == "" {
		return fmt.Sprintf("data:image/svg+xml,%s", base64.StdEncoding.EncodeToString([]byte(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="100%" height="100%" fill="#c5a880"/></svg>`)))
	}
	return url
}

// ---------------------------------------------------------------------------
// 📸 Catalogue de photos de profil réelles (assets/avatars/*).
//
// Le dossier est auto-découvert à l'init : dépose de nouvelles photos
// (m-N.jpg, w-N.jpg, u-N.jpg ou n'importe quel nom) dans
// apps/api/internal/seed/assets/avatars/ et elles sont embarquées au build.
// Le préfixe du nom de fichier pilote le bucket de genre :
//
//	m-*  homme      w-*  femme      u-* / autre  genre inconnu
// ---------------------------------------------------------------------------

type avatarBucket int

const (
	avatarMale avatarBucket = iota
	avatarFemale
	avatarUnknown
)

// avatarCatalog trie les photos embarquées par genre ET par thème (foot,
// gaming, anime…) et les mélange une fois (ordre stable, déterministe) pour
// servir une distribution sans paquets. Les thèmes vivent dans
// assets/avatars/themed/<theme>/ et priment sur le bucket de genre : un compte
// « foot » reçoit une photo de foot, un compte « anime » une photo manga…
type avatarCatalog struct {
	buckets [3][]string
	pos     [3]int
	themes  map[string][]string
	tpos    map[string]int
}

func avatarBucketOf(name string) avatarBucket {
	base := strings.ToLower(name)
	switch {
	case strings.HasPrefix(base, "m-"):
		return avatarMale
	case strings.HasPrefix(base, "w-"):
		return avatarFemale
	default:
		return avatarUnknown
	}
}

func loadAvatarCatalog() *avatarCatalog {
	c := &avatarCatalog{themes: map[string][]string{}, tpos: map[string]int{}}
	entries, err := visualFiles.ReadDir("assets/avatars")
	if err != nil {
		return c
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() {
			// Dossier de photos thématiques : assets/avatars/themed/<theme>/.
			if name == "themed" {
				loadAvatarThemes(c)
			}
			continue
		}
		if !isImageExt(name) {
			continue
		}
		data, err := visualFiles.ReadFile("assets/avatars/" + name)
		if err != nil || len(data) == 0 {
			continue
		}
		url := "data:" + mimeOf(name) + ";base64," + base64.StdEncoding.EncodeToString(data)
		b := avatarBucketOf(name)
		c.buckets[b] = append(c.buckets[b], url)
	}
	// Mélange stable (même seed → même ordre à chaque lancement).
	rng := newPRNG(0xC0FFEE)
	for i := range c.buckets {
		for j := len(c.buckets[i]) - 1; j > 0; j-- {
			k := rng.intn(j + 1)
			c.buckets[i][j], c.buckets[i][k] = c.buckets[i][k], c.buckets[i][j]
		}
	}
	for theme := range c.themes {
		for j := len(c.themes[theme]) - 1; j > 0; j-- {
			k := rng.intn(j + 1)
			c.themes[theme][j], c.themes[theme][k] = c.themes[theme][k], c.themes[theme][j]
		}
	}
	return c
}

func loadAvatarThemes(c *avatarCatalog) {
	themes, err := visualFiles.ReadDir("assets/avatars/themed")
	if err != nil {
		return
	}
	for _, t := range themes {
		if !t.IsDir() {
			continue
		}
		theme := t.Name()
		files, err := visualFiles.ReadDir("assets/avatars/themed/" + theme)
		if err != nil {
			continue
		}
		for _, f := range files {
			if f.IsDir() || !isImageExt(f.Name()) {
				continue
			}
			data, err := visualFiles.ReadFile("assets/avatars/themed/" + theme + "/" + f.Name())
			if err != nil || len(data) == 0 {
				continue
			}
			url := "data:" + mimeOf(f.Name()) + ";base64," + base64.StdEncoding.EncodeToString(data)
			c.themes[theme] = append(c.themes[theme], url)
		}
	}
}

func isImageExt(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif":
		return true
	}
	return false
}

func mimeOf(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".svg":
		return "image/svg+xml"
	case ".avif":
		return "image/avif"
	}
	return "application/octet-stream"
}

// avatarCatalogForGender retourne le bucket le plus cohérent pour un genre
// (« FEMALE » → femmes, « MALE » → hommes, sinon bucket mixte).
func (c *avatarCatalog) bucketForGender(gender string) avatarBucket {
	switch gender {
	case "FEMALE":
		return avatarFemale
	case "MALE":
		return avatarMale
	default:
		return avatarUnknown
	}
}

// pick sert la prochaine photo : celle du thème du persona si le thème a des
// photos (foot, gaming…), sinon celle du bucket de genre. On cycle pour éviter
// que deux comptes consécutifs reçoivent la même image.
func (c *avatarCatalog) pick(gender, theme string) string {
	if theme != "" {
		if pool := c.themes[theme]; len(pool) > 0 {
			url := pool[c.tpos[theme]%len(pool)]
			c.tpos[theme]++
			return url
		}
	}
	b := c.bucketForGender(gender)
	pool := c.buckets[b]
	if len(pool) == 0 {
		// Repli : n'importe quel bucket non vide.
		for _, alt := range []avatarBucket{avatarUnknown, avatarMale, avatarFemale} {
			if len(c.buckets[alt]) > 0 {
				pool = c.buckets[alt]
				b = alt
				break
			}
		}
	}
	if len(pool) == 0 {
		return visualURL(0, "")
	}
	url := pool[c.pos[b]%len(pool)]
	c.pos[b]++
	return url
}
