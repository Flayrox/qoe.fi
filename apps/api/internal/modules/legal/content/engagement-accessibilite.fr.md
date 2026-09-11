# Engagement d'accessibilité

*Dernière mise à jour : {{updatedAt}}*

qoe.fi vise l'**accessibilité universelle** de ses interfaces, conformément au référentiel **WCAG 2.2 niveau AA**, à la directive européenne sur l'accessibilité des produits et services (2019/882, « European Accessibility Act ») et aux obligations applicables à un service numérique grand public.

## 1. Notre engagement

L'accessibilité n'est pas une option : une plateforme d'édition qui exclut une partie de son lectorat manque à sa mission. Nous intégrons l'accessibilité :

- **dès la conception** des interfaces, pas en correction après coup ;
- **dans le design system partagé** (`@qoe/theme`, `@qoe/ui`) : contrastes, focus visibles, tailles de texte, cibles tactiles ;
- **dans les tests** : vérifications automatisées et parcours manuels au clavier et au lecteur d'écran ;
- **dans la formation** de l'équipe aux bonnes pratiques (sémantique HTML, ARIA utile seulement, alternatives textuelles).

## 2. Mesures mises en œuvre

| Objectif WCAG | Mise en œuvre |
|---------------|---------------|
| Perceptible | contrastes texte/fond conformes AA, alternatives textuelles sur les images et aperçus, sous-titres pour les contenus audio/vidéo proposés par la plateforme, pas d'information portée par la seule couleur |
| Utilisable | navigation complète au clavier, focus visible, ordre de tabulation logique, cibles tactiles de 44 px minimum, retour en haut, absence de piège au clavier |
| Compréhensible | libellés explicites, messages d'erreur précis et associés aux champs, langue de la page déclarée, navigation cohérente entre les pages |
| Robuste | HTML sémantique, composants compatibles lecteurs d'écran (VoiceOver, NVDA, TalkBack), aucune dépendance à un seul mode de saisie |

Autres mesures : thème clair et sombre respectant les préférences système, respect de `prefers-reduced-motion`, zoom jusqu'à 200 % sans perte de contenu, zones de contraste minimales respectées.

## 3. État de conformité

**Statut : [partiellement conforme / conforme]** au référentiel WCAG 2.2 niveau AA.

### Non-conformités connues

| Zone | Description | Correction prévue |
|------|-------------|-------------------|
| Éditeur de texte enrichi | certaines commandes de la barre d'outils ne sont accessibles qu'à la souris | [TRIMESTRE] |
| Éditeur de thème | aperçu couleur non restitué vocalement | [TRIMESTRE] |
| Contenus tiers | contenus intégrés par les créateurs (embeds, iframes) ne sont pas sous notre contrôle | accompagnement + documentation |
| Contenus des créateurs | texte alternatif des images publiées par les créateurs | recommandations et rappels dans l'éditeur |
| Tableau de bord analytique | graphiques sans description textuelle équivalente pour certains indicateurs | [TRIMESTRE] |

## 4. Contenus publiés par les créateurs

Les créateurs restent responsables de l'accessibilité de **leurs propres contenus** (alternatives textuelles, sous-titres, lisibilité). L'éditeur met à leur disposition :

- un champ obligatoire de **texte alternatif** lors de l'insertion d'une image ;
- des rappels dans l'éditeur et un guide de bonnes pratiques ;
- un diagnostic d'accessibilité par article (futur) signalant les manques les plus courants.

## 5. Déclaration et voies de recours

- **Signaler un obstacle** : [EMAIL ACCESSIBILITE]
- **Délai de réponse** : accusé de réception sous **5 jours ouvrés**, réponse motivée sous **1 mois**.
- **Mesure de contournement** : sur demande, nous fournissons le contenu demandé dans un format alternatif accessible (texte brut, version audio).
- **Réclamation** : à défaut de solution, vous pouvez saisir le **Défenseur des droits** (France) — defenseurdesdroits.fr — ou l'autorité de votre État membre compétente en matière d'accessibilité numérique.

## 6. Suivi

Un audit d'accessibilité est réalisé **au minimum une fois par an**, ainsi qu'à chaque refonte majeure d'interface. Les résultats sont résumés dans cette page, qui est mise à jour à chaque évolution notable.

**Dernier audit : [DATE]** · **Prochain audit prévu : [DATE]**
