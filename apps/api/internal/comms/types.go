package comms

import "context"

// Message décrit un e-mail transitant par la passerelle unifiée comms.Gateway.
type Message struct {
	From            string
	To              string
	Subject         string
	HTML            string
	Text            string
	ReplyTo         string
	ListUnsubscribe string
	ListID          string
	RefID           string
	IsBulk          bool
	// MessageType identifie la clé du registre MessageTypePolicy (ex: "creator.newsletter").
	MessageType string
	// PublisherID est utilisé pour vérifier les oppositions par publication.
	PublisherID string
}

// Transport est l'interface bas-niveau d'expédition (SMTP go-mail ou Resend).
type Transport interface {
	// Name identifie le fournisseur (stocké dans NotificationDelivery.provider).
	Name() string
	Send(ctx context.Context, msg Message) error
}
