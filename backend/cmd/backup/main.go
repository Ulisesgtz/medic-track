// Command backup makes the daily backup of the database and its weekly restore check (specs/069-respaldos-base). It runs as a
// cron service of its own in Railway (`backend/railway.backup.json`, image `backend/Dockerfile.backup`), never in the API.
// Only wiring: everything it does lives in internal/backup, where it is tested.
//
//	backup run                                             the daily run: backup, retention and, on the check day, the check
//	backup check                                           restore the latest copy in a disposable server and compare
//	backup list                                            the copies of this environment
//	backup restore --key <file> --object <key|latest>      restore by hand into the EMPTY database of BACKUP_RESTORE_TARGET
//	backup keygen                                          a new key pair (the private one only to this terminal)
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/backup"
	"github.com/Ulisesgtz/medic-track/backend/internal/errorlog"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var code int
	switch os.Args[1] {
	case "keygen":
		code = keygen()
	case "run":
		code = withService(ctx, run)
	case "check":
		code = withService(ctx, check)
	case "list":
		code = withReader(ctx, list)
	case "restore":
		code = withReader(ctx, restore)
	default:
		usage()
		code = 2
	}
	os.Exit(code)
}

func usage() {
	fmt.Fprintln(os.Stderr, "uso: backup run | check | list | restore --key <archivo> --object <llave|latest> | keygen")
}

func keygen() int {
	public, private, err := backup.GenerateKey()
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo generar la llave")
		return 1
	}
	fmt.Println("# llave pública (va en BACKUP_OWNER_RECIPIENT; la de comprobación se deriva sola de la privada)")
	fmt.Println(public)
	fmt.Println("# llave PRIVADA — guárdala en tu gestor de contraseñas y en un segundo lugar seguro; no la pegues en el chat ni en el repositorio")
	fmt.Println(private)
	return 0
}

type deps struct {
	cfg  backup.Config
	pool *pgxpool.Pool
	repo *backup.Repository
	svc  *backup.Service
}

func withService(ctx context.Context, do func(context.Context, deps) int) int {
	cfg, cfgErr := backup.LoadConfig(os.Getenv)
	if cfgErr != nil {
		var cerr *backup.ConfigError
		if errors.As(cfgErr, &cerr) {
			fmt.Fprintln(os.Stderr, "respaldos no activos:", cfgErr.Error())
		}
		// With the database reachable, the failure is also recorded so the weekly digest shows it.
		if url := os.Getenv("DATABASE_URL"); url != "" {
			if pool, err := pgxpool.New(ctx, url); err == nil {
				backup.NewReporter(errorlog.NewRepository(pool)).Report(ctx, backup.FailConfig)
				pool.Close()
			}
		}
		return 2
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo abrir la base")
		return 1
	}
	defer pool.Close()
	store, err := backup.NewR2Store(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo preparar el almacenamiento")
		return 1
	}
	repo := backup.NewRepository(pool)
	svc := &backup.Service{
		Env:        cfg.Env,
		Recipients: cfg.Recipients(),
		Check:      cfg.CheckIdentity,
		Runs:       repo,
		Store:      store,
		Dumper:     &backup.PgDumper{Pool: pool, DatabaseURL: cfg.DatabaseURL},
		Restorer:   &backup.EphemeralRestorer{},
		Reporter:   backup.NewReporter(errorlog.NewRepository(pool)),
		Lock:       func(ctx context.Context) (func(), bool, error) { return backup.TryLock(ctx, pool) },
	}
	return do(ctx, deps{cfg: cfg, pool: pool, repo: repo, svc: svc})
}

// withReader is the wiring of `list` and `restore`, which the owner runs on their own computer: R2 and, if DATABASE_URL is
// set, the record of the runs to compare with. No key from the environment, and nothing is reported to error_logs.
func withReader(ctx context.Context, do func(context.Context, deps) int) int {
	cfg, err := backup.LoadReadConfig(os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, "falta configuración:", err.Error())
		return 2
	}
	store, err := backup.NewR2Store(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo preparar el almacenamiento")
		return 1
	}
	d := deps{cfg: cfg, svc: &backup.Service{Env: cfg.Env, Store: store}}
	if cfg.DatabaseURL != "" {
		pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
		if err != nil {
			fmt.Fprintln(os.Stderr, "no se pudo abrir la base")
			return 1
		}
		defer pool.Close()
		d.pool, d.repo = pool, backup.NewRepository(pool)
		d.svc.Runs = d.repo
	} else {
		fmt.Println("sin DATABASE_URL: se usan solo las copias de R2, sin comparar conteos")
	}
	return do(ctx, d)
}

func run(ctx context.Context, d deps) int {
	res, err := d.svc.RunBackup(ctx)
	if errors.Is(err, backup.ErrBusy) {
		fmt.Println("otro respaldo está en curso: nada que hacer")
		return 0
	}
	if err != nil {
		return 1
	}
	fmt.Printf("respaldo %s listo: %s, %s, %d tablas\n", d.cfg.Env, res.ObjectKey, megabytes(res.Size), res.Tables)
	code := 0
	if removed, err := d.svc.ApplyRetention(ctx); err != nil {
		code = 1
	} else if removed > 0 {
		fmt.Printf("retención: %d copias viejas borradas\n", removed)
	}
	if backup.IsCheckDay(time.Now(), d.cfg.CheckWeekday) {
		if check(ctx, d) != 0 {
			code = 1
		}
	}
	return code
}

func check(ctx context.Context, d deps) int {
	res, err := d.svc.RunCheck(ctx)
	if err != nil {
		if res != nil && len(res.Mismatches) > 0 {
			fmt.Printf("comprobación: %d tablas no cuadran\n", len(res.Mismatches))
		}
		return 1
	}
	fmt.Printf("comprobación lista: %s se restauró completa, %d tablas, conteos iguales\n", res.ObjectKey, res.Tables)
	return 0
}

func list(ctx context.Context, d deps) int {
	objects, err := d.svc.Store.List(ctx, d.cfg.Env+"/")
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudieron leer las copias")
		return 1
	}
	var states map[string]string
	if d.repo != nil {
		if states, err = d.repo.ObjectStates(ctx, d.cfg.Env); err != nil {
			fmt.Fprintln(os.Stderr, "no se pudo leer el registro de respaldos")
			return 1
		}
	}
	for i := len(objects) - 1; i >= 0; i-- {
		state := "sin registro de éxito: no la uses"
		switch {
		case d.repo == nil:
			state = "sin registro (no hay DATABASE_URL)"
		case states[objects[i].Key] == backup.StateOK:
			state = "ok"
		case states[objects[i].Key] == backup.StateCheckFailed:
			state = "la comprobación falló: no la uses"
		}
		fmt.Printf("%s  %s  %s\n", objects[i].Key, megabytes(objects[i].Size), state)
	}
	return 0
}

func restore(ctx context.Context, d deps) int {
	fs := flag.NewFlagSet("restore", flag.ContinueOnError)
	keyFile := fs.String("key", "", "archivo con TU llave privada")
	object := fs.String("object", "latest", "llave de la copia, o latest")
	if err := fs.Parse(os.Args[2:]); err != nil || *keyFile == "" {
		fmt.Fprintln(os.Stderr, "uso: backup restore --key <archivo> --object <llave|latest>")
		return 2
	}
	// The target's address, password included, comes from the environment: never an argument, which stays in the shell's
	// history and is visible to every process of the machine.
	target := strings.TrimSpace(os.Getenv("BACKUP_RESTORE_TARGET"))
	if target == "" {
		fmt.Fprintln(os.Stderr, "falta BACKUP_RESTORE_TARGET: la URL de una base NUEVA y vacía (ver RESPALDOS.md, «Restaurar»)")
		return 2
	}
	content, err := os.ReadFile(*keyFile)
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se pudo leer el archivo de la llave")
		return 1
	}
	owner, err := backup.ParseIdentityFile(string(content))
	if err != nil {
		fmt.Fprintln(os.Stderr, "el archivo no tiene una llave privada válida")
		return 1
	}
	res, err := d.svc.Restore(ctx, owner, *object, &backup.PgTarget{URL: target})
	if err != nil {
		fmt.Fprintln(os.Stderr, "no se restauró:", err.Error())
		return 1
	}
	if len(res.Mismatches) > 0 {
		fmt.Printf("restaurada %s, pero %d tablas no cuadran con lo registrado:\n", res.ObjectKey, len(res.Mismatches))
		for _, m := range res.Mismatches {
			fmt.Printf("  %s: esperadas %d, restauradas %d\n", m.Table, m.Expected, m.Got)
		}
		return 1
	}
	fmt.Printf("restauración completa: %s, %d tablas, conteos iguales\n", res.ObjectKey, res.Tables)
	return 0
}

func megabytes(n int64) string {
	return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
}
