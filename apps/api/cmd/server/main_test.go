package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"testing"
	"time"
)

// TestRunGracefulShutdown exerce le cycle de vie complet de run() : pool,
// montage du routeur, ListenAndServe, puis arrêt propre quand ctx est annulé
// (simule SIGINT/SIGTERM sans vraies signaux).
func TestRunGracefulShutdown(t *testing.T) {
	// Port libre garanti : on écoute puis on ferme pour réserver l'adresse.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("port libre: %v", err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()

	t.Setenv("API_DATABASE_URL", poolTest.Config().ConnString())
	t.Setenv("API_PORT", strconv.Itoa(port))
	t.Setenv("REDIS_URL", "redis://127.0.0.1:1") // injoignable mais jamais contacté
	t.Setenv("SUPABASE_JWT_SECRET", routerSecret)
	t.Setenv("QOE_INTERNAL_SECRET", "test-internal-secret")

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- run(ctx)
	}()

	// On attend que l'API réponde vraiment (healthz) avant d'annuler.
	base := fmt.Sprintf("http://127.0.0.1:%d", port)
	var healthy bool
	for i := 0; i < 50; i++ {
		resp, err := http.Get(base + "/healthz")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				healthy = true
				break
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !healthy {
		cancel()
		<-done
		t.Fatal("l'API n'a pas répondu sur /healthz")
	}

	cancel() // simule SIGINT/SIGTERM
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("run = %v, attendu nil (arrêt propre)", err)
		}
	case <-time.After(20 * time.Second):
		t.Fatal("run n'a pas rendu la main après l'annulation du contexte")
	}
}

// TestRunDBConnectError : une URL de base invalide → erreur remontée à main.
func TestRunDBConnectError(t *testing.T) {
	t.Setenv("API_DATABASE_URL", "postgres://invalide:hôte:9999/nope")
	t.Setenv("API_PORT", "0")

	err := run(context.Background())
	if err == nil {
		t.Fatal("run attendu une erreur de connexion base de données")
	}
}
