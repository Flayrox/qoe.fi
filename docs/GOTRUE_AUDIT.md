# Audit GoTrue déployé — MFA, passkeys, téléphone (fiche 05 §13–14)

> Vérifié le 2026-09-29 contre l'instance de production (endpoints publics
> `/auth/v1/health` et `/auth/v1/settings`, clé anon publique uniquement —
> aucune donnée, aucun secret). À rejouer à chaque montée de version.

## Constat

| Capacité | État déployé | Conséquence produit |
|---|---|---|
| Version | **v2.189.0** (récente) | Base saine pour TOTP + `aal`/`amr` lisibles par Go |
| TOTP (inscription, vérification, challenge) | Disponible (défaut GoTrue, utilisé par `/v1/me/mfa/*`) | **Méthode forte de référence** : TOTP vérifié exigé pour N1/N2 |
| Passkeys / WebAuthn | **`passkeys_enabled: false`** | Pas de N1 passkey possible aujourd'hui — ni comme connexion forte ni comme second facteur |
| Téléphone (`phone: true`) | Déclaré mais **aucun `sms_provider` configuré** | `phone_verified` via GoTrue inopérant ; pas de MFA SMS possible |
| `mailer_autoconfirm: true` | Confirmé | `email_confirmed_at` est positionné à l'inscription sans clic : sa valeur probante est faible — ne jamais le traiter comme une preuve de possession *au moment de l'action* (la session + l'action explicite priment) |
| OAuth externes | Tous désactivés sauf e-mail | Surface réduite, rien à auditer côté fédération pour l'instant |

## Décisions produit arrêtées (fiche 05 §14)

1. **TOTP obligatoire + matrice N0–N3 d'abord** : c'est ce qui est déployé et
   vérifiable côté Go (`aal` + méthode `amr` + fraîcheur).
2. **Passkeys après activation** : ne programmer aucune obligation passkey
   tant que `passkeys_enabled` est faux. Le jour où il passe à vrai : audit
   des jetons (méthode réellement utilisée pour *cette* session, fraîcheur),
   jamais la règle « passkey enregistrée ⇒ droits ».
3. **SMS = friction anti-abus, jamais MFA** : même si un provider est branché
   un jour, un `aal2` obtenu par SMS seul restera refusé pour N1/N2 (politique
   déjà encodée dans `internal/authz`).
4. **Téléphone demandé uniquement** aux demandes d'import/API/quotas qui le
   justifient, comme prérequis indépendant — pas comme preuve d'identité.

## À re-vérifier à chaque changement côté fournisseur

- `passkeys_enabled`, `sms_provider`, `mailer_autoconfirm`, version ;
- forme exacte de `amr` (méthodes, horodatages) pour TOTP et, le cas échéant,
  WebAuthn — le garde Go lit ces claims, tout changement de forme doit être
  reflété dans `internal/authz` + tests.
