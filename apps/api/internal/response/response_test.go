package response

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func exec(f func(w http.ResponseWriter, v any), v any) (int, map[string]any) {
	w := httptest.NewRecorder()
	f(w, v)
	res := w.Result()
	var body map[string]any
	_ = json.NewDecoder(res.Body).Decode(&body)
	return res.StatusCode, body
}

func TestJSON_ContentTypeAndEncode(t *testing.T) {
	w := httptest.NewRecorder()
	JSON(w, 201, map[string]int{"id": 42})
	res := w.Result()
	if ct := res.Header.Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("content-type = %q", ct)
	}
	if res.StatusCode != 201 {
		t.Fatalf("status = %d", res.StatusCode)
	}
	var m map[string]int
	if err := json.NewDecoder(res.Body).Decode(&m); err != nil || m["id"] != 42 {
		t.Fatalf("bad body: %v %+v", err, m)
	}
}

func TestOK(t *testing.T) {
	status, body := exec(OK, map[string]string{"ok": "y"})
	if status != 200 || body["ok"] != "y" {
		t.Fatalf("OK = %d %v", status, body)
	}
}

func TestCreated(t *testing.T) {
	status, _ := exec(Created, nil)
	if status != 201 {
		t.Fatalf("status = %d", status)
	}
}

func TestError(t *testing.T) {
	status, body := exec(func(w http.ResponseWriter, v any) { Error(w, 422, "nope") }, nil)
	if status != 422 {
		t.Fatalf("status = %d", status)
	}
	if body["error"] != "nope" {
		t.Fatalf("body = %v", body)
	}
}

func TestConvenienceErrors(t *testing.T) {
	cases := []struct {
		name string
		fn   func(w http.ResponseWriter, v any)
		want int
	}{
		{"BadRequest", func(w http.ResponseWriter, v any) { BadRequest(w, "x") }, 400},
		{"NotFound", func(w http.ResponseWriter, v any) { NotFound(w, "x") }, 404},
		{"Unauthorized", func(w http.ResponseWriter, v any) { Unauthorized(w, "x") }, 401},
		{"Forbidden", func(w http.ResponseWriter, v any) { Forbidden(w, "x") }, 403},
		{"Internal", func(w http.ResponseWriter, v any) { Internal(w) }, 500},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			status, body := exec(c.fn, nil)
			if status != c.want {
				t.Fatalf("status = %d, attendu %d", status, c.want)
			}
			if msg, _ := body["error"].(string); msg == "" {
				t.Fatalf("error body vide")
			}
		})
	}
}