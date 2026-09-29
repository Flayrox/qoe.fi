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
# PLUS / SOUTIEN (❌, phases fiche) :
#   P1 : hors-ligne (articles, podcasts, collections), TTS + file d'écoute,
#     surlignages/notes illimités + recherche dedans, IA utile (résumé,
#     explique) à quota, badge discret.
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
# ── RÈGLES COMMUNES ──────────────────────────────────────────────────
# Pas de checkout avant Stripe (ni faux bouton d'achat, ni fausse waitlist
# sans stockage) : les CTA Pro affichent « lancement prochain » + contact
# support. emailPro est l'intérim (webhook Stripe → SET emailPro).
# Ne jamais mettre en payant : lecture publique, abonnement auteur,
# publication, commentaires, recherche publique, accessibilité (taille
# texte, dark mode), collections simples, export de SES données de base.
