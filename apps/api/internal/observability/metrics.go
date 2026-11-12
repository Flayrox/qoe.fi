package observability

import (
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// durationBucketsMs définit les bornes (en millisecondes) de l'histogramme HTTP.
var durationBucketsMs = [10]float64{5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000}

type httpReqKey struct {
	method     string
	routeGroup string
	status     int
}

type httpDurKey struct {
	method     string
	routeGroup string
}

type rateLimitKey struct {
	namespace string
	result    string
}

type secGuardKey struct {
	action string
	code   string
}

type histogramSeries struct {
	// buckets[i] compte les observations tombant exactement dans la tranche i
	// (0..9 pour les bornes finies, 10 pour > 5000ms). La somme cumulée est
	// calculée au moment du scrape pour ne faire qu'un seul Add atomique par requête.
	buckets [len(durationBucketsMs) + 1]atomic.Uint64
	sumNs   atomic.Uint64
	count   atomic.Uint64
}

// Registry collecte les métriques applicatives sans dépendance externe et les
// expose au format Prometheus text exposition 0.0.4.
type Registry struct {
	httpRequests        sync.Map // httpReqKey -> *atomic.Uint64
	httpDurations       sync.Map // httpDurKey -> *histogramSeries
	rateLimitDecisions  sync.Map // rateLimitKey -> *atomic.Uint64
	secGuardRejections  sync.Map // secGuardKey -> *atomic.Uint64
	trustTierEvals       sync.Map // string -> *atomic.Uint64
	circuitBreakerStates sync.Map // string -> *atomic.Pointer[string]
	circuitBreakerTrips  sync.Map // string -> *atomic.Uint64
	netGuardSSRFBlocked  atomic.Uint64
	mediaMIMERejected    atomic.Uint64
}

var defaultRegistry = NewRegistry()

// Default retourne le registre global singleton.
func Default() *Registry {
	return defaultRegistry
}

// NewRegistry crée un registre isolé (utile pour les tests unitaires).
func NewRegistry() *Registry {
	return &Registry{}
}

func incCounter(m *sync.Map, key any) {
	if v, ok := m.Load(key); ok {
		v.(*atomic.Uint64).Add(1)
		return
	}
	v, _ := m.LoadOrStore(key, &atomic.Uint64{})
	v.(*atomic.Uint64).Add(1)
}

func (r *Registry) getOrCreateHistogram(key httpDurKey) *histogramSeries {
	if v, ok := r.httpDurations.Load(key); ok {
		return v.(*histogramSeries)
	}
	v, _ := r.httpDurations.LoadOrStore(key, &histogramSeries{})
	return v.(*histogramSeries)
}

// ObserveHTTPRequest enregistre une requête HTTP et sa latence.
func (r *Registry) ObserveHTTPRequest(method, routeGroup string, status int, duration time.Duration) {
	incCounter(&r.httpRequests, httpReqKey{
		method:     method,
		routeGroup: routeGroup,
		status:     status,
	})

	h := r.getOrCreateHistogram(httpDurKey{
		method:     method,
		routeGroup: routeGroup,
	})

	if duration < 0 {
		duration = 0
	}
	ms := float64(duration) / float64(time.Millisecond)
	bucketIdx := len(durationBucketsMs)
	for i, bound := range durationBucketsMs {
		if ms <= bound {
			bucketIdx = i
			break
		}
	}
	h.buckets[bucketIdx].Add(1)
	h.sumNs.Add(uint64(duration.Nanoseconds()))
	h.count.Add(1)
}

// IncRateLimitDecision incrémente le compteur de décisions de rate limiting.
func (r *Registry) IncRateLimitDecision(namespace, result string) {
	incCounter(&r.rateLimitDecisions, rateLimitKey{
		namespace: namespace,
		result:    result,
	})
}

// IncSecGuardRejection incrémente le compteur de rejets SecGuard.
func (r *Registry) IncSecGuardRejection(action, code string) {
	incCounter(&r.secGuardRejections, secGuardKey{
		action: action,
		code:   code,
	})
}

// IncNetGuardSSRFBlocked incrémente le compteur de requêtes bloquées par NetGuard (SSRF).
func (r *Registry) IncNetGuardSSRFBlocked() {
	r.netGuardSSRFBlocked.Add(1)
}

// IncMediaMIMERejected incrémente le compteur de médias rejetés pour type MIME invalide.
func (r *Registry) IncMediaMIMERejected() {
	r.mediaMIMERejected.Add(1)
}

// IncTrustTierEvaluation incrémente le compteur d'évaluations de trust tier.
func (r *Registry) IncTrustTierEvaluation(tier string) {
	incCounter(&r.trustTierEvals, tier)
}

// SetCircuitBreakerState enregistre l'état courant d'un circuit breaker.
func (r *Registry) SetCircuitBreakerState(name, state string) {
	s := state
	if v, ok := r.circuitBreakerStates.Load(name); ok {
		v.(*atomic.Pointer[string]).Store(&s)
		return
	}
	p := &atomic.Pointer[string]{}
	p.Store(&s)
	actual, loaded := r.circuitBreakerStates.LoadOrStore(name, p)
	if loaded {
		actual.(*atomic.Pointer[string]).Store(&s)
	}
}

// IncCircuitBreakerTrip incrémente le compteur de bascules vers l'état open d'un circuit breaker.
func (r *Registry) IncCircuitBreakerTrip(name string) {
	incCounter(&r.circuitBreakerTrips, name)
}

// Handler retourne un http.Handler exposant les métriques au format Prometheus 0.0.4.
func (r *Registry) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(r.Render()))
	})
}

// Render sérialise l'ensemble des métriques de manière déterministe au format Prometheus 0.0.4.
func (r *Registry) Render() string {
	var b strings.Builder

	// 1. qoe_http_requests_total
	b.WriteString("# HELP qoe_http_requests_total Total number of HTTP requests processed.\n")
	b.WriteString("# TYPE qoe_http_requests_total counter\n")
	type httpReqEntry struct {
		key httpReqKey
		val uint64
	}
	var reqEntries []httpReqEntry
	r.httpRequests.Range(func(k, v any) bool {
		reqEntries = append(reqEntries, httpReqEntry{
			key: k.(httpReqKey),
			val: v.(*atomic.Uint64).Load(),
		})
		return true
	})
	slices.SortFunc(reqEntries, func(a, c httpReqEntry) int {
		if cmp := strings.Compare(a.key.method, c.key.method); cmp != 0 {
			return cmp
		}
		if cmp := strings.Compare(a.key.routeGroup, c.key.routeGroup); cmp != 0 {
			return cmp
		}
		return a.key.status - c.key.status
	})
	for _, e := range reqEntries {
		fmt.Fprintf(&b, "qoe_http_requests_total{method=\"%s\",route_group=\"%s\",status=\"%d\"} %d\n",
			escapeLabelValue(e.key.method),
			escapeLabelValue(e.key.routeGroup),
			e.key.status,
			e.val,
		)
	}

	// 2. qoe_http_request_duration_ms
	b.WriteString("# HELP qoe_http_request_duration_ms HTTP request duration in milliseconds.\n")
	b.WriteString("# TYPE qoe_http_request_duration_ms histogram\n")
	type httpDurEntry struct {
		key    httpDurKey
		series *histogramSeries
	}
	var durEntries []httpDurEntry
	r.httpDurations.Range(func(k, v any) bool {
		durEntries = append(durEntries, httpDurEntry{
			key:    k.(httpDurKey),
			series: v.(*histogramSeries),
		})
		return true
	})
	slices.SortFunc(durEntries, func(a, c httpDurEntry) int {
		if cmp := strings.Compare(a.key.method, c.key.method); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.key.routeGroup, c.key.routeGroup)
	})
	for _, e := range durEntries {
		method := escapeLabelValue(e.key.method)
		routeGroup := escapeLabelValue(e.key.routeGroup)
		var cumulative uint64
		for i, bound := range durationBucketsMs {
			cumulative += e.series.buckets[i].Load()
			fmt.Fprintf(&b, "qoe_http_request_duration_ms_bucket{method=\"%s\",route_group=\"%s\",le=\"%s\"} %d\n",
				method, routeGroup, strconv.FormatFloat(bound, 'f', -1, 64), cumulative,
			)
		}
		cumulative += e.series.buckets[len(durationBucketsMs)].Load()
		fmt.Fprintf(&b, "qoe_http_request_duration_ms_bucket{method=\"%s\",route_group=\"%s\",le=\"+Inf\"} %d\n",
			method, routeGroup, cumulative,
		)
		sumMs := float64(e.series.sumNs.Load()) / float64(time.Millisecond)
		fmt.Fprintf(&b, "qoe_http_request_duration_ms_sum{method=\"%s\",route_group=\"%s\"} %s\n",
			method, routeGroup, strconv.FormatFloat(sumMs, 'f', -1, 64),
		)
		fmt.Fprintf(&b, "qoe_http_request_duration_ms_count{method=\"%s\",route_group=\"%s\"} %d\n",
			method, routeGroup, e.series.count.Load(),
		)
	}

	// 3. qoe_ratelimit_decisions_total
	b.WriteString("# HELP qoe_ratelimit_decisions_total Total number of rate limit decisions.\n")
	b.WriteString("# TYPE qoe_ratelimit_decisions_total counter\n")
	type rlEntry struct {
		key rateLimitKey
		val uint64
	}
	var rlEntries []rlEntry
	r.rateLimitDecisions.Range(func(k, v any) bool {
		rlEntries = append(rlEntries, rlEntry{
			key: k.(rateLimitKey),
			val: v.(*atomic.Uint64).Load(),
		})
		return true
	})
	slices.SortFunc(rlEntries, func(a, c rlEntry) int {
		if cmp := strings.Compare(a.key.namespace, c.key.namespace); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.key.result, c.key.result)
	})
	for _, e := range rlEntries {
		fmt.Fprintf(&b, "qoe_ratelimit_decisions_total{namespace=\"%s\",result=\"%s\"} %d\n",
			escapeLabelValue(e.key.namespace),
			escapeLabelValue(e.key.result),
			e.val,
		)
	}

	// 4. qoe_secguard_rejections_total
	b.WriteString("# HELP qoe_secguard_rejections_total Total number of SecGuard rejections.\n")
	b.WriteString("# TYPE qoe_secguard_rejections_total counter\n")
	type sgEntry struct {
		key secGuardKey
		val uint64
	}
	var sgEntries []sgEntry
	r.secGuardRejections.Range(func(k, v any) bool {
		sgEntries = append(sgEntries, sgEntry{
			key: k.(secGuardKey),
			val: v.(*atomic.Uint64).Load(),
		})
		return true
	})
	slices.SortFunc(sgEntries, func(a, c sgEntry) int {
		if cmp := strings.Compare(a.key.action, c.key.action); cmp != 0 {
			return cmp
		}
		return strings.Compare(a.key.code, c.key.code)
	})
	for _, e := range sgEntries {
		fmt.Fprintf(&b, "qoe_secguard_rejections_total{action=\"%s\",code=\"%s\"} %d\n",
			escapeLabelValue(e.key.action),
			escapeLabelValue(e.key.code),
			e.val,
		)
	}

	// 5. qoe_netguard_ssrf_blocked_total
	b.WriteString("# HELP qoe_netguard_ssrf_blocked_total Total number of outbound requests blocked by NetGuard SSRF protection.\n")
	b.WriteString("# TYPE qoe_netguard_ssrf_blocked_total counter\n")
	fmt.Fprintf(&b, "qoe_netguard_ssrf_blocked_total %d\n", r.netGuardSSRFBlocked.Load())

	// 6. qoe_media_mime_rejected_total
	b.WriteString("# HELP qoe_media_mime_rejected_total Total number of media uploads rejected due to invalid MIME type.\n")
	b.WriteString("# TYPE qoe_media_mime_rejected_total counter\n")
	fmt.Fprintf(&b, "qoe_media_mime_rejected_total %d\n", r.mediaMIMERejected.Load())

	// 7. qoe_trust_tier_evaluations_total
	b.WriteString("# HELP qoe_trust_tier_evaluations_total Total number of trust tier evaluations.\n")
	b.WriteString("# TYPE qoe_trust_tier_evaluations_total counter\n")
	type ttEntry struct {
		tier string
		val  uint64
	}
	var ttEntries []ttEntry
	r.trustTierEvals.Range(func(k, v any) bool {
		ttEntries = append(ttEntries, ttEntry{
			tier: k.(string),
			val:  v.(*atomic.Uint64).Load(),
		})
		return true
	})
	slices.SortFunc(ttEntries, func(a, c ttEntry) int {
		return strings.Compare(a.tier, c.tier)
	})
	for _, e := range ttEntries {
		fmt.Fprintf(&b, "qoe_trust_tier_evaluations_total{tier=\"%s\"} %d\n",
			escapeLabelValue(e.tier),
			e.val,
		)
	}

	// 8. qoe_circuit_breaker_state
	b.WriteString("# HELP qoe_circuit_breaker_state Current state of each circuit breaker (1 = active state).\n")
	b.WriteString("# TYPE qoe_circuit_breaker_state gauge\n")
	type cbStateEntry struct {
		name  string
		state string
	}
	var cbStateEntries []cbStateEntry
	r.circuitBreakerStates.Range(func(k, v any) bool {
		if ptr := v.(*atomic.Pointer[string]).Load(); ptr != nil {
			cbStateEntries = append(cbStateEntries, cbStateEntry{
				name:  k.(string),
				state: *ptr,
			})
		}
		return true
	})
	slices.SortFunc(cbStateEntries, func(a, c cbStateEntry) int {
		return strings.Compare(a.name, c.name)
	})
	for _, e := range cbStateEntries {
		fmt.Fprintf(&b, "qoe_circuit_breaker_state{name=\"%s\",state=\"%s\"} 1\n",
			escapeLabelValue(e.name),
			escapeLabelValue(e.state),
		)
	}

	// 9. qoe_circuit_breaker_trips_total
	b.WriteString("# HELP qoe_circuit_breaker_trips_total Total number of times a circuit breaker tripped to open.\n")
	b.WriteString("# TYPE qoe_circuit_breaker_trips_total counter\n")
	type cbTripEntry struct {
		name string
		val  uint64
	}
	var cbTripEntries []cbTripEntry
	r.circuitBreakerTrips.Range(func(k, v any) bool {
		cbTripEntries = append(cbTripEntries, cbTripEntry{
			name: k.(string),
			val:  v.(*atomic.Uint64).Load(),
		})
		return true
	})
	slices.SortFunc(cbTripEntries, func(a, c cbTripEntry) int {
		return strings.Compare(a.name, c.name)
	})
	for _, e := range cbTripEntries {
		fmt.Fprintf(&b, "qoe_circuit_breaker_trips_total{name=\"%s\"} %d\n",
			escapeLabelValue(e.name),
			e.val,
		)
	}

	return b.String()
}

func escapeLabelValue(s string) string {
	if !strings.ContainsAny(s, "\\\"\n") {
		return s
	}
	r := strings.NewReplacer(
		`\`, `\\`,
		`"`, `\"`,
		"\n", `\n`,
	)
	return r.Replace(s)
}
