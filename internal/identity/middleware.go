package identity

import (
	"context"
	"net/http"

	platformauth "signing-platform/internal/auth"
)

func Middleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity, ok := platformauth.IdentityFromContext(r.Context())
			if !ok {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			session, err := service.Sync(r.Context(), identity.Subject, identity.OrganizationID, identity.Role)
			if err != nil {
				http.Error(w, "unable to load workspace", http.StatusBadGateway)
				return
			}
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), contextKey{}, session)))
		})
	}
}
