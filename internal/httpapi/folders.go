package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"signing-platform/internal/folder"
	"signing-platform/internal/identity"
)

func folderRoutes(service *folder.Service) func(chi.Router) {
	return func(router chi.Router) {
		router.Get("/", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			values, err := service.List(r.Context(), session.Workspace.ID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to list folders"})
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"data": values})
		})
		router.Post("/", func(w http.ResponseWriter, r *http.Request) {
			var input folder.CreateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Create(r.Context(), session.Workspace.ID, session.User.ID, input)
			if errors.Is(err, folder.ErrConflict) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusCreated, value)
		})
		router.Patch("/{folderID}", func(w http.ResponseWriter, r *http.Request) {
			var input folder.UpdateInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			value, err := service.Update(r.Context(), session.Workspace.ID, chi.URLParam(r, "folderID"), input)
			if errors.Is(err, folder.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "folder not found"})
				return
			}
			if errors.Is(err, folder.ErrConflict) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, value)
		})
		router.Post("/{folderID}/transfer", func(w http.ResponseWriter, r *http.Request) {
			var input folder.TransferInput
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			result, err := service.TransferEnvelopes(r.Context(), session.Workspace.ID, chi.URLParam(r, "folderID"), input)
			if errors.Is(err, folder.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "folder not found"})
				return
			}
			if errors.Is(err, folder.ErrInvalidTransfer) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to transfer envelopes"})
				return
			}
			writeJSON(w, http.StatusOK, result)
		})
		router.Delete("/{folderID}", func(w http.ResponseWriter, r *http.Request) {
			session, _ := identity.SessionFromContext(r.Context())
			err := service.Delete(r.Context(), session.Workspace.ID, chi.URLParam(r, "folderID"))
			if errors.Is(err, folder.ErrNotFound) {
				writeJSON(w, http.StatusNotFound, map[string]string{"error": "folder not found"})
				return
			}
			if errors.Is(err, folder.ErrNotEmpty) {
				writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
				return
			}
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to delete folder"})
				return
			}
			w.WriteHeader(http.StatusNoContent)
		})
	}
}
