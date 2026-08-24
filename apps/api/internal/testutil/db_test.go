package testutil

import "testing"

func TestValidateTestDatabaseURL(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		wantErr bool
	}{
		{
			name: "test database",
			url:  "postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable",
		},
		{
			name: "ci database",
			url:  "postgresql://qoe:qoe@postgres:5432/ci_test?sslmode=disable",
		},
		{
			name:    "dev database",
			url:     "postgresql://qoe:qoe@127.0.0.1:5433/qoe?sslmode=disable",
			wantErr: true,
		},
		{
			name:    "supabase database",
			url:     "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
			wantErr: true,
		},
		{
			name:    "missing database",
			url:     "postgresql://qoe:qoe@127.0.0.1:55432/",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateTestDatabaseURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Fatalf("validateTestDatabaseURL() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
