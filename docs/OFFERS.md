# =====================================================================
# 💎 Offres Qoefi — matrice produit (source de vérité)
# =====================================================================
# Deux abonnements, deux publics (décision produit TRANCHÉE) :
#   - PRO = auteurs/médias (personnalisation, domaines, outils pro).
#   - PLUS (« Soutien ») = lecteurs (bibliothèque, hors-ligne, audio, IA).
#   - PRO INCLUT PLUS : un journaliste qui prend Pro pour le studio
#     bénéficie aussi de l'app lecteur, sans surcoût (zéro frais
#     supplémentaire — c'est le truc : un seul abonnement à comprendre).
#
# Convention d'URL (décision produit) : l'app démarre en FR mais les slugs
# et routes sont en ANGLAIS (/appeals pas /recours, /pricing pas /offre,
# slugs d'articles kebab-case anglais). Anciennes routes FR = 301 permanent
# (bookmarks et liens en vol préservés, jamais de 404 sèche).
#
# Principe (fiche Plus) : ce qui crée le réseau reste GRATUIT (lire,
# publier, suivre, commenter, collections de base, dark mode, réglages
# essentiels) ; ce qui rend l'usage individuel puissant peut être premium.
# L'accessibilité n'est jamais un luxe ; les coûts variables (IA, TTS,
# stockage) sont quotés. Prix indicatifs fiche : 3,99–4,99 €/mois,
# 35–45 €/an — À CONFIRMER, pas un engagement.
#
# LÉGENDE : ✅ existe · 🔶 partiel · ❌ roadmap (phase fiche).
#
# ── LECTEUR ──────────────────────────────────────────────────────────
# GRATUIT (tout existe) : lire publics, podcasts streaming, suivre,
# commenter/discuter, bibliothèque + favoris de base, clair/sombre,
# réglages essentiels, recommandations, feed.
# PLUS / SOUTIEN (partiel — vagues livrées, voir ci-dessous) :
#   P1 :
#   - ✅ Surlignages : illimités pour tous (gratuit & Plus). Pas de quota,
#     sauvegarde et synchronisation transparentes.
#   - ✅ Droits auteur téléchargement (Article.allowDownload, défaut
#     Publication.allowDownloadDefault — opt-out, true par défaut) :
#     l'auteur choisit, toggle studio immédiat (hors autosave), défaut
#     réglable (PATCH settings, pas d'UI dédiée — même statut que les
#     autres défauts). Garde partagée avec l'édition (authorizeEdit).
#   - ✅ Pack hors-ligne GET /v1/articles/{id}/offline-pack (Plus + publié
#     + droit auteur + paywall respecté comme à l'écran, versionné v1) et
#     file d'écoute /v1/me/listen-later (ajout gratuit mais contenu
#     vérifié, idempotent, ordonnée, retrait idempotent).
#     403 + codes stables (OFFLINE_PACK_REQUIRES_PLUS, NOT_DOWNLOADABLE…).
#   - ✅ IA utile (résumé fidèle d'article + explication d'extrait) :
#     provider pluggable (OpenAI-compatible, nil = 503 explicite — même
#     doctrine que les e-mails), quotas 50/mois/user + plafond global
#     10 000/j (anti-facture), 429 explicites, remboursement sur échec
#     (on ne facture jamais un échec), paywall respecté comme la lecture,
#     /v1/ai/usage (transparence avant usage). UI : bouton résumé replié
#     + action Expliquer dans le popover, TOUJOURS présenté comme IA avec
#     lien au texte, états 403/429/503 actionnables. Sans clé : 503 honnête.
#   - ✅ TTS gaté (bouton existant + cadenas + upsell via /v1/me/entitlements,
#     hook usePlus 1 appel/session, neutre en chargement) ; file d'écoute
#     lue côté player = lot suivant (le TTS lit déjà les files MediaSession).
#   - ✅ Thèmes premium (Nuit chaude, Papier — cadenassés, sélecteur ajouté
#     au panneau qui n'en avait pas) ; gratuits intacts (accessibilité).
#   - ✅ Reprise « au paragraphe près » : la progression garde le premier
#     paragraphe VISIBLE (granularité assumée — un offset de caractères
#     donnerait une fausse précision et dériverait au moindre changement de
#     rendu). Rouvrir un livre de 300 pages retombe où on s'était arrêté,
#     l'écoute vocale fait autorité pendant qu'elle lit.
#   - ✅ Écouter un livre : le lecteur d'EPUB réutilise le moteur TTS des
#     articles (mêmes commandes, même lecteur flottant), gaté Plus comme
#     les autres usages coûteux ; changement de chapitre = arrêt de
#     l'écoute (un livre ne se lit pas tout seul).
#   - ✅ Emporter hors-ligne (Plus) : GET /v1/me/ebooks/{id}/offline-pack
#     (enveloppe versionnée) + magasin client générique (packs, éviction du
#     plus ancien, quota plein dit honnêtement). Pas de « droit auteur »
#     ici : c'est VOTRE fichier, le seul droit en jeu est l'abonnement.
#     Le magasin est déjà prêt pour d'autres charges (épisodes audio).
#   - ✅ Notes de lecture DANS un EPUB : passage sélectionné et/ou mot à soi,
#     ancrés à un chapitre, en table DÉDIÉE (les surlignages d'articles
#     gardent la leur — public/votés — aucun mélange). Jamais publiques,
#     jamais votées, cascade avec le livre ; extrait tronqué à 1000, note
#     écrite refusée au-delà de 4000 (jamais coupée), les deux vides = 400.
#   - ✅ Toutes mes notes (/library/ebooks/notes) : vue transversale, filtre
#     insensible aux accents, export Markdown groupé par livre et chapitre.
#   - ❌ podcasts offline, badge. NOTE HONNÊTE : le mot « podcast » n'existe
#     NULLE PART dans le code (aucun modèle audio, ni table ni champ) — le
#     hors-ligne est donc prêt côté magasin, mais la brique podcast
#     elle-même reste à modéliser avant d'être gatée.
#   - ✅ EPUB personnels (« Mes livres ») : import .epub (20 Mo, borné),
#     parseur allowlist maison (titres/paragraphes/citations/emphases ;
#     scripts, styles, iframes, images et handlers JAMAIS stockés — XSS
#     impossible par construction, pas par filtrage), couverture privée,
#     chapitres lus un par un, recherche DANS le livre instantanée (locale,
#     insensible aux accents, extraits centrés), progression synchronisée
#     multi-appareils (last-write-wins assumé). Parseur fuzzé (invariant :
#     rien hors allowlist ne peut sortir). 5 gratuits puis quotas :
#     illimités en Plus,
#     403 EBOOK_QUOTA_EXCEEDED (les livres existants restent lisibles),
#     409 EBOOK_DUPLICATE (dédup par empreinte), aucune route publique par
#     id — un livre d'autrui ressemble à un inexistant.
#   P2 : collections intelligentes, digests, RSS/newsletters import,
#     extension navigateur, thèmes/polices avancés, exports Markdown.
#   P3 : recherche sémantique perso, flashcards/répétition espacée, API
#     perso/webhooks, envoi liseuses, icônes.
#   Garde-fous : quotas IA/TTS/stockage transparents ; l'auteur choisit si
#   son contenu est téléchargeable/exportable (consentement auteur).
#
# ── AUTEUR / MÉDIA ───────────────────────────────────────────────────
# GRATUIT (existe) : publier, newsletters (template classique nom+logo),
# abonnés, audience de base, API/developer, imports (staff-validés).
# PRO (✅ emailPro — Migration 00045, toggles staff) : nom d'expéditeur,
# reply-to, accent, sujets, aperçus, note de pied, corps du bienvenue —
# en version UNIQUE (fini le par-langue). Détails docs/CONSENT_OPTIN.md.
# PRO (❌) : domaine personnalisé + DKIM/SPF/DMARC (tranche 7, attend le
# domaine), statistiques avancées, webhooks auteur ? (à cadrer).
#
# ── OCTROIS MANUELS (intérim Stripe, table SubscriptionGrant) ──────────
# Le staff attribue sans abonnement : Pro offert/presse/test, Plus offert,
# programmé (début futur), fin datée. Source UNIQUE (HasEntitlement :
# startsAt <= now < endsAt) — fini la colonne miroir. Pas de suppression :
# révoquer = finir maintenant (historique). Pas de sweep (l'échéance est
# une condition de lecture). Stripe, plus tard : le webhook appelle les
# MÊMES fonctions (période payée = octroi, impayé = révocation).
#
# ── RÈGLES COMMUNES ──────────────────────────────────────────────────
# Pas de checkout avant Stripe (ni faux bouton d'achat, ni fausse waitlist
# sans stockage) : les CTA Pro affichent « lancement prochain » + contact
# support.
# Ne jamais mettre en payant : lecture publique, abonnement auteur,
# publication, commentaires, recherche publique, accessibilité (taille
# texte, dark mode), collections simples, export de SES données de base.
