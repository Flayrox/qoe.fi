package observability

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestDefaultSingleton(t *testing.T) {
	if Default() == nil {
		t.Fatal("Default() ne doit pas être nil")
	}
	if Default() != Default() {
		t.Fatal("Default() doit retourner la même instance singleton")
	}
}

func TestPrometheusExpositionAndHistogramBuckets(t *testing.T) {
	reg := NewRegistry()

	reg.ObserveHTTPRequest("POST", "auth", 200, 3*time.Millisecond)
	reg.ObserveHTTPRequest("POST", "auth", 200, 12*time.Millisecond)
	reg.ObserveHTTPRequest("POST", "auth", 429, 7500*time.Millisecond)
	reg.ObserveHTTPRequest("GET", "articles", 200, 5*time.Millisecond)

	reg.IncRateLimitDecision("api", "allow")
	reg.IncRateLimitDecision("api", "deny")
	reg.IncSecGuardRejection("comment", "turnstile_failed")
	reg.IncNetGuardSSRFBlocked()
	reg.IncNetGuardSSRFBlocked()
	reg.IncMediaMIMERejected()
	reg.IncTrustTierEvaluation("trusted")
	reg.SetCircuitBreakerState("umami", "closed")
	reg.SetCircuitBreakerState("umami", "open")
	reg.IncCircuitBreakerTrip("umami")

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	reg.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status HTTP attendu 200, obtenu %d", rec.Code)
	}
	ct := rec.Header().Get("Content-Type")
	if ct != "text/plain; version=0.0.4; charset=utf-8" {
		t.Fatalf("Content-Type inattendu: %q", ct)
	}

	body := rec.Body.String()
	expectedSubstrings := []string{
		"# HELP qoe_http_requests_total",
		"# TYPE qoe_http_requests_total counter",
		`qoe_http_requests_total{method="GET",route_group="articles",status="200"} 1`,
		`qoe_http_requests_total{method="POST",route_group="auth",status="200"} 2`,
		`qoe_http_requests_total{method="POST",route_group="auth",status="429"} 1`,
		"# TYPE qoe_http_request_duration_ms histogram",
		// POST/auth : 3ms (<=5), 12ms (<=25), 7500ms (>5000, +Inf)
		`qoe_http_request_duration_ms_bucket{method="POST",route_group="auth",le="5"} 1`,
		`qoe_http_request_duration_ms_bucket{method="POST",route_group="auth",le="10"} 1`,
		`qoe_http_request_duration_ms_bucket{method="POST",route_group="auth",le="25"} 2`,
		`qoe_http_request_duration_ms_bucket{method="POST",route_group="auth",le="5000"} 2`,
		`qoe_http_request_duration_ms_bucket{method="POST",route_group="auth",le="+Inf"} 3`,
		`qoe_http_request_duration_ms_sum{method="POST",route_group="auth"} 7515`,
		`qoe_http_request_duration_ms_count{method="POST",route_group="auth"} 3`,
		// Autres métriques
		`qoe_ratelimit_decisions_total{namespace="api",result="allow"} 1`,
		`qoe_ratelimit_decisions_total{namespace="api",result="deny"} 1`,
		`qoe_secguard_rejections_total{action="comment",code="turnstile_failed"} 1`,
		"qoe_netguard_ssrf_blocked_total 2",
		"qoe_media_mime_rejected_total 1",
		`qoe_trust_tier_evaluations_total{tier="trusted"} 1`,
		`qoe_circuit_breaker_state{name="umami",state="open"} 1`,
		`qoe_circuit_breaker_trips_total{name="umami"} 1`,
	}

	for _, want := range expectedSubstrings {
		if !strings.Contains(body, want) {
			t.Errorf("sortie Prometheus manquante %q\n---\n%s", want, body)
		}
	}
}

func TestDeterministicSortingAndLabelEscaping(t *testing.T) {
	reg := NewRegistry()

	// Insertion dans le désordre
	reg.IncRateLimitDecision("z_ns", "deny")
	reg.IncRateLimitDecision("a_ns", "allow")
	reg.IncTrustTierEvaluation(`tier"with\quote` + "\nnewline")

	first := reg.Render()
	for i := 0; i < 10; i++ {
		if got := reg.Render(); got != first {
			t.Fatalf("Render() non déterministe à l'itération %d", i)
		}
	}

	idxA := strings.Index(first, `namespace="a_ns"`)
	idxZ := strings.Index(first, `namespace="z_ns"`)
	if idxA == -1 || idxZ == -1 || idxA >= idxZ {
		t.Fatalf("tri déterministe invalide: idxA=%d idxZ=%d", idxA, idxZ)
	}

	if !strings.Contains(first, `tier="tier\"with\\quote\nnewline"`) {
		t.Fatalf("échappement de label invalide dans:\n%s", first)
	}
}

func TestConcurrencySafety(t *testing.T) {
	reg := NewRegistry()

	const workers = 16
	const iterations = 200

	var wg sync.WaitGroup
	wg.Add(workers + 2)

	for w := 0; w < workers; w++ {
		go func(id int) {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				reg.ObserveHTTPRequest("GET", "feed", 200, time.Duration(i%100)*time.Millisecond)
				reg.IncRateLimitDecision("feed", "allow")
				reg.IncSecGuardRejection("post", "rate_limited")
				reg.IncNetGuardSSRFBlocked()
				reg.IncMediaMIMERejected()
				reg.IncTrustTierEvaluation("standard")
			}
		}(w)
	}

	// Lecteurs concurrents via Handler()
	for r := 0; r < 2; r++ {
		go func() {
			defer wg.Done()
			handler := reg.Handler()
			for i := 0; i < 50; i++ {
				rec := httptest.NewRecorder()
				req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
				handler.ServeHTTP(rec, req)
				if rec.Code != http.StatusOK {
					t.Errorf("status inattendu pendant scrape concurrent: %d", rec.Code)
				}
			}
		}()
	}

	wg.Wait()

	out := reg.Render()
	wantTotal := workers * iterations
	if !strings.Contains(out, "qoe_netguard_ssrf_blocked_total 3200") && wantTotal == 3200 {
		t.Fatalf("compteur SSRF inattendu après concurrence:\n%s", out)
	}
	if !strings.Contains(out, "qoe_media_mime_rejected_total 3200") {
		t.Fatalf("compteur MIME inattendu après concurrence:\n%s", out)
	}
	if !strings.Contains(out, `qoe_http_requests_total{method="GET",route_group="feed",status="200"} 3200`) {
		t.Fatalf("compteur HTTP inattendu après concurrence:\n%s", out)
	}
}
