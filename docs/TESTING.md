# Tests et bases de donnees

## Principe d'isolement

La base de developpement existante n'est jamais une base de test.

- Supabase dev : port `54322`, base `postgres`
- Postgres dev Docker : port `5433`, base `qoe`
- Postgres test persistant : port `55432`, base `qoe_test`
- Tests Go par defaut : conteneur ephemere Testcontainers

Les fixtures d'integration utilisent `TRUNCATE`. Pour cette raison,
`TEST_DATABASE_URL` est refusee si le nom de base ne se termine pas par `_test`.

## Tests Go sans toucher a la base dev

Avec Docker lance, le chemin recommande est le conteneur ephemere :

```bash
cd apps/api
go test ./...
```

Aucune variable `DATABASE_URL` de la base dev n'est utilisee par les tests Go
sauf si elle est recopiee explicitement dans `TEST_DATABASE_URL`, ce qui est
bloque par la validation du suffixe `_test`.

## Base de test persistante locale

Elle utilise un Compose et un volume distincts :

```bash
pnpm test:db:up
pnpm test:db:migrate
pnpm test:db:status
TEST_DATABASE_URL="postgresql://qoe:qoe@127.0.0.1:55432/qoe_test?sslmode=disable" pnpm test:db
```

`pnpm test:db` force `go test -p 1` afin que les fixtures des packages ne
s'executent pas en parallele sur la meme base partagee.

Pour arreter les conteneurs sans supprimer les donnees :

```bash
pnpm exec bash scripts/test-db.sh down
```

Pour reinitialiser uniquement la base de test :

```bash
pnpm test:db:reset
```

La commande demande `RESET-TEST` et ne touche qu'au volume
`qoefi-test-postgres-data`.

## Migrations destructives

`qoe-migrate down` et `qoe-migrate down-to` sont refuses sans
`--allow-destructive`. Meme avec cette option, ils refusent toute base dont le
nom ne se termine pas par `_test`.

Le reset historique `scripts/seed-docker.sh --reset` est donc limite aux bases
`*_test`. Il ne peut plus supprimer la base dev `qoe`.

## CI

La CI utilise des services Postgres/Testcontainers ephemeres. Elle ne doit
jamais recevoir les secrets ou URLs de la base dev. Les tests destructifs et
les fixtures sont limites a l'environnement de test du job.
