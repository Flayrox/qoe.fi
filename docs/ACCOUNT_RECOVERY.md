# Récupération de compte après perte de facteurs (fiche 05 §8)

> Perdre ses facteurs n'est pas perdre son mot de passe : la récupération
> restaure un accès privilégié, elle suit donc une procédure graduée avec
> revue humaine — jamais un raccourci SMS/e-mail qui donnerait immédiatement
> accès à un média.

## Ce que la technique garantit déjà

- `POST /v1/admin/users/{userID}/revoke-sessions` (superadmin uniquement,
  rôle vérifié dans le service, journalisé `account.sessions_revoked`) :
  révoque **toutes** les sessions du compte côté GoTrue, y compris élevées.
  Pas de révocation partielle possible côté fournisseur — le périmètre large
  est assumé et communiqué à l'utilisateur.
- Sans `SetUsersService` branché : 503 explicite, pas de contournement.
- Le retrait/remplacement du dernier facteur reste une action N2 côté garde ;
  la récupération ci-dessous concerne la perte totale (plus aucun facteur).

## Procédure graduée

1. **Recevoir** : demande écrite depuis une adresse déjà connue du compte si
   possible. Noter l'heure, le canal, l'identité déclarée. Ne rien promettre
   sur le délai.
2. **Vérifier** (au moins deux éléments indépendants) : pièce d'identité,
   preuve de contrôle d'une adresse du compte, historique de facturation ou
   d'activité vérifiable en base, contact d'un co-responsable connu pour les
   médias. Un SMS seul ne prouve rien (SIM swap) et ne débloque jamais seul.
3. **Geler si doute** : en cas de compromission suspectée (pas seulement de
   perte), révoquer d'abord les sessions via la route ci-dessus, puis instruire.
4. **Délai de sûreté** : 24–72 h entre la vérification et la réactivation pour
   un propriétaire de média ou un staff. Le demandeur est prévenu du délai ;
   toute tentative de pression pour l'écourter est un signal négatif.
5. **Réactiver** : accompagner l'enrôlement d'un nouveau facteur (TOTP ou
   passkey selon `docs/GOTRUE_AUDIT.md`), vérifié avant activation.
6. **Après** : invalider à nouveau les sessions préexistantes, contrôler les
   clés API et les sessions du compte selon l'incident, notifier les autres
   responsables du média, journaliser qui a accordé l'accès et sur quelles
   preuves. Révocation suspecte abusive = incident de sécurité à part entière.

## Cas du dernier propriétaire

Aucune procédure automatisée ne laisse une organisation sans administrateur,
ni ne donne le contrôle à quelqu'un qui ne prouve pas un droit légitime. Si
le seul propriétaire est injoignable et non vérifiable, la décision remonte
au responsable plateforme avec les mêmes exigences de preuve — pas de
raccourci opérationnel.

## Ce qui n'existe pas encore (renvoyé au support, Lot 6)

Le suivi de dossier (statuts, pièces jointes, délais, séparation
agent/réviseur) attend le chantier support/recours. En attendant : un fil
e-mail dédié + le journal d'audit font foi, avec les mêmes exigences de
preuve ci-dessus.
