package main

import "testing"

func TestIsDestructive(t *testing.T) {
	for _, command := range []string{"down", "down-to"} {
		if !isDestructive(command) {
			t.Fatalf("%q devrait etre destructif", command)
		}
	}
	for _, command := range []string{"up", "up-to", "status", "version"} {
		if isDestructive(command) {
			t.Fatalf("%q ne devrait pas etre destructif", command)
		}
	}
}

func TestValidateDestructiveDatabase(t *testing.T) {
	tests := []struct {
		name    string
		dsn     string
		wantErr bool
	}{
		{
			name: "test database",
			dsn:  "postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable",
		},
		{
			name:    "development database",
			dsn:     "postgresql://qoe:qoe@127.0.0.1:5433/qoe?sslmode=disable",
			wantErr: true,
		},
		{
			name:    "supabase database",
			dsn:     "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateDestructiveDatabase(tt.dsn)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateDestructiveDatabase() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
