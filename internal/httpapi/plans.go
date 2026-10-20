package httpapi

import (
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/billing"
)

// planPricesHandler serves the list prices for the public pricing and checkout pages. No sign-in needed.
func planPricesHandler(db *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		prices, err := billing.Prices(r.Context(), db)
		if err != nil {
			slog.Error("load plan prices", "error", err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load prices"})
			return
		}
		w.Header().Set("Cache-Control", "public, max-age=60")
		writeJSON(w, http.StatusOK, map[string]any{"currency": "USD", "plans": prices})
	}
}
