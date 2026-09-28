package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/qoefi/api/internal/modules/admin"
	"github.com/qoefi/api/internal/queue"
)

// StaffCampaignWorker exécute les tranches des campagnes administratives
// (TaskStaffCampaign, file `default` — volumes faibles supervisés, pas de
// quotas à séparer comme pour les listes fraîches). Une exécution traite une
// tranche plafonnée puis rend la main : s'il reste des livraisons, elle
// ré-enfile elle-même la tranche suivante avec un délai.
type StaffCampaignWorker struct {
	pool     *pgxpool.Pool
	svc      *admin.Service
	provider EmailProvider
	from     string
	ac       *asynq.Client
}

func NewStaffCampaignWorker(pool *pgxpool.Pool, svc *admin.Service) *StaffCampaignWorker {
	return &StaffCampaignWorker{pool: pool, svc: svc}
}

// SetEmailProvider branche le fournisseur d'envoi partagé.
func (w *StaffCampaignWorker) SetEmailProvider(p EmailProvider, from string) {
	w.provider = p
	w.from = from
}

// SetAsynqClient branche le client pour ré-enfiler la tranche suivante.
func (w *StaffCampaignWorker) SetAsynqClient(ac *asynq.Client) { w.ac = ac }

// HandleStaffCampaign traite une tranche. Idempotent : rejouer la tâche ne
// réenvoie jamais deux fois à la même adresse (réclamation
// `FOR UPDATE SKIP LOCKED`, livraisons déjà traitées ignorées).
func (w *StaffCampaignWorker) HandleStaffCampaign(ctx context.Context, t *asynq.Task) error {
	var p queue.StaffCampaignPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("payload campagne staff: %w", err)
	}
	if p.CampaignID == "" {
		return fmt.Errorf("campaignId manquant")
	}
	if w.provider == nil {
		log.Printf("[staff-campaign] %s : aucun fournisseur email configuré (EMAIL_PROVIDER), tranche ignorée", p.CampaignID)
		return nil
	}
	// Arrêt d'urgence global : mise en pause, pas de clôture abusive.
	if paused, err := w.svc.PauseCampaignForKill(ctx, p.CampaignID); err != nil {
		return err
	} else if paused {
		return nil
	}

	claims, err := w.svc.ClaimCampaignChunk(ctx, p.CampaignID, 100)
	if err != nil {
		return err
	}
	for _, c := range claims {
		msg, buildErr := w.buildCampaignEmail(ctx, p.CampaignID, c)
		if buildErr != nil {
			_ = w.svc.MarkCampaignResult(ctx, p.CampaignID, c.DeliveryID, false, buildErr.Error())
			continue
		}
		if sendErr := w.provider.Send(ctx, msg); sendErr != nil {
			log.Printf("[staff-campaign] %s → %s : %v", p.CampaignID, c.Email, sendErr)
			_ = w.svc.MarkCampaignResult(ctx, p.CampaignID, c.DeliveryID, false, sendErr.Error())
			continue
		}
		_ = w.svc.MarkCampaignResult(ctx, p.CampaignID, c.DeliveryID, true, "")
	}

	finished, err := w.svc.FinishCampaignIfDrained(ctx, p.CampaignID)
	if err != nil {
		return err
	}
	if !finished && w.ac != nil {
		if err := queue.PublishStaffCampaignDelayed(w.ac,
			queue.StaffCampaignPayload{CampaignID: p.CampaignID},
			admin.SendChunkDelay()); err != nil {
			return fmt.Errorf("ré-enfilement campagne %s: %w", p.CampaignID, err)
		}
	}
	return nil
}

// buildCampaignEmail construit le message : langue résolue (FR par défaut
// documenté, EN si connue et fournie), variables substituées avec échappement,
// désinscription en un clic quand il y a une publication — sinon mention des
// préférences du compte, jamais de lien inventé.
func (w *StaffCampaignWorker) buildCampaignEmail(ctx context.Context, campaignID string, c admin.CampaignClaim) (EmailMessage, error) {
	info, err := w.svc.CampaignSendContext(ctx, campaignID, c.Email)
	if err != nil {
		return EmailMessage{}, err
	}
	subject, body := info.SubjectFR, info.BodyFR
	if info.Locale == "en" && info.SubjectEN != "" && info.BodyEN != "" {
		subject, body = info.SubjectEN, info.BodyEN
	}
	// Lien de désinscription : seulement s'il mène à une vraie désinscription
	// en un clic (abonnés d'une publication, chemin VerifyUnsubscribe). Sans
	// publication, pas d'en-tête mensonger : le corps mentionne les préférences
	// du compte.
	unsub := ""
	if info.PublicationID != "" {
		unsub = buildUnsubURL(info.PublicationID, c.Email)
	} else {
		body += "\n\nGérez vos préférences depuis votre compte qoe.fi.\nManage your preferences from your qoe.fi account."
	}
	body = admin.RenderCampaignVars(body, info.PublicationName, unsub)
	msg := EmailMessage{
		From:    w.from,
		To:      c.Email,
		Subject: subject,
		HTML:    renderEmailLayout(info.PublicationName, "", "", subject, subject, body, unsub, ""),
		Text:    body,
		IsBulk:  true,
	}
	if info.PublicationName != "" {
		msg.From = fmt.Sprintf("%s <%s>", info.PublicationName, w.from)
	}
	if unsub != "" {
		msg.ListUnsubscribe = unsub
	}
	return msg, nil
}
