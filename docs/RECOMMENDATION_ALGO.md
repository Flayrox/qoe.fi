# 🧠 Algorithme de Recommandation & Pipeline Vectoriel — qoe.fi

Ce document formalise l'architecture du système de recommandation de qoe.fi pour la production et le déploiement sur VPS/Bare-Metal.

---

## 1. Architecture Vectorielle (`jina-embeddings-v3` + `pgvector`)

### A. Modèle & Dimensions
- **Modèle** : `jinaai/jina-embeddings-v3` (MRL - Matryoshka Representation Learning).
- **Service d'inférence** : Text Embeddings Inference (TEI) ou `llama.cpp` (GGUF Q8_0) auto-hébergé sur le port `8081`.
- **Dimensions d'indexation** : `512` dimensions (MRL tronqué optimisé pour Postgres).
- **Métrique de similarité** : Cosine Distance (`<=>` sur index HNSW `vector_cosine_ops`).

---

## 2. Onboarding & Cold-Start User Embedding

Lorsqu'un utilisateur termine son onboarding interactif, son vecteur d'affinité initial $\vec{U}$ est généré et stocké dans `User.embedding` (`vector(512)`).

### Construction du Prompt d'Embedding Initial :
$$\text{Prompt}_{\text{user}} = \text{Thématiques \& Sous-thèmes} + \text{" | Intention : "} + \text{Bio/Prompt} + \text{" | Créateurs suivis : "} + \text{Tags créateurs}$$

Exemple :
```
Intérêts: Intelligence Artificielle (LLMs, Open Source, Souveraineté), Philosophie (Éthique, Stoïcisme) | Intention: Je cherche des analyses fouillées sur l'impact de l'IA en Europe sans bruit publicitaire | Créateurs: @alex_dev, @climat_actu
```

---

## 3. Algorithme de Scoring du Feed

Le score d'un article ou post $P$ pour un utilisateur $U$ est calculé par une combinaison linéaire de signaux :

$$\text{Score}(U, P) = \alpha \cdot \text{Sim}(\vec{U}, \vec{P}) + \beta \cdot \text{Engagement}(P) + \gamma \cdot \text{Fraîcheur}(P) - \delta \cdot \text{PénalitéMutedWords}(U, P)$$

### Coefficients :
- $\alpha = 0.50$ : Similarité sémantique cosinus ($1 - (\vec{U} \cdot \vec{P})$).
- $\beta = 0.25$ : Score d'engagement relatif (likes pondérés, partages, temps de lecture).
- $\gamma = 0.25$ : Décroissance temporelle (Half-life decay de 48h).
- $\delta = \infty$ : Filtrage dur (exclusion stricte) si un mot de `MutedWord` est détecté dans le contenu ou les tags.

---

## 4. Stratégie Cold Feed (Feed générique populaire en arrière-plan)

Avant que l'onboarding soit terminé (ou pour les visiteurs non authentifiés) :
- Les 10 articles les plus consultés / certifiés des 7 derniers jours sont affichés.
- Le feed générique sert d'arrière-plan interactif sous le modal d'onboarding pour donner immédiatement à l'utilisateur un aperçu du contenu de haute qualité disponible sur la plateforme.
