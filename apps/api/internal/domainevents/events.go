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

// UserMutedEvent est émis lorsqu'un utilisateur met un autre compte en sourdine.
type UserMutedEvent struct {
	MuterID string
	MutedID string
}

// UserUnmutedEvent est émis lorsqu'un utilisateur retire la sourdine d'un compte.
type UserUnmutedEvent struct {
	MuterID string
	MutedID string
}

// ProfileVisibilityChangedEvent représente le changement de visibilité du profil d'un utilisateur.
type ProfileVisibilityChangedEvent struct {
	UserID        string
	PublisherID string
	OldVisibility string
	NewVisibility string
}
