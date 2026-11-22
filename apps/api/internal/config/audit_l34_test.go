package config

import "testing"

// F768 — une cadence à 0 (variable posée par erreur, `.env` tronqué) est
// propagée telle quelle : `time.NewTicker(0)` panique alors au démarrage du
// worker (`workers.RunLegalLifecycleLoop`) et le cycle légal ne démarre plus.
// Les bornes (grâce, quota) tombent, elles, sur des valeurs dangereuses :
// 0 jour de grâce purge immédiatement ce qu'on croyait garder 7 jours, un
// quota de 0 octet refuse tous les uploads, un débit de 0 fige la newsletter.
// Seule exception documentée : MEDIA_UPLOADS_PER_HOUR=0 (= illimité).
func TestAuditL34_NonPositiveConfigFallsBackToDefaults(t *testing.T) {
	cases := []struct {
		env        string
		zeroIsMean bool // 0 est une valeur documentée (illimité)
		want       func(*Config) int64
	}{
		{"LEGAL_LIFECYCLE_INTERVAL_MINUTES", false, func(c *Config) int64 { return int64(c.LegalLifecycleIntervalMinutes) }},
		{"MEDIA_LIFECYCLE_INTERVAL_MINUTES", false, func(c *Config) int64 { return int64(c.MediaLifecycleIntervalMinutes) }},
		{"MEDIA_SOFT_DELETE_GRACE_DAYS", false, func(c *Config) int64 { return int64(c.MediaSoftDeleteGraceDays) }},
		{"MEDIA_QUOTA_BYTES", false, func(c *Config) int64 { return c.MediaQuotaBytesPerUser }},
		{"MEDIA_UPLOADS_PER_HOUR", true, func(c *Config) int64 { return c.MediaUploadsPerHour }},
		{"API_KEY_RATE_LIMIT", false, func(c *Config) int64 { return int64(c.APIKeyRateLimit) }},
		{"NEWSLETTER_RATE_PER_MINUTE", false, func(c *Config) int64 { return int64(c.NewsletterRatePerMinute) }},
		{"SMTP_PORT", false, func(c *Config) int64 { return int64(c.SMTPPort) }},
	}
	defaults := Load()
	for _, c := range cases {
		want := c.want(defaults)
		if want <= 0 {
			t.Fatalf("%s : le défaut documenté doit être positif, obtenu %d", c.env, want)
		}
		bad := []string{"-5"}
		if !c.zeroIsMean {
			bad = append(bad, "0")
		}
		for _, v := range bad {
			t.Run(c.env+"="+v, func(t *testing.T) {
				t.Setenv(c.env, v)
				if got := c.want(Load()); got != want {
					t.Errorf("%s=%s : obtenu %d, attendu le défaut %d", c.env, v, got, want)
				}
			})
		}
	}
}
