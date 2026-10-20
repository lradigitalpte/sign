package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"signing-platform/internal/billing"
	"signing-platform/internal/identity"
	"signing-platform/internal/stripe"
)

// billingRoutes mounts under /v1/billing. Anyone in the workspace can see billing details; only owners
// and admins can buy, change the plan or open the Stripe portal.
func billingRoutes(payments *billing.Stripe) func(chi.Router) {
	return func(r chi.Router) {
		r.Get("/details", func(w http.ResponseWriter, request *http.Request) {
			current, ok := identity.SessionFromContext(request.Context())
			if !ok {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
			details, err := payments.Details(request.Context(), current.Workspace.ID)
			if err != nil {
				slog.Error("load billing details", "error", err)
				writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Couldn't reach Stripe. Try again in a moment."})
				return
			}
			writeJSON(w, http.StatusOK, details)
		})
		r.Post("/checkout", func(w http.ResponseWriter, request *http.Request) {
			current, ok := billingManager(w, request)
			if !ok {
				return
			}
			var input billing.CheckoutInput
			if err := json.NewDecoder(http.MaxBytesReader(w, request.Body, 16<<10)).Decode(&input); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
				return
			}
			result, err := payments.Checkout(request.Context(), current.Workspace.ID, current.User.Email, input)
			if err != nil {
				writeBillingError(w, "start checkout", err)
				return
			}
			writeJSON(w, http.StatusOK, result)
		})
		r.Post("/portal", func(w http.ResponseWriter, request *http.Request) {
			current, ok := billingManager(w, request)
			if !ok {
				return
			}
			portalURL, err := payments.PortalURL(request.Context(), current.Workspace.ID)
			if err != nil {
				writeBillingError(w, "open billing portal", err)
				return
			}
			writeJSON(w, http.StatusOK, map[string]string{"url": portalURL})
		})
	}
}

func billingManager(w http.ResponseWriter, request *http.Request) (identity.Session, bool) {
	current, ok := identity.SessionFromContext(request.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return identity.Session{}, false
	}
	if current.Workspace.Role != "owner" && current.Workspace.Role != "admin" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "Only workspace owners and admins can change billing."})
		return identity.Session{}, false
	}
	return current, true
}

func writeBillingError(w http.ResponseWriter, action string, err error) {
	var checkoutErr *billing.CheckoutError
	var stripeErr *stripe.Error
	switch {
	case errors.As(err, &checkoutErr):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": checkoutErr.Message})
	case errors.Is(err, billing.ErrBillingUnavailable):
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Online payments aren't available yet. Contact sales to change your plan.", "code": "billing_unavailable"})
	case errors.Is(err, billing.ErrNoBillingAccount):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "This workspace doesn't pay online yet. Choose a plan first."})
	case errors.As(err, &stripeErr) && stripeErr.Status < 500:
		slog.Warn("stripe refused request", "action", action, "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Stripe couldn't complete this: " + stripeErr.Message})
	default:
		slog.Error(action, "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "Couldn't reach Stripe. Try again in a moment."})
	}
}

// stripeWebhookHandler receives Stripe's events. A bad signature gets 400 (Stripe won't retry);
// a processing failure gets 500, so Stripe retries later.
func stripeWebhookHandler(payments *billing.Stripe) http.HandlerFunc {
	return func(w http.ResponseWriter, request *http.Request) {
		if !payments.Enabled() {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		payload, err := io.ReadAll(http.MaxBytesReader(w, request.Body, 1<<20))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unreadable body"})
			return
		}
		err = payments.HandleWebhook(request.Context(), payload, request.Header.Get("Stripe-Signature"))
		switch {
		case err == nil:
			writeJSON(w, http.StatusOK, map[string]bool{"received": true})
		case errors.Is(err, stripe.ErrBadSignature):
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid signature"})
		case errors.Is(err, billing.ErrBillingUnavailable):
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "STRIPE_WEBHOOK_SECRET isn't set"})
		default:
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "processing failed"})
		}
	}
}
