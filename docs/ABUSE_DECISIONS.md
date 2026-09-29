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
# RAIDS DE SIGNALEMENT (règle report-volume, branchée dans posts.Report) :
#   - 10 signalements/h par le MÊME reporter (toutes cibles) → needs_review
#     sur le reporter (raison swarm.report.reporter). Le dossier s'ouvre sur
#     lui seul : ses cibles (1 alerte chacune) n'ont aucun dossier.
#   - L'essaim contre la cible (report-swarm) et le volume du reporter sont
#     deux compteurs indépendants, évalués au même moment, best-effort.
#
# RÉTENTION (abuse.PurgeExpiredAbuseData, tick du worker planifié) :
#   - Signaux expirés (expiresAt dépassé) + fenêtres de budget > 7 j :
#     supprimés. Idempotent, rejoué au tick suivant en cas d'échec.
#   - Les verdicts (RiskDecision) ne sont JAMAIS purgés : actes traçables,
#     leur sort relève de l'archivage juridique, pas du ménage.
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
# ÉLIGIBILITÉ (package abuse/eligibility.go, branché dans home_feed.go) :
#   - Limitation humaine (limit_distribution, sujet user:<id> ou
#     publication:<id>) : hors discover/recommended, PRÉSENT en following.
#   - Refus dur (suspend humain ou isSuspended) : hors TOUT, suivi inclus.
#   - Seuls les verdicts humains excluent (jamais l'automate seul).
#   - RÉSIDU : le following exclut encore les isShadowbanned sans le dire —
#     suppression silencieuse du suivi, à corriger par une UX (auteur suivi
#     restreint visible avec son échéance), pas par un filtre.
#
# MÉTRIQUES (GET /v1/admin/abuse/metrics?days=30, superadmin — fiche §11) :
#   - Verdicts auto par résultat et par raison (quel déclencheur parle ?),
#     revues humaines (classements vs escalades), taux de classement
#     (LE faux positif : allow après revue / revues, -1 si aucune revue),
#     profondeur de la file ouverte, top 10 sujets chauds (signaux récents
#     + dernier verdict — prioriser selon le risque réel, pas le bruit).
#   - Lecture seule, fenêtre 1-90 j. Les chiffres de succès ne sont jamais
#     « nombre de comptes bannis ».
#
# COUPE-FEU INSCRIPTIONS (flag abuse.signup-kill, fiche 06 §10) :
#   - Engagé → les 3 voies (publique, clé API, connectée) refusent en 503
#     explicite + Retry-After, AVANT toute écriture. Les confirmations de
#     clics en cours aboutissent (on ne punit pas les légitimes en attente).
#   - Lecture directe de feature_flags (effet immédiat, pas de cache TTL) ;
#     clé absente ou DB en panne → autorisé + 1 log (dégradation ouverte).
#   - Miroir TS @qoe/flags ; parité Go/TS verrouillée par test.
#
# INCIDENTS (table AntiAbuseIncident 00041, endpoints staff — fiche §9-§10) :
#   - Dossier tenu par le STAFF (qualifier une attaque = jugement humain) :
#     kind fermé (account_farm, report_raid, signup_flood, api_abuse,
#     impersonation, spam_wave, other), portée, impact, mesures.
#   - Statut qui avance sans se réécrire (open → contained → resolved,
#     reopened sans effacer ; resolved → open direct interdit). Les mesures
#     s'ajoutent horodatées et signées (matière du bilan et de la
#     communication publique : mesures, impacts, correction, recours).
#   - Clôture signée (resolvedBy/resolvedAt) ; réouverture qui efface la
#     signature mais garde l'historique.
#
# DÉCISIONS ASSUMÉES (ce que la fiche propose et qu'on ne fait PAS tel quel) :
#   - TrustStatus (table de capacités vérifiées) : REFUSÉ comme table —
#     l'état dérive des verdicts humains RiskDecision (éligibilité), pas
#     d'un booléen « trusted » dupliqué qui divergerait. Même besoin,
#     zéro divergence possible.
#   - ModerationCase unifié (preuves, chronologie) : couvert à l'échelle
#     actuelle par les trois registres (ModerationReport, RiskDecision,
#     AntiAbuseIncident) — un dossier unifié se justifiera au volume, pas
#     avant (pas de sur-construction).
#   - SMS (§12) : pas de fournisseur → rien à brancher. Le jour venu, les
#     codes relèveront de CapabilityBudget (même mécanisme que les
#     confirmations : plafond par (numéro, capacité, jour), réponse neutre).
#     En attendant, phone_verified reste faux et le refus est honnête.
#
# EXPLOITATION : seuils côté serveur uniquement (jamais exposés — fiche §10 :
# ne pas aider l'attaquant à calibrer). Dossiers expirés (72 h) = plus une
# urgence. Signaux expirés purgés par expiresAt (pas de fichier perpétuel).
