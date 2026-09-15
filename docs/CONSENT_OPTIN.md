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
#
# LANGUES ET PERSONNALISATION (studio → réglages publication → onglet Emails) :
#   - Langues d'emails : QOE_EMAIL_LOCALES (défaut « fr,en », ex. « fr,en,es »).
#     Ajouter une langue = ajouter un code dans l'env ; tout est piloté par
#     clés « template.locale » côté Publication.emailSettings, la 1re langue
#     de la liste est la langue de repli. Le panneau studio génère ses
#     onglets depuis GET /v1/settings/email (champ `locales`).
#   - POST /v1/settings/email/preview : rendu réel (moteur des workers) en
#     fr/en/es/… pour l'aperçu live du panneau.
#   - POST /v1/settings/email/test : envoie un VRAI email de test à l'adresse
#     du compte créateur (sujet préfixé [TEST], RefID test-*), brouillon du
#     panneau accepté — tester avant de sauvegarder. 503 explicite si
#     EMAIL_PROVIDER n'est pas configuré sur l'instance.
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

# =====================================================================
# 🌍 Emails d'abonnés localisés et personnalisables (migration 00022)
# =====================================================================
#
# LANGUE — chaque email part dans la langue de l'abonné :
#   - Subscriber.locale (défaut fr) captée à l'inscription : ?locale= puis
#     Accept-Language côté API, cookie/header x-locale côté SDK
#     (subscribeToNewsletterAction). Bornée fr/en.
#   - FR/EN : confirmation, bienvenue, mentions de consentement,
#     libellés de liens. NormalizeEmailLocale borne tout à fr/en.
#
# PERSONNALISATION — Publication.emailSettings (JSONB), édité via
#   GET|PATCH /v1/settings/email (module settings, autorisation créateur) :
#   fromName, replyTo, accentColor (boutons), logoUrl, subjects{confirm,
#   welcome}, preheaders{confirm, welcome}, footerNote, welcomeBodyFr/En,
#   welcomeEnabled (false = l'email de bienvenue est coupé).
#   Validation : workers.ParseEmailPrefs — bornes strictes, valeurs
#   invalides IGNORÉES jamais bloquantes ; ce qui est stocké est assaini.
#
# BIENVENUE — envoyé au clic de confirmation (le vrai moment « abonné
#   actif ») : ConfirmSubscriber enfile asynq subscriber.welcome →
#   WelcomeEmailWorker. Idempotent, nil-safe, no-op sans EMAIL_PROVIDER,
#   silencieux si le créateur l'a désactivé.
#
# DÉLIVRABILITÉ (moteur email_content.go + en-têtes email_provider.go) :
#   - multipart/alternative texte + HTML quoted-printable (note
#     SpamAssassin MultipartMessageNeeded) pour confirm, welcome ET bulk ;
#   - preheader d'aperçu, bouton en couleur d'accent contrastée, aucune
#     police monospace (option Apple), tables Outlook-compatible ;
#   - List-Id (liste slugifiée + domaine), X-Entity-Ref-ID unique
#     (anti-threading Gmail), List-Unsubscribe + List-Unsubscribe-Post
#     One-Click (RFC 8058) ; Reply-To personnalisable.
#
# Tests : TestNormalizeEmailLocale, TestParseEmailPrefs_*,
#   TestResolveCustomization_LocalePicksBody,
#   TestRenderTransactionEmail_* (multipart, échappement, monospace),
#   TestWelcomeEmailWorker_* (fr/en, personnalisation, désactivation,
#   silences), TestHandler_EmailSettings_* (API),
#   TestSubscribeToNewsletter_StoresLocale, TestBuildHandlers (wiring).
