// Package conversations — messagerie directe (DMs).
//
// Tranche 1 : conversations directes à 2 participants. Le modèle supporte
// les groupes futurs (type sur Conversation, N membres), seule la création
// déterministe (directKey « minId:maxId ») est propre au cas direct.
//
// Lecture : chaque membre a son lastReadAt (ConversationMember) ; un message
// est « non lu » s'il est postérieur. La remontée des nouveaux messages se
// fait par polling (GET messages?after=) — le temps réel (Supabase Realtime
// ou SSE) est une tranche ultérieure.
package conversations

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	db "github.com/qoefi/api/internal/database"
)

// Erreurs métier (mappées en HTTP par le handler).
var (
	ErrNotFound           = errors.New("conversation introuvable")
	ErrParticipantMissing = errors.New("participant introuvable")
	ErrSelfDirect         = errors.New("impossible de se messager soi-même")
	ErrBlocked            = errors.New("conversation bloquée")
)

const maxContentRunes = 2000

// Participant est l'autre utilisateur d'une conversation directe.
type Participant struct {
	ID          string  `json:"id"`
	Name        *string `json:"name"`
	Username    *string `json:"username"`
	LogoURL     *string `json:"logoUrl"`
	IsCertified bool    `json:"isCertified"`
}

// LastMessage est le dernier message d'une conversation (aperçu liste).
type LastMessage struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	SenderID  string `json:"senderId"`
	CreatedAt string `json:"createdAt"`
}

// Conversation est la forme API d'une conversation directe.
type Conversation struct {
	ID          string       `json:"id"`
	Participant Participant  `json:"participant"`
	UnreadCount int          `json:"unreadCount"`
	LastReadAt  *string      `json:"lastReadAt"`
	LastMessage *LastMessage `json:"lastMessage,omitempty"`
	CreatedAt   string       `json:"createdAt"`
}

// Message est la forme API d'un message.
type Message struct {
	ID        string `json:"id"`
	SenderID  string `json:"senderId"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
}

// MessagePage est une page de messages (ascendants) + hasMore pour la
// pagination arrière par curseur.
type MessagePage struct {
	Messages []Message `json:"messages"`
	HasMore  bool      `json:"hasMore"`
}

// Service expose les opérations de messagerie.
type Service struct {
	pool *pgxpool.Pool
	q    *db.Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, q: db.New(pool)}
}

// directKey construit la clé déterministe d'une conversation directe :
// les deux ids triés, séparés par « : » — UNE conversation par paire.
func directKey(a, b string) string {
	pair := []string{a, b}
	sort.Strings(pair)
	return pair[0] + ":" + pair[1]
}

// CreateDirect crée (ou récupère) la conversation directe entre l'utilisateur
// et le participant. Vérifie l'existence du participant et les blocages
// mutuels. Idempotent : deux appels concurrents ne créent qu'une ligne.
func (s *Service) CreateDirect(ctx context.Context, userID, participantID string) (*Conversation, error) {
	if participantID == "" {
		return nil, ErrParticipantMissing
	}
	if participantID == userID {
		return nil, ErrSelfDirect
	}

	exists, err := s.q.UserExists(ctx, participantID)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrParticipantMissing
	}
	blocked, err := s.q.AreUsersBlocked(ctx, db.AreUsersBlockedParams{
		CreatorId: toUUID(userID),
		ReaderId:  toUUID(participantID),
	})
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, ErrBlocked
	}

	key := directKey(userID, participantID)
	var convID string

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback silencieux après commit

	tq := db.New(tx)

	// ON CONFLICT DO NOTHING : une conversation déjà existante ne renvoie
	// AUCUNE ligne (ErrNoRows) — on retombe alors sur la recherche par clé.
	id, err := tq.InsertDirectConversation(ctx, pgtype.Text{String: key, Valid: true})
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		id, err = tq.GetConversationByDirectKey(ctx, pgtype.Text{String: key, Valid: true})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
	}
	convID = id

	// Membres (idempotent : un membre manquant est ré-ajouté).
	if err := tq.UpsertConversationMember(ctx, db.UpsertConversationMemberParams{
		ConversationId: convID,
		UserId:         toUUID(userID),
	}); err != nil {
		return nil, err
	}
	if err := tq.UpsertConversationMember(ctx, db.UpsertConversationMemberParams{
		ConversationId: convID,
		UserId:         toUUID(participantID),
	}); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return s.Get(ctx, userID, convID)
}

// List retourne les conversations de l'utilisateur, triées par activité.
func (s *Service) List(ctx context.Context, userID string, limit int) ([]Conversation, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.q.ListConversationsForUser(ctx, db.ListConversationsForUserParams{
		UserId: toUUID(userID),
		Limit:  int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]Conversation, 0, len(rows))
	for i := range rows {
		out = append(out, conversationFromRow(&rows[i]))
	}
	return out, nil
}

// Get retourne une conversation si l'utilisateur en est membre.
func (s *Service) Get(ctx context.Context, userID, convID string) (*Conversation, error) {
	row, err := s.q.GetConversationForUser(ctx, db.GetConversationForUserParams{
		UserId: toUUID(userID),
		ID:     convID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	conv := conversationDetailFromRow(&row)
	return &conv, nil
}

// UnreadCount retourne le nombre de conversations avec des non-lus (badge).
func (s *Service) UnreadCount(ctx context.Context, userID string) (int, error) {
	n, err := s.q.CountUnreadConversations(ctx, toUUID(userID))
	return int(n), err
}

// ListMessages retourne la page de messages (ascendants) strictement
// antérieurs au curseur `before` (RFC3339, exclusif ; nil = depuis le début).
func (s *Service) ListMessages(ctx context.Context, userID, convID string, before *time.Time, limit int) (MessagePage, error) {
	if _, err := s.Get(ctx, userID, convID); err != nil {
		return MessagePage{}, err
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.q.ListMessagesBefore(ctx, db.ListMessagesBeforeParams{
		ConversationId: convID,
		Column2:        timeToTimestamp(before),
		Limit:          int32(limit + 1), // +1 pour détecter hasMore
	})
	if err != nil {
		return MessagePage{}, err
	}

	hasMore := len(rows) > limit
	if hasMore {
		rows = rows[:limit]
	}
	// Le SQL renvoie les plus récents d'abord → on inverse pour l'affichage.
	msgs := make([]Message, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		msgs = append(msgs, messageFromRow(&rows[i]))
	}
	return MessagePage{Messages: msgs, HasMore: hasMore}, nil
}

// SendMessage envoie un message (l'utilisateur doit être membre). Le contenu
// est trimé ; vide ou > 2000 runes → erreur.
func (s *Service) SendMessage(ctx context.Context, userID, convID, content string) (*Message, error) {
	if _, err := s.Get(ctx, userID, convID); err != nil {
		return nil, err
	}
	content = strings.TrimSpace(content)
	if content == "" {
		return nil, errors.New("message vide")
	}
	if utf8.RuneCountInString(content) > maxContentRunes {
		return nil, errors.New("message trop long")
	}
	row, err := s.q.InsertMessage(ctx, db.InsertMessageParams{
		ConversationId: convID,
		SenderId:       toUUID(userID),
		Content:        content,
	})
	if err != nil {
		return nil, err
	}
	msg := messageFromInsert(&row)
	return &msg, nil
}

// MarkRead marque tous les messages de la conversation comme lus.
func (s *Service) MarkRead(ctx context.Context, userID, convID string) error {
	if _, err := s.Get(ctx, userID, convID); err != nil {
		return err
	}
	return s.q.MarkConversationRead(ctx, db.MarkConversationReadParams{
		ConversationId: convID,
		UserId:         toUUID(userID),
	})
}

// ─── Mappers ────────────────────────────────────────────────────────────

func conversationFromRow(r *db.ListConversationsForUserRow) Conversation {
	c := Conversation{
		ID: r.ID,
		Participant: Participant{
			ID:          r.ParticipantID,
			Name:        textPtr(r.ParticipantName),
			Username:    textPtr(r.ParticipantUsername),
			LogoURL:     textPtr(r.ParticipantLogo),
			IsCertified: r.ParticipantCertified,
		},
		UnreadCount: int(r.UnreadCount),
		LastReadAt:  timestampPtr(r.LastReadAt),
		CreatedAt:   r.CreatedAt.Time.Format(time.RFC3339),
	}
	if r.LastMessageID != "" && r.LastMessageAt.Valid {
		c.LastMessage = &LastMessage{
			ID:        r.LastMessageID,
			Content:   r.LastMessageContent,
			SenderID:  r.LastMessageSenderID,
			CreatedAt: r.LastMessageAt.Time.Format(time.RFC3339),
		}
	}
	return c
}

func conversationDetailFromRow(r *db.GetConversationForUserRow) Conversation {
	return Conversation{
		ID: r.ID,
		Participant: Participant{
			ID:          r.ParticipantID,
			Name:        textPtr(r.ParticipantName),
			Username:    textPtr(r.ParticipantUsername),
			LogoURL:     textPtr(r.ParticipantLogo),
			IsCertified: r.ParticipantCertified,
		},
		LastReadAt: timestampPtr(r.LastReadAt),
		CreatedAt:  r.CreatedAt.Time.Format(time.RFC3339),
	}
}

func messageFromRow(r *db.ListMessagesBeforeRow) Message {
	return Message{
		ID:        r.ID,
		SenderID:  r.SenderID,
		Content:   r.Content,
		CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
	}
}

func messageFromInsert(r *db.InsertMessageRow) Message {
	return Message{
		ID:        r.ID,
		SenderID:  r.SenderID,
		Content:   r.Content,
		CreatedAt: r.CreatedAt.Time.Format(time.RFC3339),
	}
}

func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

func timestampPtr(t pgtype.Timestamp) *string {
	if !t.Valid {
		return nil
	}
	v := t.Time.Format(time.RFC3339)
	return &v
}

func timeToTimestamp(t *time.Time) pgtype.Timestamp {
	if t == nil {
		return pgtype.Timestamp{}
	}
	return pgtype.Timestamp{Time: *t, Valid: true}
}

func toUUID(id string) pgtype.UUID {
	u := pgtype.UUID{}
	_ = u.Scan(id)
	return u
}