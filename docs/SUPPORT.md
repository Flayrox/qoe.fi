# =====================================================================
# 🎫 Support général (tranche 6) — contrat et garde-fous
# =====================================================================
# Le recours (docs/ABUSE_DECISIONS.md) conteste une mesure précise avec
# effet ; le support couvre le RESTE. Deux bounded contexts séparés
# (tables, statuts, règles propres) : un recours n'est pas un ticket,
# un ticket ne lève rien — jamais de bouton universel.
#
# DOSSIERS (tables SupportTicket/SupportMessage, migration 00043) :
#   - Kinds : account_restricted, account_lost, content_moderation,
#     api_access, import_issue, delivery, report_issue, other.
#   - Statuts : open → under_review → closed (pas de retour, pas de
#     sur-place ; rouvrir = nouveau dossier, historique conservé).
#   - UN SEUL dossier ouvert par (ouvreur, kind) — index unique partiel
#     (anti-saturation) : le reste s'écrit DANS le dossier (messages
#     1-5000, cascade à la suppression).
#   - relatedType/relatedId lient sans FK (appeal:xxx, decision:xxx,
#     import:xxx...) : découplé, requêtable, jamais bloquant.
#
# GARANTIES (verrouillées par tests + smoke dev) :
#   - Ouverture accessible Y COMPRIS restreint (l'auth n'exclut pas les
#     suspendus) ; l'ouverture NE CHANGE RIEN (ni suspension levée, ni
#     permission accordée) — seuls des actes staff explicites agissent,
#     par les chemins existants, jamais dans le support.
#   - Conflit d'intérêts : on ne clôt JAMAIS son propre dossier (refusé).
#     L'assignation à soi-même est tracée mais tolérée (structure solo :
#     interdire bloquerait tout).
#   - Pas de fuite : le dossier d'autrui est 404 (pas 403) ; staffNote
#     exclu des listes (motifs internes ≠ explication communicable).
#   - Clos = clos (410 sur écriture, 410 sur décision).
#
# ROUTES :
#   - Lecteur /v1/support/tickets (+/{id}, +/{id}/messages) — page /support.
#   - Staff /v1/admin/support/tickets (+/{id}, +/{id}/assign [POST],
#     +/{id} [PATCH], /metrics) — console /admin/support (file, dossier,
#     prise en main, note + réponse, clôture, charge : compteurs,
#     ancienneté, délai moyen 30 j).
#
# RÉSIDUS ASSUMÉS (lots à part, pas des oublis) :
#   - Pièces jointes : messages texte seuls (pas d'infra d'upload
#     contrôlée — pas d'upload sauvage en attendant).
#   - Notifications (réponse/clôture) : NotificationType est un ENUM fermé
#     (ALTER TYPE + régén sqlc + prefs + rendu front = lot à part).
#   - SLA/astreinte, séparation agent/réviseur imposée, export RGPD :
#     process et échelle — les champs (assignee, horodatages, messages)
#     sont prêts, l'organisation suivra l'équipe.
