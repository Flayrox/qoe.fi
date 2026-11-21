package pow

import (
	"testing"
	"time"
)

// maxNumber = 0 ne demande aucun travail : la cible est toujours 0, donc le
// challenge est « résolu » d'avance. Un appelant qui passe 0 (config, flag
// désactivé, défaut oublié) obtiendrait un PoW décoratif — refus explicite.
func TestGenerateChallenge_RefuseMaxNumberNul(t *testing.T) {
	if _, err := GenerateChallenge("secret", 0, time.Minute); err == nil {
		t.Fatal("maxNumber=0 accepté : challenge résolu d'avance (aucune preuve de travail)")
	}
	if _, err := GenerateChallenge("secret", -5, time.Minute); err == nil {
		t.Fatal("maxNumber négatif accepté")
	}
	ch, err := GenerateChallenge("secret", 1, time.Minute)
	if err != nil {
		t.Fatalf("maxNumber=1 refusé à tort : %v", err)
	}
	if ch.MaxNumber != 1 || ch.Challenge == "" || ch.Signature == "" {
		t.Fatalf("challenge invalide : %+v", ch)
	}
}
