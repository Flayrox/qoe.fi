package netguard

import (
	"bytes"
	"encoding/binary"
	"net/http"

	"github.com/qoefi/api/internal/observability"
)

// allowedImageMIMEs associe chaque type MIME autorisé à son extension canonique.
var allowedImageMIMEs = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/gif":  "gif",
	"image/webp": "webp",
	"image/avif": "avif",
}

// SniffImageMIME inspecte exclusivement les magic bytes de data (sans jamais
// faire confiance au Content-Type client) et n'autorise que JPEG, PNG, GIF,
// WebP et AVIF. Les payloads vides, HTML, SVG, XML ou JS sont rejetés.
func SniffImageMIME(data []byte) (mime string, ext string, ok bool) {
	if len(data) == 0 {
		observability.Default().IncMediaMIMERejected()
		return "", "", false
	}

	head := data
	if len(head) > 512 {
		head = head[:512]
	}

	// Rejet explicite des contenus textuels/balisés (SVG, HTML, XML) avant tout sniffing.
	trimmed := bytes.TrimSpace(bytes.TrimPrefix(head, []byte("\xef\xbb\xbf")))
	if len(trimmed) > 0 && trimmed[0] == '<' {
		observability.Default().IncMediaMIMERejected()
		return "", "", false
	}

	if isWebP(head) {
		return "image/webp", "webp", true
	}
	if isAVIF(head) {
		return "image/avif", "avif", true
	}

	detected := http.DetectContentType(head)
	ext, ok = allowedImageMIMEs[detected]
	if !ok {
		observability.Default().IncMediaMIMERejected()
		return "", "", false
	}
	return detected, ext, true
}

func isWebP(head []byte) bool {
	return len(head) >= 12 &&
		bytes.Equal(head[0:4], []byte("RIFF")) &&
		bytes.Equal(head[8:12], []byte("WEBP"))
}

// isAVIF détecte les en-têtes ISO BMFF (box `ftyp` de marque `avif`/`avis`,
// y compris dans les marques compatibles lorsque la marque majeure est `mif1`/`msf1`).
func isAVIF(head []byte) bool {
	if len(head) < 12 || !bytes.Equal(head[4:8], []byte("ftyp")) {
		return false
	}
	major := head[8:12]
	if isAVIFBrand(major) {
		return true
	}
	if !bytes.Equal(major, []byte("mif1")) && !bytes.Equal(major, []byte("msf1")) {
		return false
	}

	boxSize := int(binary.BigEndian.Uint32(head[0:4]))
	limit := len(head)
	if boxSize >= 16 && boxSize < limit {
		limit = boxSize
	}
	for offset := 16; offset+4 <= limit; offset += 4 {
		if isAVIFBrand(head[offset : offset+4]) {
			return true
		}
	}
	return false
}

func isAVIFBrand(brand []byte) bool {
	return bytes.Equal(brand, []byte("avif")) || bytes.Equal(brand, []byte("avis"))
}
