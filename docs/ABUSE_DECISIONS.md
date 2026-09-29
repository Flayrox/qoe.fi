# =====================================================================
# 🛡️ Noyau anti-abus — signaux, budgets, décisions, revue (fiche 06 §8-§9)
# =====================================================================
# Un signal faible ne punit jamais. L'anti-abus observe (faits), plafonne
# (budgets atomiques) et propose (verdicts) ; seuls les humains sanctionnent,
# par les chemins de modération existants. Aucun bouton universel qui
# mêlerait qualité, danger et consentement.

# FAITS (AbuseSignal, migration 00039) :
#   - signup.attempt (confiance 70, fait constaté) : toute inscription,
#     sujet = la publication visée. Rétention 24 h.
#   - report.filed (confiance 30, alerte ≠ preuve) : tout signalement,
#     sujet = report_target:<type>:<id>. Rétention 7 j.
#   - Enregistrement best-effort : une panne n'invalide jamais l'action
#     métier (inscription, signalement). Pool nil = no-op.
#
# BUDGETS (CapabilityBudget, migration 00038, package abuse) :
#   - Confirmations : 3/j par (adresse, publication), 2000/j par publication,
#     sur les 3 voies (publique, clé API, connectée). Au-delà : demande en
#     attente, aucun e-mail, réponse neutre. Plafond ≠ erreur.
#   - Voir docs/CONSENT_OPTIN.md (budgets anti-harcèlement).
#
# VERDICTS (RiskDecision, 00039 + note en 00040, politique abuse-core/v1) :
#   - signup-burst (100 inscriptions/10 min/publication) et report-swarm
#     (10 signalements/1 h/même cible) → needs_review. Jamais de sanction
#     automatique : un essaim n'est pas une preuve (fiche §8).
#   - `allow` ne persiste aucun verdict ; le reste est tracé (politique,
#     version, raisons, auteur auto/humain, expiration, note, recours futur).
#   - Invariants verrouillés par les tests : identité du sujet dans Match,
#     normalisation UTC (TIMESTAMP sans fuseau), tolérance arrondi ms (1 s),
#     départage même milliseconde (l'humain prime).
#
# REVUE STAFF (GET|PATCH /v1/admin/abuse/decisions, superadmin) :
#   - Liste = dernier verdict non `allow` et non expiré par sujet, avec
#     nombre de faits récents en contexte (pas preuve).
#   - Clôture ∈ {allow, limit_distribution, pause_sending, suspend} ;
#     slow/challenge/needs_review refusés (états, pas verdicts). `allow` =
#     classé sans suite = le faux positif mesuré (fiche §11). Re-clôture et
#     dossier inexistant = refus explicites. Le verdict reprend les raisons
#     de l'automate + human:<résultat>, auteur et note.
#   - Rappel : le verdict n'est qu'une trace — l'acte (suspension,
#     limitation...) passe par les chemins de modération existants.
#
# EXPLOITATION : seuils côté serveur uniquement (jamais exposés — fiche §10 :
# ne pas aider l'attaquant à calibrer). Dossiers expirés (72 h) = plus une
# urgence. Signaux expirés purgés par expiresAt (pas de fichier perpétuel).
