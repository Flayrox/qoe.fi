package admin

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/qoefi/api/internal/database"
)

var errInvalidAction = errors.New("action de modération invalide")

// ReportReporter est le signalant dénormalisé d'un signalement.
type ReportReporter struct {
	ID       string  `json:"id"`
	Name     *string `json:"name"`
	Username *string `json:"username"`
	LogoURL  *string `json:"logoUrl"`
}

// ReportItem est un signalement de la file de modération, avec aperçu de la
// cible et nombre total de signalements sur la même cible (sévérité).
type ReportItem struct {
	ID            string         `json:"id"`
	TargetID      string         `json:"targetId"`
	TargetType    string         `json:"targetType"`
	Reason        string         `json:"reason"`
	Details       *string        `json:"details"`
	Status        string         `json:"status"`
	ActionTaken   string         `json:"actionTaken"`
	CreatedAt     string         `json:"createdAt"`
	TargetPreview *string        `json:"targetPreview"`
	TargetCount   int64          `json:"targetCount"`
	Reporter      ReportReporter `json:"reporter"`
}

// ListReports renvoie la file de modération (pending en premier), filtrée par
// statut si fourni (superadmin).
func (s *Service) ListReports(ctx context.Context, userID, status string, limit, offset int) ([]ReportItem, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := s.q.ListModerationReportsWithCount(ctx, db.ListModerationReportsWithCountParams{
		Column1: status,
		Limit:   int32(limit),
		Offset:  int32(offset),
	})
	if err != nil {
		return nil, err
	}
	items := make([]ReportItem, 0, len(rows))
	for _, r := range rows {
		var preview *string
		if r.TargetPreview != "" {
			v := r.TargetPreview
			preview = &v
		}
		items = append(items, ReportItem{
			ID:            r.ID,
			TargetID:      r.TargetId,
			TargetType:    r.TargetType,
			Reason:        r.Reason,
			Details:       textPtr(r.Details),
			Status:        r.Status,
			ActionTaken:   r.ActionTaken,
			CreatedAt:     r.CreatedAt.Time.Format(time.RFC3339),
			TargetPreview: preview,
			TargetCount:   r.TargetCount,
			Reporter: ReportReporter{
				ID:       r.ReporterID,
				Name:     textPtr(r.ReporterName),
				Username: textPtr(r.ReporterUsername),
				LogoURL:  textPtr(r.ReporterLogo),
			},
		})
	}
	return items, nil
}

// CountPendingReports renvoie le nombre de signalements en attente (badge).
func (s *Service) CountPendingReports(ctx context.Context, userID string) (int64, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return 0, err
	}
	rows, err := s.q.CountModerationReportsByStatus(ctx)
	if err != nil {
		return 0, err
	}
	for _, r := range rows {
		if r.Status == "pending" {
			return r.Count, nil
		}
	}
	return 0, nil
}

// ResolveReport clôt un signalement et applique éventuellement une action de
// modération (masquer le post/l'article, suspendre l'auteur). Actions :
// dismiss | resolve | hide_post | hide_article | unhide_post | unhide_article
// | suspend_author. Réservé superadmin.
func (s *Service) ResolveReport(ctx context.Context, userID, reportID, action, note string) (*ReportItem, error) {
	if err := s.checkSuperadmin(ctx, userID); err != nil {
		return nil, err
	}
	report, err := s.q.GetModerationReport(ctx, reportID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, pgx.ErrNoRows
		}
		return nil, err
	}

	status := "resolved"
	actionTaken := "none"
	switch action {
	case "dismiss":
		status = "dismissed"
	case "resolve":
		// résolu sans action.
	case "hide_post":
		if report.TargetType != "thought" {
			return nil, errors.New("l'action hide_post ne s'applique qu'aux pensées")
		}
		if err := s.q.HidePostByModerator(ctx, report.TargetId); err != nil {
			return nil, err
		}
		actionTaken = "hide_post"
	case "hide_article":
		if report.TargetType != "article" {
			return nil, errors.New("l'action hide_article ne s'applique qu'aux articles")
		}
		if err := s.q.HideArticleByModerator(ctx, report.TargetId); err != nil {
			return nil, err
		}
		actionTaken = "hide_article"
	case "unhide_post":
		if err := s.q.UnhidePostByModerator(ctx, report.TargetId); err != nil {
			return nil, err
		}
		actionTaken = "unhide_post"
	case "unhide_article":
		if err := s.q.UnhideArticleByModerator(ctx, report.TargetId); err != nil {
			return nil, err
		}
		actionTaken = "unhide_article"
	case "suspend_author":
		authorID, err := s.targetAuthor(ctx, report)
		if err != nil {
			return nil, err
		}
		reason := note
		if reason == "" {
			reason = "Signalé par la communauté (" + report.Reason + ")"
		}
		suspended := true
		if _, err := s.UpdateModeration(ctx, userID, authorID, ModerationInput{
			IsSuspended:   &suspended,
			SuspendReason: &reason,
		}); err != nil {
			return nil, err
		}
		actionTaken = "suspend_author"
	default:
		return nil, errInvalidAction
	}

	noteVal := pgtype.Text{}
	if note != "" {
		noteVal = pgtype.Text{String: note, Valid: true}
	}
	var resolvedBy pgtype.UUID
	_ = resolvedBy.Scan(userID)
	now := time.Now().UTC()
	_, err = s.q.UpdateModerationReportResolution(ctx, db.UpdateModerationReportResolutionParams{
		ID:             reportID,
		Status:         status,
		ActionTaken:    actionTaken,
		ResolvedById:   resolvedBy,
		ResolvedAt:     pgtype.Timestamp{Time: now, Valid: true},
		ResolutionNote: noteVal,
	})
	if err != nil {
		return nil, err
	}

	return &ReportItem{
		ID:          report.ID,
		TargetID:    report.TargetId,
		TargetType:  report.TargetType,
		Reason:      report.Reason,
		Details:     textPtr(report.Details),
		Status:      status,
		ActionTaken: actionTaken,
		CreatedAt:   report.CreatedAt.Time.Format(time.RFC3339),
	}, nil
}

// targetAuthor détermine l'auteur de la cible d'un signalement (ou l'id lui-
// même pour une cible de type user).
func (s *Service) targetAuthor(ctx context.Context, r db.ModerationReport) (string, error) {
	switch r.TargetType {
	case "thought":
		return s.q.GetPostAuthor(ctx, r.TargetId)
	case "article":
		return s.q.GetArticleAuthor(ctx, r.TargetId)
	case "user":
		return r.TargetId, nil
	}
	return "", errors.New("type de cible inconnu")
}
