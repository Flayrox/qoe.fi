-- =====================================================================
-- 📨 Import d'abonnés — livraison RÉCLAMÉE par un worker (`claimed`)
-- =====================================================================
-- 00033 a posé le cycle de vie d'une livraison d'envoi encadré, mais il
-- manquait l'état entre « en file » et « envoyée » : `queued` restait vrai
-- pendant tout l'envoi. Conséquence : `FOR UPDATE SKIP LOCKED` ne protège que
-- le temps de la transaction de réclamation — après le commit, la ligne
-- regardait encore `queued`, donc un second worker (ou un retry après crash)
-- la réclamait à nouveau et envoyait un second e-mail à la même personne.
--
-- `claimed` matérialise la réservation : la livraison est sortie de la file
-- au moment où son budget est consommé et son jeton créé, dans la MÊME
-- transaction. L'issue reste inconnue jusqu'au marquage (`sent`/`failed`) ;
-- un `claimed` dont le worker a disparu est repris après expiration d'un bail
-- (voir sendClaimLease côté Go), jamais perdu en silence.
--
-- Ce que ça n'autorise pas : `claimed` n'est pas « envoyée ». Aucun compteur
-- d'envoi ne l'avance, et la clôture d'une vague attend qu'il soit tranché.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
ALTER TABLE "ImportSendDelivery"
    DROP CONSTRAINT IF EXISTS "ImportSendDelivery_status_check";
ALTER TABLE "ImportSendDelivery"
    ADD CONSTRAINT "ImportSendDelivery_status_check" CHECK ("status" IN (
        'queued', 'claimed', 'sent', 'failed', 'skipped', 'suppressed'
    ));
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Les livraisons réclamées mais non tranchées reviennent en file : c'est leur
-- état le plus prudent sans l'état `claimed` (jamais envoyées silencieusement,
-- jamais perdues).
UPDATE "ImportSendDelivery"
SET "status" = 'queued', "updatedAt" = now()
WHERE "status" = 'claimed';

ALTER TABLE "ImportSendDelivery"
    DROP CONSTRAINT IF EXISTS "ImportSendDelivery_status_check";
ALTER TABLE "ImportSendDelivery"
    ADD CONSTRAINT "ImportSendDelivery_status_check" CHECK ("status" IN (
        'queued', 'sent', 'failed', 'skipped', 'suppressed'
    ));
-- +goose StatementEnd
