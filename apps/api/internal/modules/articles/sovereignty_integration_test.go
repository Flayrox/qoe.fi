package articles

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// TestService_MediaSubmit_ProvisionsSovereignCopy vérifie que la copie
// souveraine est créée atomiquement par la base dès la soumission à un média,
// sans dépendre d'un appel Go best-effort.
func TestService_MediaSubmit_ProvisionsSovereignCopy(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Essai média",
		Slug:          "essai-media",
		Content:       "Contenu de l'essai média",
		ContentFormat: "markdown",
		Status:        "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	var copyID, publisherID, canonicalType, canonicalURL string
	var sovereign bool
	var originID string
	if err := poolTest.QueryRow(ctx, `
		SELECT id, "publisherId", "canonicalType", "isAuthorSovereignCopy",
		       "originArticleId", COALESCE("canonicalUrl", '')
		FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2
	`, id, fx.WriterID).Scan(
		&copyID, &publisherID, &canonicalType, &sovereign, &originID, &canonicalURL,
	); err != nil {
		t.Fatalf("copie souveraine introuvable: %v", err)
	}
	if copyID == id {
		t.Fatal("la copie souveraine ne doit pas être l'article média lui-même")
	}
	if !sovereign || canonicalType != "PERSONAL_FORK" || originID != id {
		t.Fatalf("copie = sovereign=%v canonicalType=%q origin=%q", sovereign, canonicalType, originID)
	}
	if canonicalURL == "" {
		t.Fatal("canonicalUrl de la copie vide")
	}

	var publisherType string
	if err := poolTest.QueryRow(ctx, `SELECT type FROM "Publisher" WHERE id = $1`, publisherID).Scan(&publisherType); err != nil {
		t.Fatalf("publisher de la copie: %v", err)
	}
	if publisherType != "PERSONAL" {
		t.Fatalf("publisher de la copie = %q, attendu PERSONAL", publisherType)
	}

	var count int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.WriterID).Scan(&count); err != nil {
		t.Fatalf("count copies: %v", err)
	}
	if count != 1 {
		t.Fatalf("copies souveraines = %d, attendu 1", count)
	}
}

// TestService_ForkToPersonal_ExcludedAuthorKeepsAccess vérifie le droit
// inaliénable : l'auteur exclu du média peut récupérer sa copie, mais ne peut
// plus modifier l'article média.
func TestService_ForkToPersonal_ExcludedAuthorKeepsAccess(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Essai média",
		Slug:          "essai-media-exclusion",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Exclusion du média : l'auteur ne doit plus pouvoir éditer l'archive.
	if _, err := poolTest.Exec(ctx,
		`DELETE FROM "MediaMember" WHERE "userId" = $1 AND "mediaId" = 'media_001'`,
		fx.WriterID,
	); err != nil {
		t.Fatalf("exclusion: %v", err)
	}

	copyID, alreadyExisted, err := svc.ForkToPersonal(ctx, id, fx.WriterID)
	if err != nil {
		t.Fatalf("ForkToPersonal après exclusion: %v", err)
	}
	if copyID == "" || !alreadyExisted {
		t.Fatalf("fork après exclusion = id=%q already=%v", copyID, alreadyExisted)
	}

	err = svc.Update(ctx, id, fx.WriterID, UpdateArticleInput{
		Title:         "Tentative",
		Content:       "Tentative",
		ContentFormat: "markdown",
	})
	if !errors.Is(err, errForbidden) {
		t.Fatalf("Update après exclusion = %v, attendu errForbidden", err)
	}
}

// TestService_ForkToPersonal_DraftIsIdempotent vérifie qu'un article média
// encore brouillon (donc sans copie automatique) peut être forké à la demande,
// une seule fois.
func TestService_ForkToPersonal_DraftIsIdempotent(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Brouillon média",
		Slug:          "brouillon-media",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	firstID, already, err := svc.ForkToPersonal(ctx, id, fx.WriterID)
	if err != nil {
		t.Fatalf("premier fork: %v", err)
	}
	if already {
		t.Fatal("premier fork ne doit pas être marqué déjà existant")
	}

	secondID, already, err := svc.ForkToPersonal(ctx, id, fx.WriterID)
	if err != nil {
		t.Fatalf("second fork: %v", err)
	}
	if !already || secondID != firstID {
		t.Fatalf("second fork = id=%q already=%v, attendu id=%q already=true", secondID, already, firstID)
	}
}

// TestService_SetStatus_Publish_ProvisionsSovereignCopy couvre le chemin
// /publish (SetStatus), qui ne passait pas par le provisioning Go.
func TestService_SetStatus_Publish_ProvisionsSovereignCopy(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "À publier",
		Slug:          "a-publier",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := svc.SetStatus(ctx, id, fx.EditorID, "PUBLISHED", true, nil); err != nil {
		t.Fatalf("SetStatus(PUBLISHED): %v", err)
	}

	var count int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.WriterID).Scan(&count); err != nil {
		t.Fatalf("count copies: %v", err)
	}
	if count != 1 {
		t.Fatalf("copies souveraines après SetStatus = %d, attendu 1", count)
	}
}

// TestService_MediaSubmit_SlugCollisionDoesNotRenameUser vérifie que le
// provisionnement personnel choisit un slug unique quand le username est déjà
// utilisé par un autre Publisher, sans renommer le compte via le trigger
// inverse User <-> Publisher.
func TestService_MediaSubmit_SlugCollisionDoesNotRenameUser(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	var username string
	if err := poolTest.QueryRow(ctx, `SELECT username FROM "User" WHERE id = $1`, fx.WriterID).Scan(&username); err != nil {
		t.Fatalf("username: %v", err)
	}
	if username == "" {
		t.Fatal("username de la fixture vide")
	}

	// Un autre Publisher occupe déjà le slug du username.
	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "Publisher" (id, type, name, slug, "updatedAt")
		VALUES ('publisher_slug_conflict', 'PERSONAL', 'Conflit de slug', $1, now())
	`, username); err != nil {
		t.Fatalf("publisher en conflit: %v", err)
	}

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Essai collision de slug",
		Slug:          "essai-collision-slug",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create avec collision de slug: %v", err)
	}

	var publisherID string
	if err := poolTest.QueryRow(ctx, `SELECT "publisherId" FROM "User" WHERE id = $1`, fx.WriterID).Scan(&publisherID); err != nil {
		t.Fatalf("publisher personnel: %v", err)
	}
	if publisherID == "" {
		t.Fatal("publisher personnel non provisionné")
	}

	var personalSlug, personalType string
	if err := poolTest.QueryRow(ctx, `SELECT slug, type FROM "Publisher" WHERE id = $1`, publisherID).Scan(&personalSlug, &personalType); err != nil {
		t.Fatalf("lecture publisher personnel: %v", err)
	}
	if personalType != "PERSONAL" {
		t.Fatalf("publisher personnel = %q", personalType)
	}
	if personalSlug == username {
		t.Fatalf("slug personnel = username %q, la collision n'a pas été évitée", username)
	}

	var currentUsername string
	if err := poolTest.QueryRow(ctx, `SELECT username FROM "User" WHERE id = $1`, fx.WriterID).Scan(&currentUsername); err != nil {
		t.Fatalf("username après provisioning: %v", err)
	}
	if currentUsername != username {
		t.Fatalf("username renommé de %q à %q", username, currentUsername)
	}

	var copyCount int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.WriterID).Scan(&copyCount); err != nil {
		t.Fatalf("count copies après collision: %v", err)
	}
	if copyCount != 1 {
		t.Fatalf("copies après collision = %d, attendu 1", copyCount)
	}

	var copyPublisher string
	if err := poolTest.QueryRow(ctx, `
		SELECT "publisherId" FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.WriterID).Scan(&copyPublisher); err != nil {
		t.Fatalf("publisher de la copie: %v", err)
	}
	if copyPublisher != publisherID {
		t.Fatalf("publisher de la copie = %q, attendu %q", copyPublisher, publisherID)
	}
}

// TestService_CoAuthorAccepted_GetsSovereignCopy vérifie la règle P1 : un
// co-auteur ACCEPTED reçoit sa copie DRAFT au moment de son accord, tandis
// qu'un co-auteur PENDING n'en reçoit aucune.
func TestService_CoAuthorAccepted_GetsSovereignCopy(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Essai co-signé",
		Slug:          "essai-co-signe",
		Content:       "Contenu co-signé",
		ContentFormat: "markdown",
		Status:        "SUBMITTED",
		Attributions: []ArticleAttributionInput{
			{UserID: fx.ViewerID, Role: "CO_AUTHOR", Order: 1, IsVisible: true},
		},
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Tant que le co-auteur n'a pas accepté, aucune copie n'est créée.
	var pendingCopies int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.ViewerID).Scan(&pendingCopies); err != nil {
		t.Fatalf("count copies PENDING: %v", err)
	}
	if pendingCopies != 0 {
		t.Fatalf("copies PENDING = %d, attendu 0", pendingCopies)
	}

	// L'accord du co-auteur déclenche sa copie, même après publication.
	if _, err := poolTest.Exec(ctx, `
		UPDATE "ArticleAttribution"
		SET "consentStatus" = 'ACCEPTED', "updatedAt" = now()
		WHERE "articleId" = $1 AND "userId" = $2
	`, id, fx.ViewerID); err != nil {
		t.Fatalf("acceptation du co-auteur: %v", err)
	}

	var copyID, canonicalType, status, publisherType string
	if err := poolTest.QueryRow(ctx, `
		SELECT c.id, c."canonicalType", c.status, p.type
		FROM "Article" c
		JOIN "Publisher" p ON p.id = c."publisherId"
		WHERE c."originArticleId" = $1 AND c."authorId" = $2 AND c."isAuthorSovereignCopy" = true
	`, id, fx.ViewerID).Scan(&copyID, &canonicalType, &status, &publisherType); err != nil {
		t.Fatalf("copie du co-auteur introuvable: %v", err)
	}
	if copyID == id {
		t.Fatal("la copie du co-auteur ne doit pas être l'article média")
	}
	if canonicalType != "PERSONAL_FORK" || status != "DRAFT" || publisherType != "PERSONAL" {
		t.Fatalf("copie co-auteur = canonical=%q status=%q publisher=%q", canonicalType, status, publisherType)
	}
}

// TestService_SetStatus_Publish_ProvisionsAcceptedCoAuthorCopy vérifie qu'un
// co-auteur déjà ACCEPTED avant la publication reçoit sa copie via le trigger
// de l'article, sans attendre un nouvel accord.
func TestService_SetStatus_Publish_ProvisionsAcceptedCoAuthorCopy(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Essai co-signé avant publication",
		Slug:          "essai-co-signe-avant",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if _, err := poolTest.Exec(ctx, `
		INSERT INTO "ArticleAttribution"
			(id, "articleId", "userId", role, "order", "isVisible", "consentStatus", "consentUpdatedAt", "updatedAt")
		VALUES (gen_random_uuid()::text, $1, $2, 'CO_AUTHOR', 1, true, 'ACCEPTED', now(), now())
	`, id, fx.ViewerID); err != nil {
		t.Fatalf("attribution co-auteur: %v", err)
	}

	if err := svc.SetStatus(ctx, id, fx.EditorID, "PUBLISHED", true, nil); err != nil {
		t.Fatalf("SetStatus(PUBLISHED): %v", err)
	}

	var copies int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.ViewerID).Scan(&copies); err != nil {
		t.Fatalf("count copies co-auteur: %v", err)
	}
	if copies != 1 {
		t.Fatalf("copies co-auteur après publication = %d, attendu 1", copies)
	}
}

// TestService_TransferMediaToPersonal_RefusesWhenSovereignCopyExists vérifie
// la règle P1 : une archive média dont la copie vit déjà dans l'espace
// personnel de l'auteur ne peut pas y être transférée, ni par le service ni
// par un UPDATE SQL direct.
func TestService_TransferMediaToPersonal_RefusesWhenSovereignCopyExists(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Essai à rapatrier",
		Slug:          "essai-a-rapatrier",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "SUBMITTED",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err = svc.TransferPublisher(ctx, fx.WriterID, id, TransferArticleInput{TargetPublisherID: "personal"})
	if err == nil || !strings.Contains(err.Error(), "copie souveraine") {
		t.Fatalf("TransferPublisher = %v, attendu refus pour copie souveraine", err)
	}

	// L'article n'a pas bougé et reste l'archive du média.
	var publisherID, canonicalType string
	if err := poolTest.QueryRow(ctx, `SELECT "publisherId", "canonicalType" FROM "Article" WHERE id = $1`, id).Scan(&publisherID, &canonicalType); err != nil {
		t.Fatalf("article après refus: %v", err)
	}
	if publisherID != fx.PublisherID || canonicalType != "MEDIA_ARCHIVE" {
		t.Fatalf("article après refus = publisher=%q canonical=%q", publisherID, canonicalType)
	}

	// Exactement un vivant : la copie personnelle, et rien d'autre.
	var copies int
	if err := poolTest.QueryRow(ctx, `
		SELECT count(*) FROM "Article"
		WHERE "originArticleId" = $1 AND "authorId" = $2 AND "isAuthorSovereignCopy" = true
	`, id, fx.WriterID).Scan(&copies); err != nil {
		t.Fatalf("count copies: %v", err)
	}
	if copies != 1 {
		t.Fatalf("copies = %d, attendu 1", copies)
	}

	// La garde en base couvre aussi un transfert direct en SQL.
	var personalID string
	if err := poolTest.QueryRow(ctx, `SELECT "publisherId" FROM "User" WHERE id = $1`, fx.WriterID).Scan(&personalID); err != nil {
		t.Fatalf("publisher personnel: %v", err)
	}
	if personalID == "" {
		t.Fatal("publisher personnel non provisionné")
	}
	// Slug distinct pour que seul le garde-fou puisse refuser la requête
	// (sinon un conflit de slug personnel masquerait l'absence de garde).
	if _, err := poolTest.Exec(ctx, `UPDATE "Article" SET "publisherId" = $2, slug = $3 WHERE id = $1`, id, personalID, "essai-a-rapatrier-direct"); err == nil {
		t.Fatal("transfert SQL direct accepté alors que la copie souveraine existe")
	}
}

// TestService_TransferMediaToPersonal_NormalizesMediaArchive vérifie qu'un
// article sans copie souveraine peut entrer dans un espace personnel et
// redevient alors ORIGINAL : aucune archive média orpheline.
func TestService_TransferMediaToPersonal_NormalizesMediaArchive(t *testing.T) {
	requirePool(t)
	fx := seedMedia(t)
	svc := newService()
	ctx := context.Background()

	id, err := svc.Create(ctx, fx.WriterID, CreateArticleInput{
		PublisherID:   fx.PublisherID,
		Title:         "Archive sans copie",
		Slug:          "archive-sans-copie",
		Content:       "Contenu",
		ContentFormat: "markdown",
		Status:        "DRAFT",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	// Cas legacy : archive de média dont la copie a disparu.
	if _, err := poolTest.Exec(ctx, `UPDATE "Article" SET "canonicalType" = 'MEDIA_ARCHIVE' WHERE id = $1`, id); err != nil {
		t.Fatalf("marquage MEDIA_ARCHIVE: %v", err)
	}

	// Espace personnel de l'auteur, sans passer par une copie souveraine.
	var personalID string
	if err := poolTest.QueryRow(ctx, `
		INSERT INTO "Publisher" (id, type, name, slug, "updatedAt")
		VALUES (gen_random_uuid()::text, 'PERSONAL', 'Perso P1', 'perso-p1-' || left(gen_random_uuid()::text, 8), now())
		RETURNING id
	`).Scan(&personalID); err != nil {
		t.Fatalf("publisher personnel: %v", err)
	}
	if _, err := poolTest.Exec(ctx, `UPDATE "User" SET "publisherId" = $2, "updatedAt" = now() WHERE id = $1`, fx.WriterID, personalID); err != nil {
		t.Fatalf("rattachement du publisher personnel: %v", err)
	}

	if _, err := svc.TransferPublisher(ctx, fx.WriterID, id, TransferArticleInput{TargetPublisherID: "personal"}); err != nil {
		t.Fatalf("TransferPublisher: %v", err)
	}

	var publisherID, canonicalType string
	if err := poolTest.QueryRow(ctx, `SELECT "publisherId", "canonicalType" FROM "Article" WHERE id = $1`, id).Scan(&publisherID, &canonicalType); err != nil {
		t.Fatalf("article transféré: %v", err)
	}
	if publisherID != personalID {
		t.Fatalf("publisher après transfert = %q, attendu %q", publisherID, personalID)
	}
	if canonicalType != "ORIGINAL" {
		t.Fatalf("canonicalType après transfert = %q, attendu ORIGINAL", canonicalType)
	}

	var copies int
	if err := poolTest.QueryRow(ctx, `SELECT count(*) FROM "Article" WHERE "originArticleId" = $1`, id).Scan(&copies); err != nil {
		t.Fatalf("count copies: %v", err)
	}
	if copies != 0 {
		t.Fatalf("copies après transfert = %d, attendu 0", copies)
	}
}
