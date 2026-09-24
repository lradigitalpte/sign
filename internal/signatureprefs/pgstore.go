package signatureprefs

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresStore struct{ db *pgxpool.Pool }

func NewPostgresStore(db *pgxpool.Pool) *PostgresStore { return &PostgresStore{db: db} }

func (s *PostgresStore) Get(ctx context.Context, userID string) ([]byte, []byte, error) {
	var signature, initials []byte
	err := s.db.QueryRow(ctx, `SELECT signature_ciphertext, initials_ciphertext FROM user_signature_preferences WHERE user_id=$1::uuid`, userID).Scan(&signature, &initials)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil
	}
	return signature, initials, err
}

func (s *PostgresStore) Put(ctx context.Context, userID string, signature, initials []byte) error {
	_, err := s.db.Exec(ctx, `INSERT INTO user_signature_preferences(user_id,signature_ciphertext,initials_ciphertext)
VALUES($1::uuid,$2,$3) ON CONFLICT(user_id) DO UPDATE SET signature_ciphertext=EXCLUDED.signature_ciphertext,initials_ciphertext=EXCLUDED.initials_ciphertext,updated_at=now()`, userID, nullable(signature), nullable(initials))
	return err
}

func nullable(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return value
}
