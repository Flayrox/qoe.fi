package creator

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	db "github.com/qoefi/api/internal/database"
	authmw "github.com/qoefi/api/internal/middleware"
	"github.com/qoefi/api/internal/modules/mediaassets"
	"github.com/qoefi/api/internal/supastorage"
	"github.com/qoefi/api/internal/testutil"
)

// pngMagic est un PNG minimal valide (magic bytes reconnus par
// http.DetectContentType).
var pngMagic = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\x0bIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\x0d\x0a\x2d\xb4\x00\x00\x00\x00IEND\xaeB`\x82")

// jpegMagic est le début d'un JPEG réel (magic bytes \xff\xd8\xff).
var jpegMagic = []byte("\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")

func TestCreatorAPI_MediaUpload(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Storage factice : capture l'appel, répond 200 (bucket public).
	var gotPath, gotCT string
	storageSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotCT = r.Header.Get("Content-Type")
		if gotCT == "" {
			t.Error("Content-Type absent sur l'upload storage")
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"Key":"x"}`))
	}))
	defer storageSrv.Close()

	h := NewHandler(poolTest, nil, "")
	h.WithMediaUpload(supastorage.New(storageSrv.URL, "test-secret"), mediaassets.NewService(poolTest))
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(authmw.APIKeyAuth(db.New(poolTest)))
		h.RegisterAPIKey(api)
	})

	key := insertAPIKey(t, fx.AuthorID, "media", authmw.AllScopes)
	do := func(method, path string, body *bytes.Buffer, ct, bearerKey string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, body)
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		if bearerKey != "" {
			req.Header.Set("Authorization", "Bearer "+bearerKey)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}

	// ── Multipart (champ `file`) → 201 + URL publique + asset en base.
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, err := mw.CreateFormFile("file", "cover.png")
	if err != nil {
		t.Fatalf("formfile: %v", err)
	}
	if _, err := fw.Write(pngMagic); err != nil {
		t.Fatalf("write png: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart: %v", err)
	}

	w := do(http.MethodPost, "/v1/creator/media", &buf, mw.FormDataContentType(), key)
	if w.Code != http.StatusCreated {
		t.Fatalf("upload = %d %s, attendu 201", w.Code, w.Body.String())
	}
	var res struct {
		ID          string `json:"id"`
		URL         string `json:"url"`
		Sha256      string `json:"sha256"`
		StoragePath string `json:"storagePath"`
		MimeType    string `json:"mimeType"`
		SizeBytes   int    `json:"sizeBytes"`
		TargetType  string `json:"targetType"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("json: %v (%s)", err, w.Body.String())
	}
	if res.ID == "" || res.URL == "" || res.Sha256 == "" {
		t.Fatalf("champs manquants : %+v", res)
	}
	if !strings.Contains(res.URL, "/storage/v1/object/public/articles-media/") {
		t.Fatalf("URL publique inattendue : %s", res.URL)
	}
	if !strings.Contains(gotPath, "/storage/v1/object/articles-media/creator/") {
		t.Fatalf("chemin storage inattendu : %s", gotPath)
	}
	if res.MimeType != "image/png" {
		t.Fatalf("mimeType = %q, attendu image/png (détection magic bytes)", res.MimeType)
	}
	if res.TargetType != "ARTICLE_COVER" {
		t.Fatalf("targetType = %q, attendu ARTICLE_COVER", res.TargetType)
	}

	// Asset enregistré dans la médiathèque.
	var n int
	if err := poolTest.QueryRow(ctx,
		`SELECT COUNT(*) FROM "MediaAsset" WHERE "ownerId" = $1 AND "targetType" = 'ARTICLE_COVER'`,
		fx.AuthorID).Scan(&n); err != nil || n != 1 {
		t.Fatalf("assets en base = %d (%v), attendu 1", n, err)
	}

	// ── Body brut (curl --data-binary) avec Content-Type jpeg → 201.
	w = do(http.MethodPost, "/v1/creator/media",
		bytes.NewBuffer(jpegMagic), "image/jpeg", key)
	if w.Code != http.StatusCreated {
		t.Fatalf("upload brut = %d %s, attendu 201", w.Code, w.Body.String())
	}

	// ── Type non supporté → 400.
	w = do(http.MethodPost, "/v1/creator/media",
		bytes.NewBufferString("%PDF-1.4 fake"), "application/pdf", key)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("pdf = %d, attendu 400", w.Code)
	}

	// ── Clé READ seule → 403 (scope WRITE requis).
	roKey := insertAPIKey(t, fx.AuthorID, "media-ro", []string{authmw.ScopeRead})
	w = do(http.MethodPost, "/v1/creator/media",
		bytes.NewBuffer(jpegMagic), "image/jpeg", roKey)
	if w.Code != http.StatusForbidden {
		t.Fatalf("scope READ = %d, attendu 403", w.Code)
	}

	// ── Anonyme → 401.
	w = do(http.MethodPost, "/v1/creator/media",
		bytes.NewBuffer(jpegMagic), "image/jpeg", "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("anonyme = %d, attendu 401", w.Code)
	}
}

func TestCreatorAPI_MediaUpload_Unconfigured(t *testing.T) {
	requirePool(t)
	ctx := context.Background()
	fx, err := testutil.SeedPosts(ctx, poolTest)
	if err != nil {
		t.Fatalf("seed: %v", err)
	}
	// Handler SANS WithMediaUpload : le storage n'est pas branché → 503.
	h := NewHandler(poolTest, nil, "")
	r := chi.NewRouter()
	r.Group(func(api chi.Router) {
		api.Use(authmw.APIKeyAuth(db.New(poolTest)))
		h.RegisterAPIKey(api)
	})
	key := insertAPIKey(t, fx.AuthorID, "media-none", authmw.AllScopes)

	req := httptest.NewRequest(http.MethodPost, "/v1/creator/media", bytes.NewBuffer(jpegMagic))
	req.Header.Set("Content-Type", "image/jpeg")
	req.Header.Set("Authorization", "Bearer "+key)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("non configuré = %d %s, attendu 503", w.Code, w.Body.String())
	}
}

func TestCreatorAPI_MediaUpload_RejectsSpoofedMIME(t *testing.T) {
	h := NewHandler(nil, nil, "")
	h.WithMediaUpload(supastorage.New("https://storage.example.com", "test-secret"), mediaassets.NewService(nil))

	doUpload := func(body *bytes.Buffer, ct string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/v1/creator/media", body)
		req = req.WithContext(context.WithValue(req.Context(), authmw.UserIDKey, "user_test_1"))
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		w := httptest.NewRecorder()
		h.apiMediaUpload(w, req)
		return w
	}

	rawCases := []struct {
		name    string
		payload string
		ct      string
	}{
		{"svg_pretending_png", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`, "image/png"},
		{"html_pretending_jpeg", `<!doctype html><html><script>alert(1)</script></html>`, "image/jpeg"},
		{"js_pretending_webp", `console.log("xss")`, "image/webp"},
		{"empty_pretending_png", ``, "image/png"},
	}

	for _, tc := range rawCases {
		t.Run("raw_"+tc.name, func(t *testing.T) {
			w := doUpload(bytes.NewBufferString(tc.payload), tc.ct)
			if w.Code != http.StatusBadRequest {
				t.Fatalf("raw %s: code = %d (%s), attendu 400", tc.name, w.Code, w.Body.String())
			}
		})
	}

	multipartCases := []struct {
		name    string
		partCT  string
		payload string
	}{
		{"svg_part_image_png", "image/png", `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`},
		{"html_part_image_webp", "image/webp", `<html><body>xss</body></html>`},
		{"text_part_image_avif", "image/avif", `not an avif image`},
	}

	for _, tc := range multipartCases {
		t.Run("multipart_"+tc.name, func(t *testing.T) {
			var buf bytes.Buffer
			mw := multipart.NewWriter(&buf)
			hdr := make(textproto.MIMEHeader)
			hdr.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="evil.%s"`, "png"))
			hdr.Set("Content-Type", tc.partCT)
			pw, err := mw.CreatePart(hdr)
			if err != nil {
				t.Fatalf("CreatePart: %v", err)
			}
			if _, err := pw.Write([]byte(tc.payload)); err != nil {
				t.Fatalf("write part: %v", err)
			}
			if err := mw.Close(); err != nil {
				t.Fatalf("close multipart: %v", err)
			}

			w := doUpload(&buf, mw.FormDataContentType())
			if w.Code != http.StatusBadRequest {
				t.Fatalf("multipart %s: code = %d (%s), attendu 400", tc.name, w.Code, w.Body.String())
			}
		})
	}
}
