// Command admin manages platform admins from the command line. Use it to grant the first super_admin;
// after that, super_admins can manage admins in the admin app. Every change is written to admin_audit_events.
//
//	go run ./cmd/admin grant  --email you@company.com --role super_admin
//	go run ./cmd/admin revoke --email someone@company.com --reason "left the team"
//	go run ./cmd/admin list
//
// Reads DATABASE_URL from the environment or .env, like the API. The user must have signed in to Signet at least once.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"text/tabwriter"

	"signing-platform/internal/admin"
	"signing-platform/internal/config"
	"signing-platform/internal/database"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	cfg, err := config.Load()
	if err != nil {
		fail("load configuration: %v", err)
	}

	ctx := context.Background()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		fail("connect to database: %v", err)
	}
	defer pool.Close()
	service := admin.NewService(pool)

	command, args := os.Args[1], os.Args[2:]
	flags := flag.NewFlagSet(command, flag.ExitOnError)
	email := flags.String("email", "", "email of the user")
	role := flags.String("role", string(admin.RoleSuperAdmin), "read_only, support or super_admin")
	reason := flags.String("reason", "", "why access is being removed")
	_ = flags.Parse(args)

	switch command {
	case "grant":
		requireEmail(*email)
		granted, err := service.Grant(ctx, *email, admin.Role(*role), nil)
		if err != nil {
			fail("%v", err)
		}
		fmt.Printf("%s (%s) is now a platform %s\n", granted.Name, granted.Email, granted.Role)
	case "revoke":
		requireEmail(*email)
		if err := service.Revoke(ctx, *email, nil, *reason); err != nil {
			fail("%v", err)
		}
		fmt.Printf("%s is no longer a platform admin\n", *email)
	case "list":
		admins, err := service.List(ctx)
		if err != nil {
			fail("%v", err)
		}
		if len(admins) == 0 {
			fmt.Println("No platform admins yet. Grant one with: go run ./cmd/admin grant --email you@company.com")
			return
		}
		table := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(table, "EMAIL\tNAME\tROLE\tSINCE")
		for _, a := range admins {
			fmt.Fprintf(table, "%s\t%s\t%s\t%s\n", a.Email, a.Name, a.Role, a.CreatedAt.Format("2006-01-02"))
		}
		_ = table.Flush()
	default:
		usage()
	}
}

func requireEmail(email string) {
	if email == "" {
		fail("--email is required")
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: admin grant --email EMAIL [--role read_only|support|super_admin]\n       admin revoke --email EMAIL [--reason TEXT]\n       admin list")
	os.Exit(2)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "admin: "+format+"\n", args...)
	os.Exit(1)
}
