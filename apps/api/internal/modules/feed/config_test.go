package feed

import (
	"context"
	"strings"
	"testing"

	"github.com/pgvector/pgvector-go"
)

// setCfg écrit une clé SystemConfig (nettoyée après le test).
func setCfg(t *testing.T, ctx context.Context, key, value string) {
	t.Helper()
	if _, err := poolTest.Exec(ctx, `INSERT INTO "SystemConfig" (key, value, "updatedAt")
		VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, "updatedAt" = now()`, key, value); err != nil {
		t.Fatalf("set %s: %v", key, err)
	}
	t.Cleanup(func() { _, _ = poolTest.Exec(ctx, `DELETE FROM "SystemConfig" WHERE key = $1`, key) })
}

// TestLoadEngineConfig_SystemConfigOverrides vérifie la lecture des poids :
// défauts calibrés quand les clés sont absentes, surcharge quand elles sont
// présentes, repli sur le défaut quand une valeur est invalide.
func TestLoadEngineConfig_SystemConfigOverrides(t *testing.T) {
	ctx := context.Background()
	svc := newTestService()
	cfg := svc.loadEngineConfig(ctx)
	if cfg.poolSim != 0.65 || cfg.poolFresh != 0.15 || cfg.poolCompletion != 0.20 {
		t.Fatalf("défauts pool inattendus: %+v", cfg)
	}
	if cfg.rerankSim != 0.40 || cfg.rerankFresh != 0.15 || cfg.rerankEng != 0.15 {
		t.Fatalf("défauts rerank inattendus: %+v", cfg)
	}
	if cfg.mmrLambda != 0.7 || cfg.mmrDupThreshold != 0.92 {
		t.Fatalf("défauts MMR inattendus: %+v", cfg)
	}

	setCfg(t, ctx, cfgPoolSim, "0.80")
	setCfg(t, ctx, cfgRerankSim, "0.50")
	setCfg(t, ctx, cfgMMRLambda, "0.9")
	setCfg(t, ctx, cfgMMRDupThreshold, "0.99")
	setCfg(t, ctx, cfgPoolFresh, "zzz") // invalide → défaut

	cfg2 := svc.loadEngineConfig(ctx)
	if cfg2.poolSim != 0.80 || cfg2.rerankSim != 0.50 || cfg2.mmrLambda != 0.9 || cfg2.mmrDupThreshold != 0.99 {
		t.Fatalf("surcharge SystemConfig inattendue: %+v", cfg2)
	}
	if cfg2.poolFresh != 0.15 {
		t.Fatalf("clé invalide: poolFresh=%v, attendu défaut 0.15", cfg2.poolFresh)
	}
}

// TestEngine_ConfigDrivesPool vérifie que feed.pool_sim / feed.pool_fresh
// changent réellement l'ORDRE du pool : avec les défauts (65/15/20), le
// contenu du milieu (sim 0.9, vieux) précède l'éditorial frais (sim 0.6) ;
// avec une config 50/50, la fraîcheur noie la personnalisation — le même
// data, un simple changement de clé, un ordre inversé.
func TestEngine_ConfigDrivesPool(t *testing.T) {
	ctx := context.Background()
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE "Post", "Article", "User", "Publication" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	const authorID = "00000000-0000-0000-0000-0000000000b1"
	if _, err := poolTest.Exec(ctx, `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
		VALUES ('pub_cfg', 'PERSONAL', 'Cfg', 'cfg', now(), now())`); err != nil {
		t.Fatalf("publication: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'cfg@t.dev', 'cfg', 'Cfg', 'creator', now(), now())`, authorID); err != nil {
		t.Fatalf("author: %v", err)
	}
	insertArt := func(id, title string, old bool, vec pgvector.Vector) {
		created := `now()`
		if old {
			created = `now() - interval '30 days'`
		}
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Article" (id, title, slug, content, published, visibility,
			"readingTime", status, "publicationId", "authorId", "createdAt", "updatedAt",
			"semanticTags", "completionRate", embedding)
			VALUES ($1, $2, $2, '<p>x</p>', true, 'PUBLIC', 8, 'PUBLISHED', 'pub_cfg', $3,
			        `+created+`, now(), ARRAY['foot']::text[], 0.5, $4)`,
			id, title, authorID, vec); err != nil {
			t.Fatalf("article %s: %v", id, err)
		}
	}
	// 3 articles du milieu (vieux : fresh ≈ 0, sim ≈ 0.9) + 3 éditoriaux frais
	// (fresh = 1, sim ≈ 0.6) — le piège exact du pool fix.
	for i := 0; i < 3; i++ {
		insertArt("cfg_foot_"+string(rune('a'+i)), "Foot "+string(rune('a'+i)), true, halfVec(1.03, 1))
	}
	for i := 0; i < 3; i++ {
		insertArt("cfg_edit_"+string(rune('a'+i)), "Édito "+string(rune('a'+i)), false, halfVec(1, 3))
	}

	svc := newTestService()
	readerVec := halfVec(3, 1)

	// Défauts : le milieu d'abord, la fraîcheur ne noie pas le profil.
	pool, err := svc.fetchEngineArticles(ctx, &readerVec, "", 30, 0, nil, svc.loadEngineConfig(ctx), nil)
	if err != nil {
		t.Fatalf("pool défaut: %v", err)
	}
	if !strings.HasPrefix(pool[0].id, "cfg_foot_") {
		t.Fatalf("défaut: position 0 = %s, attendu un article du milieu", pool[0].id)
	}

	// Config 50/50 sim/fresh : l'éditorial frais passe devant (la fraîcheur
	// noie la personnalisation — exactement le bug corrigé, réactivé par clé).
	setCfg(t, ctx, cfgPoolSim, "0.5")
	setCfg(t, ctx, cfgPoolFresh, "0.5")
	cfg := svc.loadEngineConfig(ctx)
	pool2, err := svc.fetchEngineArticles(ctx, &readerVec, "", 30, 0, nil, cfg, nil)
	if err != nil {
		t.Fatalf("pool config: %v", err)
	}
	if !strings.HasPrefix(pool2[0].id, "cfg_edit_") {
		t.Fatalf("config 50/50: position 0 = %s, attendu un éditorial frais (la clé doit changer l'ordre)", pool2[0].id)
	}
}

// TestMilieuPenalty_DevaluesTag vérifie la pénalité de milieu de bout en bout :
// 3 signalements SHOW_LESS sur des pensées foot → le tag « foot » est rejeté
// pour cet utilisateur, et les pensées foot (même similarité quasi égale aux
// pensées anime) coulent DERRIÈRE dans le pool. Sans signalement, le foot
// reste devant (la dévaluation est bien la cause, pas un hasard).
func TestMilieuPenalty_DevaluesTag(t *testing.T) {
	ctx := context.Background()
	// Environnement minimal autonome : 1 lecteur + 1 auteur + 6 pensées, pour
	// que RIEN d'autre n'interfère avec le pool (les pensées fraîches du seed
	// partagé fausseraient l'ordre attendu).
	if _, err := poolTest.Exec(ctx, `TRUNCATE TABLE
		"Post", "Article", "User", "Publication", "Follows", "BlockedUser",
		"ContentFeedback", "FeedImpression", "ReadingSession", "Like", "_CoAuthors" CASCADE`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	readerID := "00000000-0000-0000-0000-000000000010"
	const authorID = "00000000-0000-0000-0000-000000000011"
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt", embedding)
		VALUES ($1, 'mp@t.dev', 'mp', 'MP', 'user', now(), now(), `+vec512+`)`, readerID); err != nil {
		t.Fatalf("reader: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `INSERT INTO "User" (id, email, username, name, role, "createdAt", "updatedAt")
		VALUES ($1, 'mpa@t.dev', 'mpa', 'MPA', 'creator', now(), now())`, authorID); err != nil {
		t.Fatalf("author: %v", err)
	}

	insertThought := func(id, tag string, vec pgvector.Vector) {
		if _, err := poolTest.Exec(ctx, `INSERT INTO "Post" (id, content, "authorId", "createdAt", "updatedAt", tags,
			visibility, "contentVisibility", "isDraft", "replyRestriction", "likeCount", "repostCount", "replyCount", embedding)
			VALUES ($1, 'Pensée '||$2, $3, now() - interval '30 days', now(), ARRAY[$2]::text[], 'public', 'PUBLIC', false, 'everyone', 0, 0, 0, $4)`,
			id, tag, authorID, vec); err != nil {
			t.Fatalf("pensée %s: %v", id, err)
		}
	}
	// 6 pensées foot + 3 pensées anime, foot et anime quasi à égalité de
	// similarité avec le lecteur (foot un chouia devant : 0.914 vs 0.872),
	// tout le reste strictement égal (âge, compteurs). 3 des foot seront
	// signalées SHOW_LESS : exclues individuellement, et les 3 AUTRES foot
	// (jamais signalées directement) doivent être dévaluées par le tag.
	for i := 0; i < 6; i++ {
		insertThought("mp_foot_"+string(rune('a'+i)), "foot", halfVec(1.1, 1))
	}
	for i := 0; i < 3; i++ {
		insertThought("mp_anime_"+string(rune('a'+i)), "anime", halfVec(1, 1.1))
	}

	svc := newTestService()
	readerVec := halfVec(3, 1)

	// Sans signalement : pas de tag rejeté, le foot (sim un poil supérieure)
	// ouvre le pool (9 pensées au total).
	pool0, err := svc.fetchEngineThoughts(ctx, &readerVec, readerID, 30, 0, nil, svc.loadEngineConfig(ctx), nil)
	if err != nil {
		t.Fatalf("pool sans pénalité: %v", err)
	}
	if len(pool0) != 9 {
		t.Fatalf("pool sans pénalité = %d items, attendu 9", len(pool0))
	}
	if !strings.HasPrefix(pool0[0].id, "mp_foot_") {
		t.Fatalf("sans pénalité: position 0 = %s, attendu foot", pool0[0].id)
	}

	// 3 SHOW_LESS sur des pensées foot (le seuil est 3). Ces 3 items sont
	// exclus individuellement (règle existante) ; la pénalité de milieu doit
	// dévaluer les 3 AUTRES foot partageant le tag.
	for i := 0; i < 3; i++ {
		if _, err := poolTest.Exec(ctx, `INSERT INTO "ContentFeedback" (id, "userId", "thoughtId", type, "createdAt")
			VALUES (gen_random_uuid()::text, $1::uuid, $2, 'SHOW_LESS', now())`, readerID, "mp_foot_"+string(rune('a'+i))); err != nil {
			t.Fatalf("SHOW_LESS: %v", err)
		}
	}

	// Le tag foot est rejeté (3 signalements), pas anime (0).
	pen := svc.penalizedTags(ctx, readerID)
	if !pen["foot"] {
		t.Fatal("tag foot doit être rejeté après 3 SHOW_LESS")
	}
	if pen["anime"] {
		t.Fatal("tag anime ne doit pas être rejeté")
	}

	// Avec la pénalité : les 3 foot non signalées (×0.5 par le tag) coulent
	// derrière les anime — et RIEN d'autre n'est exclu : 3 anime + 3 foot
	// restantes = 6 items (le feed ne se vide jamais).
	pool1, err := svc.fetchEngineThoughts(ctx, &readerVec, readerID, 30, 0, nil, svc.loadEngineConfig(ctx), pen)
	if err != nil {
		t.Fatalf("pool avec pénalité: %v", err)
	}
	if !strings.HasPrefix(pool1[0].id, "mp_anime_") {
		t.Fatalf("avec pénalité: position 0 = %s, attendu anime (le foot doit être dévalué). ordre=%s %s %s",
			pool1[0].id, pool1[0].id, pool1[1].id, pool1[2].id)
	}
	// Les 3 items signalés SHOW_LESS sont exclus individuellement ; les 3 foot
	// restantes sont dévaluées mais PRÉSENTES (jamais d'exclusion de masse).
	footLeft := 0
	for _, it := range pool1 {
		if strings.HasPrefix(it.id, "mp_foot_") {
			footLeft++
		}
	}
	if len(pool1) != 6 || footLeft != 3 {
		t.Fatalf("pool après pénalité = %d items (%d foot), attendu 6 (3 foot dévaluées mais présentes)", len(pool1), footLeft)
	}
}

// TestHasPenalizedTag couvre la fonction pure de détection de tag rejeté.
func TestHasPenalizedTag(t *testing.T) {
	pen := map[string]bool{"foot": true}
	if !hasPenalizedTag([]string{"foot", "gaming"}, pen) {
		t.Fatal("item foot doit être détecté comme rejeté")
	}
	if hasPenalizedTag([]string{"gaming", "anime"}, pen) {
		t.Fatal("item sans tag rejeté ne doit pas être pénalisé")
	}
	if hasPenalizedTag([]string{"foot"}, nil) {
		t.Fatal("map vide → aucune pénalité")
	}
}
