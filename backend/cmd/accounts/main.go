// Command accounts holds the operation tasks over accounts (specs/070). Today one:
//
//	accounts reconcile-deleted [--apply] [--max N]   after restoring a backup: delete again every account whose Clerk user no longer exists
//
// A backup made before an account was deleted brings the account back; its Clerk user, deleted with it, does not come back
// (Clerk lives outside the database). This command finds those accounts and deletes them again, with the same code as the
// deletion itself (accountdeletion.Purge). Run it right after restoring and BEFORE pointing the API to the restored database
// (RESPALDOS.md, «Restaurar»). It needs DATABASE_URL and CLERK_SECRET_KEY; it prints only counts and account ids, never an
// e-mail or a name. Without --apply it is a dry run: it only lists. With --apply it deletes, but aborts (deleting nothing) if
// more than --max accounts look gone (default: 20% of the accounts linked to Clerk), which is what a wrong CLERK_SECRET_KEY
// looks like.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	clerk "github.com/clerk/clerk-sdk-go/v2"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Ulisesgtz/medic-track/backend/internal/accountdeletion"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) < 1 || args[0] != "reconcile-deleted" {
		fmt.Fprintln(stderr, "uso: accounts reconcile-deleted [--apply] [--max N]   (necesita DATABASE_URL y CLERK_SECRET_KEY)")
		return 2
	}
	fs := flag.NewFlagSet("reconcile-deleted", flag.ContinueOnError)
	fs.SetOutput(stderr)
	apply := fs.Bool("apply", false, "borrar de verdad (sin esta bandera solo se listan)")
	max := fs.Int("max", 0, "máximo de cuentas a borrar (0 = 20% de las cuentas vinculadas a Clerk)")
	if err := fs.Parse(args[1:]); err != nil {
		return 2
	}
	dsn, key := os.Getenv("DATABASE_URL"), os.Getenv("CLERK_SECRET_KEY")
	if dsn == "" || key == "" {
		fmt.Fprintln(stderr, "faltan DATABASE_URL o CLERK_SECRET_KEY")
		return 2
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	clerk.SetKey(key)
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		fmt.Fprintln(stderr, "no se pudo abrir la base")
		return 1
	}
	defer pool.Close()

	svc := accountdeletion.NewService(accountdeletion.NewRepository(pool), pool, nil, nil, nil, nil)
	// At most ten questions a second to Clerk, well under its limits.
	exists := func(ctx context.Context, clerkUserID string) (bool, error) {
		time.Sleep(100 * time.Millisecond)
		return accountdeletion.ClerkAPI{}.Exists(ctx, clerkUserID)
	}
	res, err := svc.ReconcileDeleted(ctx, exists, accountdeletion.ReconcileOptions{Apply: *apply, Max: *max})
	fmt.Fprintf(stdout, "cuentas revisadas: %d, sin usuario en Clerk: %d, borradas de nuevo: %d\n", res.Checked, len(res.Gone), res.Deleted)
	if !*apply && len(res.Gone) > 0 {
		fmt.Fprintln(stdout, "modo de prueba: no se borró nada; ids de cuenta:")
		for _, id := range res.Gone {
			fmt.Fprintln(stdout, " ", id)
		}
		fmt.Fprintln(stdout, "para borrarlas de verdad, repite con --apply")
	}
	if errors.Is(err, accountdeletion.ErrTooManyGone) {
		fmt.Fprintln(stderr, "se detuvo sin borrar nada:", err.Error())
		return 1
	}
	if err != nil {
		fmt.Fprintln(stderr, "se detuvo antes de terminar:", err.Error())
		return 1
	}
	return 0
}
