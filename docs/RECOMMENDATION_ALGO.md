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

---

## 5. Moteur de feed Two-Tower actuel (Go, pgvector)

Le moteur **réel en production** (port Go de `packages/db/feed.ts`, fichier `apps/api/internal/modules/feed/personalized.go`) a remplacé le scoring générique du §3. Il classe des **articles ET des pensées** via deux tours, avec un pool de candidats sim-dominant puis un rerank :

- **Pool de candidats** (sim-dominant) : `0.65·Sim + 0.15·Fresh + 0.20·Complétion` (pilotable : `feed.pool_sim`, `feed.pool_fresh`, `feed.pool_completion`).
- **Rerank articles** : `0.40·Sim + 0.15·Fresh + 0.15·Engagement + 0.15·Circadien + 0.15·CF` × bonus complétion (pilotable : `feed.rerank_sim`, `feed.rerank_fresh`, `feed.rerank_engagement`, `feed.rerank_circadian_weight`, `feed.rerank_cf_weight`, `feed.completion_bonus_base`, `feed.completion_bonus_scale`).
- **Rerank pensées** : mêmes poids configurables + bonus matinal + CF pensées (pilotable : `feed.thought_morning_bonus`, `feed.thought_cf_weight`).
- **Tendances (vélocité 48h)** : l'engagement effectif = `max(engagement cumulatif, vélocité récente)` — un contenu « chaud » monte sans ajouter de composante globale au rerank (pilotable : `feed.vel_window_hours`, `feed.vel_post_target`, `feed.vel_article_target`).
- **MMR sémantique** (diversité) : pénalité de redondance item-item (pilotable : `feed.mmr_lambda`, `feed.mmr_dup_threshold`).
- **CF (Collab Filtering)** : voisins de co-lecture via `ReadingSession` pour articles et pensées (pilotable : `feed.cf_min_my_reads`, `feed.cf_top_neighbors`).
- **Exploration ε-greedy** : injection d'articles hors bulle proportionnelle à la maturité du profil (pilotable : `feed.exploration_ratio`, `feed.exploration_ratio_cold`, `feed.exploration_min_signals`, `feed.exploration_min_quality`).
- **Mix articles / pensées pilotable + adaptatif** : voir §6.

Toutes les clés `SystemConfig` du moteur sont **bornées lors du parsing** ; une valeur absente ou invalide retombe sur le défaut calibré (le moteur ne se bloque jamais à cause de la config). Le catalogue complet (68 clés `feed.*` + `OAUTH_*`, avec description) est seedé par `seed.DefaultEngineConfigs()` — il s'affiche donc directement dans le panel admin (`/admin/config`).

---

## 6. Mix articles / pensées — ratio circadien + adaptation au lecteur

Au départ, la proportion pensées/articles du feed suit le **profil circadien** (`getCircadianProfile` selon l'heure) : les pensées sont dominantes la journée et le week-end, les articles restent majoritaires mais modérés le soir. Depuis 2026-08, la part pensées a été relevée de +0.15 sur **chaque** créneau (catalogue pensées-dominant : ≈87 % pensées vs 13 % articles).

Ce ratio de base est ensuite **recalibré par utilisateur** pour coller à sa façon de lire :

1. **`getThoughtPreference(userID)`** dérive une affinité en `[0,1]` (0.5 = neutre) à partir :
   - de la **durée de ses sessions de lecture** (`ReadingSession`, 90 derniers jours) — sessions courtes → penchant pensées, longues → articles, pondérées par statut (`READ_COMPLETE` > `READ_PARTIAL` > `SKIM` > `BOUNCE`) ;
   - des **retours explicites** (`ContentFeedback`) : un « Voir plus » sur une pensée (ou « Voir moins » sur un article) penche vers les pensées, l'inverse vers les articles.
   - Un minimum de données est requis (`adaptMinSessions`, `feedbackMinSignals`) avant tout ajustement, pour ne jamais dérailler sur du bruit.
2. **`blendThoughtRatio(circadien, affinité, k, floor, ceil)`** décale le ratio : sortie = `clamp(circadien + k·(affinité−0.5))`, bornée à `[floor, ceil]` pour ne jamais supprimer un type de contenu.

**Pilotage sans recompiler (SystemConfig)** :
- `feed.adapt_k` — force du décalage (défaut 0.40 ; `0` désactive l'adaptation).
- `feed.adapt_ratio_floor` / `feed.adapt_ratio_ceil` — bornes du ratio pensées (défauts 0.15 / 0.85).

Un lecteur de formats courts reçoit donc plus de pensées, un lecteur de long-format plus d'articles — le tout ajustable en production sans déployer.

---

## 7. Catalogue complet des clés `SystemConfig` du moteur

Toutes les valeurs du moteur sont pilotables sans recompiler via `SystemConfig` (chargées en UNE requête par `loadEngineConfig`, défauts du code sinon). Les défauts ci-dessous sont le miroir exact des constantes calibrées par recsys-eval ; le seed (`seed.DefaultEngineConfigs`) insère chaque clé avec sa description pour que le panel admin les expose.

### 7.1 Pool de candidats & rerank

| Clé | Défaut | Rôle |
|---|---|---|
| `feed.pool_sim` / `feed.pool_fresh` / `feed.pool_completion` | 0.65 / 0.15 / 0.20 | Poids sim / fraîcheur / complétion dans le POOL (avant rerank). |
| `feed.rerank_sim` / `feed.rerank_fresh` / `feed.rerank_engagement` | 0.40 / 0.15 / 0.15 | Poids sim / fraîcheur / engagement dans le score final. |
| `feed.rerank_circadian_weight` / `feed.rerank_cf_weight` | 0.15 / 0.15 | Poids du fit circadien et du CF dans le score final article. |
| `feed.thought_cf_weight` / `feed.thought_morning_bonus` | 0.10 / 0.10 | Poids du CF et du bonus matinal dans le score final pensée. |
| `feed.completion_bonus_base` / `feed.completion_bonus_scale` | 0.7 / 0.3 | Bonus de complétion : score × (base + pente × taux). |
| `feed.cold_start_sim` | 0.5 | Similarité neutre faute d'embedding utilisateur. |

### 7.2 Profils circadiens (6 créneaux × 3 valeurs)

| Clé | Défaut | Rôle |
|---|---|---|
| `feed.circadian_{slot}_target_min` | 12 / 5.5 / 7.5 / 8.5 / 12 / 7 | Durée de lecture visée (min) — week-end, matin, midi, après-midi, soir, nuit. |
| `feed.circadian_{slot}_sigma` | 4.5 / 2.2 / 2.8 / 3.0 / 4.0 / 3.0 | Largeur de la gaussienne circadienne. |
| `feed.circadian_{slot}_thought_ratio` | 0.60 / 0.70 / 0.60 / 0.60 / 0.55 / 0.65 | Ratio pensées du créneau (articles = 1 − ratio). Convention : `0` = laisser le défaut. |

### 7.3 Engagement, CF, vélocité

| Clé | Défaut | Rôle |
|---|---|---|
| `feed.eng_read_weight` / `feed.eng_social_weight` / `feed.eng_conf_weight` | 0.5 / 0.3 / 0.2 | Poids qualité de lecture / preuve sociale (marque-pages+highlights) / confiance. |
| `feed.eng_min_sessions` / `feed.eng_negative_thresh` / `feed.eng_negative_penalty` | 5 / 0.25 / 0.85 | Seuils de la pénalité de rebond. |
| `feed.cf_min_my_reads` / `feed.cf_top_neighbors` | 3 / 10 | Activation et profondeur du CF co-lecture. |
| `feed.vel_window_hours` / `feed.vel_post_target` / `feed.vel_article_target` | 48 / 8 / 20 | Fenêtre et cibles du signal « trending ». |

### 7.4 Pénalités, feedback, mix adaptatif, exploration

| Clé | Défaut | Rôle |
|---|---|---|
| `feed.milieu_penalty_threshold` / `feed.milieu_penalty_factor` | 3 / 0.5 | Tags rejetés : seuil de signalements et facteur de dévaluation (jamais d'exclusion). |
| `feed.show_more_boost_mult` | 0.12 | Boost « Voir plus » : score × (1 + α·sim). |
| `feed.impression_penalty_threshold` / `feed.impression_penalty_factor` / `feed.feedback_window_days` | 3 / 0.6 / 30 | Dévaluation des items vus-ignorés et fenêtre des retours explicites. |
| `feed.adapt_k` / `feed.adapt_ratio_floor` / `feed.adapt_ratio_ceil` | 0.40 / 0.15 / 0.85 | Force et bornes du mix adaptatif pensées/articles. |
| `feed.adapt_min_sessions` / `feed.feedback_prefer_weight` / `feed.feedback_min_signals` | 3 / 0.25 / 2 | Minimums de données et poids des retours explicites sur le penchant. |
| `feed.exploration_ratio` / `feed.exploration_ratio_cold` / `feed.exploration_min_signals` / `feed.exploration_min_quality` | 0.12 / 0.22 / 10 / 0.8 | Exploration ε-greedy : taux mature/froid, seuil de maturité, qualité minimale. |

Les quotas OAuth (`OAUTH_MAX_CLIENTS_PER_USER`, `OAUTH_MAX_REDIRECT_URIS`, `OAUTH_MAX_ACTIVE_TOKENS_PER_USER`, `OAUTH_AUTH_CODE_TTL`, `OAUTH_ACCESS_TOKEN_TTL`, `OAUTH_REFRESH_TOKEN_TTL`, `OAUTH_ID_TOKEN_TTL`, `OAUTH_ALLOW_INSECURE_REDIRECT`) sont également seedés avec leur description (voir `docs/OAUTH_PROVIDER.md`).
