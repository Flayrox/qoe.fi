// cmd/migrate — exécutable de migrations (goose) : remplace prisma migrate.
//
// Usage : qoe-migrate [-dir sql/migrations] [commande]
//
// Commandes (API goose classique) :
//
//	up            applique les migrations en attente (défaut)
//	up-to N       applique jusqu'à la version N incluse
//	down          annule la dernière migration
//	down-to 0     annule tout (reset dev)
//	status        liste les migrations appliquées / en attente
//	version       version courante
//
// Connexion : DATABASE_URL (même variable que l'API et le worker).
// Les migrations vivent dans apps/api/sql/migrations/*.sql (squash de
// l'historique Prisma — source de vérité : apps/api/sql/schema/schema.sql).
package main

import (
	"database/sql"
	"flag"
	"log"
	"os"
	"strconv"

	_ "github.com/jackc/pgx/v5/stdlib" // driver postgres pour database/sql
	"github.com/pressly/goose/v3"
)

func main() {
	dir := flag.String("dir", "sql/migrations", "répertoire des migrations SQL")
	flag.Parse()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL non définie (ex: postgresql://user:pass@host:5432/db)")
	}

	command := "up"
	if flag.NArg() > 0 {
		command = flag.Arg(0)
	}

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("ouverture base: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("connexion base: %v", err)
	}

	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("dialecte: %v", err)
	}

	switch command {
	case "up":
		err = goose.Up(db, *dir)
	case "up-to":
		n := mustVersion(flag.Arg(1))
		err = goose.UpTo(db, *dir, n)
	case "down":
		err = goose.Down(db, *dir)
	case "down-to":
		n := mustVersion(flag.Arg(1))
		err = goose.DownTo(db, *dir, n)
	case "status":
		err = goose.Status(db, *dir)
	case "version":
		var v int64
		v, err = goose.GetDBVersion(db)
		if err == nil {
			log.Printf("version courante : %d", v)
		}
	default:
		log.Fatalf("commande inconnue %q (up | up-to | down | down-to | status | version)", command)
	}
	if err != nil {
		log.Fatalf("migrations (%s): %v", command, err)
	}
	log.Printf("migrations %q : OK", command)
}

func mustVersion(v string) int64 {
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		log.Fatalf("version invalide %q", v)
	}
	return n
}
