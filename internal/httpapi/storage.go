package httpapi

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/identity"
	"signing-platform/internal/storage"
)

func storageRoutes(resolver *storage.OrgResolver) func(chi.Router) {
	return func(r chi.Router) {
		r.Get("/", func(w http.ResponseWriter, request *http.Request) {
			current, ok := identity.SessionFromContext(request.Context())
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			config, err := resolver.Public(request.Context(), current.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load storage settings"})
				return
			}
			writeJSON(w, http.StatusOK, config)
		})
		r.Put("/", func(w http.ResponseWriter, request *http.Request) {
			current, ok := identity.SessionFromContext(request.Context())
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			if current.Workspace.Role != "owner" && current.Workspace.Role != "admin" {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "administrator access required"})
				return
			}
			var input storage.SaveInput
			if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 1<<20)).Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid storage settings"})
				return
			}
			config, err := resolver.Save(request.Context(), current.Workspace.ID, input)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, config)
		})
		r.Post("/test", func(w http.ResponseWriter, request *http.Request) {
			current, ok := identity.SessionFromContext(request.Context())
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			if current.Workspace.Role != "owner" && current.Workspace.Role != "admin" {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "administrator access required"})
				return
			}
			var input storage.SaveInput
			var inputPtr *storage.SaveInput
			if request.Body != nil && request.ContentLength != 0 {
				if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 1<<20)).Decode(&input); err == nil {
					inputPtr = &input
				}
			}
			config, err := resolver.Test(request.Context(), current.Workspace.ID, inputPtr)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, config)
		})
		r.Delete("/", func(w http.ResponseWriter, request *http.Request) {
			current, ok := identity.SessionFromContext(request.Context())
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			if current.Workspace.Role != "owner" && current.Workspace.Role != "admin" {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "administrator access required"})
				return
			}
			config, err := resolver.Disconnect(request.Context(), current.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to disconnect storage"})
				return
			}
			writeJSON(w, http.StatusOK, config)
		})
	}
}
