package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/qoefi/api/internal/modules/imports"
	"github.com/qoefi/api/internal/queue"
)

// ImportSendWorker exécute les vagues d'envoi encadré (TaskSubscriberImportSend,
// file `import_send`). Une exécution traite une tranche plafonnée puis rend la
// main : si la vague continue et que le budget le permet, elle ré-enfile
// elle-même la tranche suivante avec un délai. Le traitement détaillé
// (réservation atomique du budget, création d'abonnés inactifs, suspension
// automatique) vit dans le module imports — ici un adaptateur asynq + l'envoi.
//
// Le contenu envoyé n'est PAS une campagne créateur : c'est un message de
// présentation standard, versionné ici (template v1), qui dit honnêtement
// pourquoi la personne le reçoit (liste importée, approbation qoe.fi), propose
// de confirmer l'abonnement (seule voie vers `confirmedAt`) et offre une
// désinscription évidente. Aucun contenu créateur arbitraire ne transite.
type ImportSendWorker struct {
	svc      *imports.Service
	provider EmailProvider
	from     string
	ac       *asynq.Client
}

func NewImportSendWorker(svc *imports.Service) *ImportSendWorker {
	return &ImportSendWorker{svc: svc}
}

// SetEmailProvider branche le fournisseur d'envoi partagé.
func (w *ImportSendWorker) SetEmailProvider(p EmailProvider, from string) {
	w.provider = p
	w.from = from
}

// SetAsynqClient branche le client pour ré-enfiler la tranche suivante.
func (w *ImportSendWorker) SetAsynqClient(ac *asynq.Client) { w.ac = ac }

// HandleImportSendWave traite une tranche de vague. Idempotent : rejouer la
// tâche ne réenvoie jamais deux fois à la même adresse (réclamation
// `FOR UPDATE SKIP LOCKED`, livraisons déjà traitées ignorées, budget atomique).
func (w *ImportSendWorker) HandleImportSendWave(ctx context.Context, t *asynq.Task) error {
	var p queue.SubscriberImportSendPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("payload envoi encadré: %w", err)
	}
	if p.WaveID == "" {
		return fmt.Errorf("waveId manquant")
	}
	if w.provider == nil {
		log.Printf("[import-send] vague %s : aucun fournisseur email configuré (EMAIL_PROVIDER), tranche ignorée", p.WaveID)
		return nil
	}

	claims, err := w.svc.ClaimSendChunk(ctx, p.WaveID, imports.SendChunkSize())
	if err != nil {
		return err
	}
	for _, c := range claims {
		msg, buildErr := w.buildIntroEmail(ctx, p.WaveID, c)
		if buildErr != nil {
			_ = w.svc.MarkSendResult(ctx, p.WaveID, c.DeliveryID, false, buildErr.Error(), false)
			continue
		}
		sendErr := w.provider.Send(ctx, msg)
		hard := sendErr != nil && imports.IsHardBounce(sendErr.Error())
		if markErr := w.svc.MarkSendResult(ctx, p.WaveID, c.DeliveryID, sendErr == nil, errText(sendErr), hard); markErr != nil {
			log.Printf("[import-send] vague %s marquage %s: %v", p.WaveID, c.Email, markErr)
		}
		if sendErr != nil {
			log.Printf("[import-send] vague %s → %s : %v", p.WaveID, c.Email, sendErr)
		}
	}

	// Suspension automatique : les seuils (rejets durs, plaintes) stoppent la
	// vague avant la tranche suivante, pas après.
	suspended, err := w.svc.EvaluateSendSuspension(ctx, p.WaveID)
	if err != nil {
		return err
	}
	if suspended {
		return nil
	}
	finished, err := w.svc.FinishSendWaveIfDrained(ctx, p.WaveID)
	if err != nil {
		return err
	}
	if !finished && w.ac != nil {
		if err := queue.PublishImportSendWave(w.ac,
			queue.SubscriberImportSendPayload{WaveID: p.WaveID},
			imports.SendChunkDelay()); err != nil {
			return fmt.Errorf("ré-enfilement vague %s: %w", p.WaveID, err)
		}
	}
	return nil
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

// importIntroVersion versionne le contenu du message de présentation : une
// modification du texte passe par une nouvelle version, jamais par une
// réécriture silencieuse du template.
const importIntroVersion = "v1"

// buildIntroEmail construit le message de présentation : bilingue FR/EN dans
// le même corps — la langue du destinataire est inconnue à ce stade (aucun
// Subscriber préexistant), et inventer une locale serait malhonnête. Le lien
// « confirmer » porte le jeton frais créé à la réclamation ; le lien de
// désinscription est celui du chemin normal (VerifyUnsubscribe ne requiert ni
// compte ni abonnement actif).
func (w *ImportSendWorker) buildIntroEmail(ctx context.Context, waveID string, c imports.SendClaim) (EmailMessage, error) {
	info, err := w.svc.SendRecipientContext(ctx, waveID, c.Email)
	if err != nil {
		return EmailMessage{}, err
	}
	confirm := buildConfirmURL(confirmEmailBaseURL(), info.PublicationID, c.Email, c.Token)
	unsub := buildUnsubURL(info.PublicationID, c.Email)

	subject := fmt.Sprintf("%s — un message à lire avant de vous abonner / a message before you subscribe", info.PublicationName)
	bodyHTML := fmt.Sprintf(`<p>Bonjour,</p>
<p>Vous recevez cet e-mail car la publication <strong>%s</strong> a importé une liste d'adresses vous incluant, et qoe.fi a approuvé cet envoi encadré après revue du dossier. <strong>Vous n'êtes abonné(e) à rien pour l'instant.</strong></p>
<p><a href="%s" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:9999px;">Confirmer mon abonnement</a></p>
<p>Si ce message ne vous concerne pas, ignorez-le ou <a href="%s">désinscrivez-vous en un clic</a> — vous ne serez plus jamais contacté(e) pour cette publication.</p>
<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
<p>Hello,</p>
<p>You are receiving this email because the publication <strong>%s</strong> imported a mailing list including your address, and qoe.fi approved this supervised sending after review. <strong>You are not subscribed to anything yet.</strong></p>
<p><a href="%s" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:9999px;">Confirm my subscription</a></p>
<p>If this message is not for you, ignore it or <a href="%s">unsubscribe in one click</a> — you will never be contacted again for this publication.</p>`,
		info.PublicationName, confirm, unsub,
		info.PublicationName, confirm, unsub)
	text := fmt.Sprintf(`Bonjour,

Vous recevez cet e-mail car la publication %s a importé une liste d'adresses vous incluant, et qoe.fi a approuvé cet envoi encadré après revue. Vous n'êtes abonné(e) à rien pour l'instant.

Confirmer mon abonnement : %s
Si ce message ne vous concerne pas, ignorez-le ou désinscrivez-vous en un clic : %s

---
Hello,

You are receiving this email because the publication %s imported a mailing list including your address, and qoe.fi approved this supervised sending after review. You are not subscribed to anything yet.

Confirm my subscription: %s
If this message is not for you, ignore it or unsubscribe in one click: %s`,
		info.PublicationName, confirm, unsub,
		info.PublicationName, confirm, unsub)

	from := w.from
	if info.PublicationName != "" {
		from = fmt.Sprintf("%s <%s>", info.PublicationName, w.from)
	}
	return EmailMessage{
		From:            from,
		To:              c.Email,
		Subject:         subject,
		HTML:            renderEmailLayout(info.PublicationName, "", "", subject, subject, bodyHTML, unsub, ""),
		Text:            text,
		ListUnsubscribe: unsub,
		IsBulk:          true,
	}, nil
}
