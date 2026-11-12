package netguard

import "testing"

func TestSniffImageMIME_Valid(t *testing.T) {
	cases := []struct {
		name     string
		data     []byte
		wantMIME string
		wantExt  string
	}{
		{
			name:     "jpeg",
			data:     []byte("\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"),
			wantMIME: "image/jpeg",
			wantExt:  "jpg",
		},
		{
			name:     "png",
			data:     []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"),
			wantMIME: "image/png",
			wantExt:  "png",
		},
		{
			name:     "gif87a",
			data:     []byte("GIF87a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"),
			wantMIME: "image/gif",
			wantExt:  "gif",
		},
		{
			name:     "gif89a",
			data:     []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;"),
			wantMIME: "image/gif",
			wantExt:  "gif",
		},
		{
			name:     "webp vp8",
			data:     []byte("RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00"),
			wantMIME: "image/webp",
			wantExt:  "webp",
		},
		{
			name:     "webp minimal",
			data:     []byte("RIFF\x00\x00\x00\x00WEBP"),
			wantMIME: "image/webp",
			wantExt:  "webp",
		},
		{
			name:     "avif ftypavif",
			data:     []byte("\x00\x00\x00\x1cftypavif\x00\x00\x00\x00avifmif1miaf"),
			wantMIME: "image/avif",
			wantExt:  "avif",
		},
		{
			name:     "avif ftypavis",
			data:     []byte("\x00\x00\x00\x18ftypavis\x00\x00\x00\x00avismsf1"),
			wantMIME: "image/avif",
			wantExt:  "avif",
		},
		{
			name:     "avif mif1 compatible",
			data:     []byte("\x00\x00\x00\x1cftypmif1\x00\x00\x00\x00miafavif"),
			wantMIME: "image/avif",
			wantExt:  "avif",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mime, ext, ok := SniffImageMIME(tc.data)
			if !ok {
				t.Fatalf("SniffImageMIME(%s) ok=false, attendu true", tc.name)
			}
			if mime != tc.wantMIME || ext != tc.wantExt {
				t.Fatalf("SniffImageMIME(%s) = (%q, %q), attendu (%q, %q)", tc.name, mime, ext, tc.wantMIME, tc.wantExt)
			}
		})
	}
}

func TestSniffImageMIME_Rejected(t *testing.T) {
	cases := []struct {
		name string
		data []byte
	}{
		{"nil", nil},
		{"vide", []byte{}},
		{"html", []byte("<html><body><script>alert(1)</script></body></html>")},
		{"html avec espaces", []byte("   \n<!DOCTYPE html><html></html>")},
		{"svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)},
		{"xml svg", []byte("\xef\xbb\xbf<?xml version=\"1.0\"?><svg></svg>")},
		{"javascript", []byte("console.log('xss');")},
		{"texte brut", []byte("ceci n'est pas un png")},
		{"pdf", []byte("%PDF-1.4\n%...")},
		{"riff non-webp (wav)", []byte("RIFF\x24\x00\x00\x00WAVEfmt ")},
		{"heic non autorise", []byte("\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic")},
		{"mp4 non autorise", []byte("\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isommp41")},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			mime, ext, ok := SniffImageMIME(tc.data)
			if ok || mime != "" || ext != "" {
				t.Fatalf("SniffImageMIME(%s) = (%q, %q, %v), attendu rejet", tc.name, mime, ext, ok)
			}
		})
	}
}
