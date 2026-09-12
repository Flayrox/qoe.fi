# =====================================================================
# ✅ Double opt-in — contrat et garde-fous
# =====================================================================
# La boucle de croissance (SubscribeForm → POST /v1/home/subscribe) annonce
# « vérifiez votre boîte mail » : ce contrat est désormais RÉEL. Ce qui était
# en place avant (côté créateur/infra) et ce qui a été ajouté ici :

# AVANT (déjà existant) :
#   - POST|GET /v1/newsletters/unsubscribe (RFC 8058 one-click, HMAC timing-safe)
#   - workers email (SMTP self-hosté / Resend), envois bulk rate-limités
#   - événement subscriber.created → webhooks créateur
#
# AJOUTÉ (double opt-in, consentement démontrable RGPD/CNIL + délivrabilité) :
#   - Subscriber.confirmedAt + confirmationToken (migration 00020, backfill
#     confirmé pour les abonnés historiques)
#   - POST /v1/home/subscribe : crée l'abonné SANS receiveArticles avec un
#     token, et enfile asynq "subscriber.confirm" (best-effort, nil-safe).
#     Une adresse DÉJÀ confirmée qui se réinscrit est réactivée direct
#     (receiveArticles=true) — elle a déjà prouvé la possession de sa boîte.
#   - Worker ConfirmEmailWorker (cmd/worker) : envoie l'email de confirmation
#     (lien signé HMAC via QOE_CONFIRM_BASE_URL, défaut api.qoe.fi), no-op si
#     l'abonné a déjà confirmé (idempotent) ou si EMAIL_PROVIDER est absent.
#   - GET|POST /v1/newsletters/confirm?pub=&email=&token=&sig= : signature
#     HMAC timing-safe (miroir de l'unsubscribe), token à usage unique
#     (replay → 409), active receiveArticles + horodate confirmedAt.
#   - GARDE-FOU CONSENTEMENT : les fanouts bulk (InsertNewsletterDeliveries,
#     InsertArticleReleaseDeliveries) excluent confirmedAt IS NULL — un
#     abonné non confirmé ne reçoit JAMAIS d'email bulk. Test de contrat :
#     TestBulkFanout_NeverMailsUnconfirmedSubscribers.
#   - Les canaux AUTHENTIFIÉS confirment d'office (pas de friction) :
#     UpsertSubscriber (studio/API clé), UpsertSubscriberPayment (Stripe),
#     devtools seed. Stripe Confirme aussi en cas de conflit sur un abonné
#     en attente (relation facturée vérifiée).

# Délivrabilité : plus aucun bounce de typo entrant dans les envois bulk
# (l'adresse doit avoir cliqué le lien), plus d'inscription possible d'un
# tiers à son insu. Le unsubscribe RFC 8058 reste le droit de retrait.
