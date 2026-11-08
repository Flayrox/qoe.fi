package domainevents

// UserBlockedEvent représente le blocage d'un utilisateur par un autre.
// L'émission de cet événement doit couper les liens sociaux bidirectionnels
// (abonnements, demandes de suivi, notifications associées, demandes de collaboration).
type UserBlockedEvent struct {
	BlockerID string
	BlockedID string
}

// UserUnblockedEvent représente le déblocage d'un utilisateur par un autre.
type UserUnblockedEvent struct {
	BlockerID string
	BlockedID string
}

// ProfileVisibilityChangedEvent représente le changement de visibilité du profil d'un utilisateur.
type ProfileVisibilityChangedEvent struct {
	UserID        string
	PublicationID string
	OldVisibility string
	NewVisibility string
}
