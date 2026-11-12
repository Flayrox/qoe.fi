// Package resilience fournit des primitives de résilience (circuit breaker)
// pour protéger les appels vers des dépendances externes (Umami, etc.).
package resilience

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/qoefi/api/internal/observability"
)

// State représente l'état courant d'un circuit breaker.
type State string

const (
	StateClosed   State = "closed"
	StateOpen     State = "open"
	StateHalfOpen State = "half_open"
)

// ErrCircuitOpen est retournée immédiatement lorsque le circuit est ouvert
// ou que le quota de sondes half-open est atteint.
var ErrCircuitOpen = errors.New("resilience: circuit breaker is open")

const (
	defaultFailureThreshold  = 5
	defaultCooldown          = 30 * time.Second
	defaultHalfOpenMaxProbes = 2
	defaultCallTimeout       = 5 * time.Second
)

// Options configure un CircuitBreaker.
type Options struct {
	Name              string
	FailureThreshold  int
	Cooldown          time.Duration
	HalfOpenMaxProbes int
	CallTimeout       time.Duration
	Now               func() time.Time
	Registry          *observability.Registry
}

// CircuitBreaker implémente une machine à états thread-safe (Closed/Open/HalfOpen)
// avec délai d'attente par appel et intégration métriques Prometheus.
type CircuitBreaker struct {
	opts    Options
	now     func() time.Time
	metrics *observability.Registry

	mu                  sync.Mutex
	state               State
	consecutiveFailures int
	openedAt            time.Time
	halfOpenProbes      int
	halfOpenSuccesses   int
	generation          uint64
}

// NewCircuitBreaker crée un circuit breaker prêt à l'emploi avec les valeurs
// par défaut pour les options non renseignées.
func NewCircuitBreaker(opts Options) *CircuitBreaker {
	if opts.Name == "" {
		opts.Name = "default"
	}
	if opts.FailureThreshold <= 0 {
		opts.FailureThreshold = defaultFailureThreshold
	}
	if opts.Cooldown <= 0 {
		opts.Cooldown = defaultCooldown
	}
	if opts.HalfOpenMaxProbes <= 0 {
		opts.HalfOpenMaxProbes = defaultHalfOpenMaxProbes
	}
	if opts.CallTimeout <= 0 {
		opts.CallTimeout = defaultCallTimeout
	}
	nowFn := opts.Now
	if nowFn == nil {
		nowFn = time.Now
	}
	reg := opts.Registry
	if reg == nil {
		reg = observability.Default()
	}

	cb := &CircuitBreaker{
		opts:    opts,
		now:     nowFn,
		metrics: reg,
		state:   StateClosed,
	}
	cb.metrics.SetCircuitBreakerState(cb.opts.Name, string(StateClosed))
	return cb
}

// State retourne l'état courant du circuit breaker.
func (cb *CircuitBreaker) State() State {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	return cb.state
}

// Execute exécute fn sous la garde du circuit breaker et du CallTimeout configuré.
func (cb *CircuitBreaker) Execute(ctx context.Context, fn func(context.Context) error) error {
	gen, err := cb.beforeCall()
	if err != nil {
		return err
	}

	callCtx := ctx
	var cancel context.CancelFunc
	if cb.opts.CallTimeout > 0 {
		callCtx, cancel = context.WithTimeout(ctx, cb.opts.CallTimeout)
		defer cancel()
	}

	done := make(chan error, 1)
	go func() {
		done <- fn(callCtx)
	}()

	select {
	case err = <-done:
	case <-callCtx.Done():
		err = callCtx.Err()
	}

	cb.afterCall(gen, err)
	return err
}

func (cb *CircuitBreaker) beforeCall() (uint64, error) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateOpen:
		if cb.now().Sub(cb.openedAt) < cb.opts.Cooldown {
			return 0, ErrCircuitOpen
		}
		cb.state = StateHalfOpen
		cb.halfOpenProbes = 0
		cb.halfOpenSuccesses = 0
		cb.generation++
		cb.metrics.SetCircuitBreakerState(cb.opts.Name, string(StateHalfOpen))
		fallthrough

	case StateHalfOpen:
		if cb.halfOpenProbes >= cb.opts.HalfOpenMaxProbes {
			return 0, ErrCircuitOpen
		}
		cb.halfOpenProbes++
		return cb.generation, nil

	default:
		return cb.generation, nil
	}
}

func (cb *CircuitBreaker) afterCall(gen uint64, err error) {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	if gen != cb.generation {
		return
	}

	if err == nil {
		switch cb.state {
		case StateClosed:
			cb.consecutiveFailures = 0
		case StateHalfOpen:
			cb.halfOpenSuccesses++
			if cb.halfOpenSuccesses >= cb.opts.HalfOpenMaxProbes {
				cb.state = StateClosed
				cb.consecutiveFailures = 0
				cb.halfOpenProbes = 0
				cb.halfOpenSuccesses = 0
				cb.generation++
				cb.metrics.SetCircuitBreakerState(cb.opts.Name, string(StateClosed))
			}
		}
		return
	}

	switch cb.state {
	case StateClosed:
		cb.consecutiveFailures++
		if cb.consecutiveFailures >= cb.opts.FailureThreshold {
			cb.tripToOpenLocked()
		}
	case StateHalfOpen:
		cb.tripToOpenLocked()
	}
}

func (cb *CircuitBreaker) tripToOpenLocked() {
	cb.state = StateOpen
	cb.openedAt = cb.now()
	cb.consecutiveFailures = 0
	cb.halfOpenProbes = 0
	cb.halfOpenSuccesses = 0
	cb.generation++
	cb.metrics.SetCircuitBreakerState(cb.opts.Name, string(StateOpen))
	cb.metrics.IncCircuitBreakerTrip(cb.opts.Name)
}
