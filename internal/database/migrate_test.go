package database

import "testing"

func TestMigrationUp(t *testing.T) {
	got, err := migrationUp("-- +goose Up\nCREATE TABLE example(id int);\n-- +goose Down\nDROP TABLE example;")
	if err != nil {
		t.Fatalf("migrationUp: %v", err)
	}
	if got != "\nCREATE TABLE example(id int);\n" {
		t.Fatalf("unexpected up migration: %q", got)
	}
}

func TestMigrationUpRequiresMarker(t *testing.T) {
	if _, err := migrationUp("SELECT 1;"); err == nil {
		t.Fatal("expected missing marker error")
	}
}
