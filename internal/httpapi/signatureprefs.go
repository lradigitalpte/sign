package httpapi

import (
	"encoding/json"
	"net/http"

	"signing-platform/internal/identity"
	"signing-platform/internal/signatureprefs"
)

func signaturePreferenceRoutes(service *signatureprefs.Service) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		session, _ := identity.SessionFromContext(r.Context())
		if r.Method == http.MethodGet {
			value, err := service.Get(r.Context(), session.User.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to load signature preferences"})
				return
			}
			writeJSON(w, http.StatusOK, value)
			return
		}
		var input signatureprefs.Preferences
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4<<20)).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
			return
		}
		value, err := service.Put(r.Context(), session.User.ID, input)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, value)
	}
}
