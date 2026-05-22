# Déploiement Souverain avec Docker

L'objectif de qoe.fi est d'être souverain. Cela veut dire que l'on veut éviter de dépendre d'acteurs tiers comme Vercel Analytics ou Google Analytics pour nos statistiques, car ils possèdent et exploitent nos données.

Pour régler ça, nous utilisons **Umami**, une solution d'analytics open-source, légère, et respectueuse de la vie privée (pas de cookies, conforme RGPD).

Et pour l'héberger de façon propre sans "casser" notre serveur, nous utilisons **Docker**.

## Qu'est-ce que Docker ?

Imagine que ton serveur (un VPS acheté chez Hetzner ou OVH) est un grand terrain vide.
Si tu installes un outil directement dessus, il va commencer à semer ses fichiers partout. Si tu en installes 10, ils vont finir par se marcher sur les pieds (conflit de versions de Node.js, Postgres, etc.).

**Docker** résout ça en créant des "boîtes hermétiques" appelées des **conteneurs**.
Dans notre fichier `docker-compose.yml`, on dit à Docker :
1. "Crée-moi une boîte pour la base de données (Postgres) isolée du reste."
2. "Crée-moi une boîte pour le site Umami, et connecte-la à la première boîte."

C'est magique car si une boîte plante, elle n'affecte pas les autres. Et si tu veux supprimer l'outil, tu jettes la boîte, sans laisser aucun fichier déchet sur ton serveur.

## Comment lancer notre Tracker (Umami)

1. **Louer un petit VPS** (Hetzner ou OVH, environ 5€/mois suffisent).
2. **Se connecter au VPS** via SSH (`ssh root@ip_du_serveur`).
3. **Installer Docker** (Tape `curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh`).
4. **Cloner ce projet** sur le serveur, ou simplement y copier le fichier `docker-compose.yml`.
5. Dans le dossier où se trouve le `docker-compose.yml`, lancer la commande suivante :

```bash
docker compose up -d
```

- `up` : Démarre les conteneurs.
- `-d` : (Detached) Les fait tourner en arrière-plan pour que tu puisses fermer le terminal.

### Que va-t-il se passer ?
Docker va télécharger l'image officielle d'Umami et de Postgres. Il va allumer la base de données, puis allumer Umami.
Dans quelques minutes, tu pourras accéder à Umami en tapant `http://ip_de_ton_serveur:3000` dans ton navigateur.

### Identifiants par défaut d'Umami
- Utilisateur : `admin`
- Mot de passe : `umami` (À CHANGER IMMÉDIATEMENT !)

Une fois connecté sur Umami, tu cliqueras sur "Add Website" -> "qoe.fi".
Umami te donnera un petit script sous la forme `<script defer src="http://ip.../script.js" data-website-id="1234"></script>`. 
Il suffira de copier ce script et de le mettre dans le fichier `src/app/layout.tsx` de notre application Next.js.

## Prochaines étapes

Une fois Umami en ligne, dans notre Dashboard God Mode, nous connecterons les graphiques Recharts à l'API d'Umami en utilisant le "Website ID" fourni, pour aspirer les vraies statistiques souveraines !
