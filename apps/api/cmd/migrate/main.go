// cmd/migrate - executable de migrations (goose).
//
// Usage : qoe-migrate [-dir sql/migrations] [--allow-destructive] [commande]
//
// Commandes :
//
//	up            applique les migrations en attente (defaut)
//	up-to N       applique jusqu'a la version N incluse
//	down          annule la derniere migration (destructif)
//	down-to 0     annule tout (destructif)
//	status        liste les migrations appliquees / en attente
//	version       version courante
//
// Connexion : DATABASE_URL.
// Les migrations vivent dans apps/api/sql/migrations/*.sql.
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"

	_ "github.com/jackc/pgx/v5/stdlib" // driver postgres pour database/sql
	"github.com/pressly/goose/v3"
)

func main() {
	dir := flag.String("dir", "sql/migrations", "repertoire des migrations SQL")
	allowDestructive := flag.Bool("allow-destructive", false, "autorise down/down-to uniquement sur une base *_test")
	flag.Parse()

	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		log.Fatal("DATABASE_URL non definie (ex: postgresql://user:pass@host:5432/db)")
	}

	command := "up"
	if flag.NArg() > 0 {
		command = flag.Arg(0)
	}
	if isDestructive(command) {
		if !*allowDestructive {
			log.Fatalf("migration %q refusee sans --allow-destructive; la base dev ne doit jamais etre detruite", command)
		}
		if err := validateDestructiveDatabase(dsn); err != nil {
			log.Fatal(err)
		}
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

func isDestructive(command string) bool {
	return command == "down" || command == "down-to"
}

func validateDestructiveDatabase(rawDSN string) error {
	parsed, err := url.Parse(rawDSN)
	if err != nil {
		return fmt.Errorf("DATABASE_URL invalide: %w", err)
	}
	database := strings.TrimPrefix(parsed.Path, "/")
	if database == "" || !strings.HasSuffix(strings.ToLower(database), "_test") {
		return fmt.Errorf("operation destructive refusee: la base %q n'est pas une base *_test", database)
	}
	return nil
}

func mustVersion(v string) int64 {
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		log.Fatalf("version invalide %q", v)
	}
	return n
}
