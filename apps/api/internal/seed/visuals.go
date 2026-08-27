package seed

import (
	"embed"
	"encoding/base64"
	"fmt"
	"path/filepath"
)

//go:embed assets/*
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
