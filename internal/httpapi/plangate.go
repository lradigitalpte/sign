package httpapi

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"signing-platform/internal/billing"
	"signing-platform/internal/identity"
)

// Plan limits, applied to writes only. Reading is never blocked, and nothing that already exists stops
// working: a workspace over its limits can still open, finish and clean up what it has; it just can't
// start more of what its plan doesn't include. All of it is off unless the plan-enforcement flag is on.

type planRule struct {
	methods string // one or more, separated by |
	path    *regexp.Regexp
	// check decides from the request body (already read) whether, and how, the plan limits apply.
	check func(e billing.Entitlements, body map[string]any) error
}

func feature(f billing.Feature) func(billing.Entitlements, map[string]any) error {
	return func(e billing.Entitlements, _ map[string]any) error { return e.CheckFeature(f) }
}

func isTrue(body map[string]any, key string) bool { v, ok := body[key].(bool); return ok && v }

func text(body map[string]any, key string) string {
	v, _ := body[key].(string)
	return strings.TrimSpace(v)
}

// takesSeat reports whether a role needs a sender seat. Viewers only read, so they're free.
func takesSeat(role string) bool {
	role = strings.ToLower(role)
	return role != "" && role != "viewer"
}

var planRules = []planRule{
	// Sending: Free has a monthly allowance.
	{http.MethodPost, regexp.MustCompile(`^/v1/envelopes/[^/]+/send/?$`), func(e billing.Entitlements, _ map[string]any) error { return e.CheckSend() }},

	// Seats: inviting or promoting someone who can send.
	{http.MethodPost, regexp.MustCompile(`^/v1/members/invite/?$`), func(e billing.Entitlements, body map[string]any) error {
		if takesSeat(text(body, "role")) {
			return e.CheckSeat()
		}
		return nil
	}},
	{http.MethodPatch, regexp.MustCompile(`^/v1/members/[^/]+/role/?$`), func(e billing.Entitlements, body map[string]any) error {
		// Changing between sending roles doesn't take another seat; the handler below only sees promotions from viewer.
		if takesSeat(text(body, "role")) {
			return errPromotion
		}
		return nil
	}},

	// Business features.
	{http.MethodPost, regexp.MustCompile(`^/v1/envelopes/bulk/`), feature(billing.FeatureBulkActions)},
	{http.MethodPost, regexp.MustCompile(`^/v1/folders/?$`), feature(billing.FeatureFolders)},
	{http.MethodPost, regexp.MustCompile(`^/v1/folders/[^/]+/transfer/?$`), feature(billing.FeatureFolders)},
	{http.MethodPost, regexp.MustCompile(`^/v1/(teams|groups)/?$`), feature(billing.FeatureTeams)},
	{http.MethodPost, regexp.MustCompile(`^/v1/envelopes/[^/]+/attachments/?$`), feature(billing.FeatureAttachments)},
	{http.MethodPost, regexp.MustCompile(`^/v1/envelopes/[^/]+/share-links/`), feature(billing.FeatureSigningLinks)},
	{http.MethodPatch, regexp.MustCompile(`^/v1/envelopes/[^/]+/?$`), func(e billing.Entitlements, body map[string]any) error {
		if strings.EqualFold(text(body, "distributionMethod"), "link") {
			if err := e.CheckFeature(billing.FeatureSigningLinks); err != nil {
				return err
			}
		}
		if text(body, "redirectUrl") != "" {
			if err := e.CheckFeature(billing.FeatureRedirect); err != nil {
				return err
			}
		}
		if isTrue(body, "requirePasscode") {
			return e.CheckFeature(billing.FeatureSignerPasscode)
		}
		return nil
	}},
	{"POST|PATCH", regexp.MustCompile(`^/v1/envelopes/[^/]+/fields(/[^/]+)?/?$`), func(e billing.Entitlements, body map[string]any) error {
		switch text(body, "type") {
		case "dropdown", "radio", "attachment":
			return e.CheckFeature(billing.FeatureAdvancedFields)
		}
		return nil
	}},
	{http.MethodPut, regexp.MustCompile(`^/v1/workspace/settings/branding/?$`), func(e billing.Entitlements, body map[string]any) error {
		if err := e.CheckFeature(billing.FeatureBranding); err != nil {
			return err
		}
		if isTrue(body, "hidePlatformBranding") {
			return e.CheckFeature(billing.FeatureRemoveBranding)
		}
		return nil
	}},
	// A team's own branding needs the same plan; going back to the workspace's branding is always allowed.
	{http.MethodPut, regexp.MustCompile(`^/v1/team/settings/branding/?$`), func(e billing.Entitlements, body map[string]any) error {
		overrides, _ := body["overrides"].(map[string]any)
		if len(overrides) == 0 {
			return nil
		}
		if err := e.CheckFeature(billing.FeatureBranding); err != nil {
			return err
		}
		if isTrue(overrides, "hidePlatformBranding") {
			return e.CheckFeature(billing.FeatureRemoveBranding)
		}
		return nil
	}},

	// Premium and Enterprise features.
	{http.MethodPost, regexp.MustCompile(`^/v1/pdf-security/(encrypt|decrypt|verify)/?$`), feature(billing.FeaturePDFVault)},
	{http.MethodPost, regexp.MustCompile(`^/v1/pdf-security/[^/]+/password/rotate/?$`), feature(billing.FeaturePDFVault)},
	{http.MethodPut, regexp.MustCompile(`^/v1/workspace/storage/?$`), feature(billing.FeatureOwnStorage)},
	{http.MethodPost, regexp.MustCompile(`^/v1/workspace/storage/test/?$`), feature(billing.FeatureOwnStorage)},
}

// errPromotion asks planGate to check whether a role change promotes a viewer (which takes a seat).
var errPromotion = errors.New("check promotion")

var memberRolePath = regexp.MustCompile(`^/v1/members/([^/]+)/role/?$`)

// maxGatedBody is how much of a JSON body planGate reads. Larger bodies (file uploads) aren't JSON rules.
const maxGatedBody = 64 << 10

// planGate enforces plan limits on the routes in planRules.
func planGate(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			var rule *planRule
			for i := range planRules {
				if strings.Contains("|"+planRules[i].methods+"|", "|"+r.Method+"|") && planRules[i].path.MatchString(r.URL.Path) {
					rule = &planRules[i]
					break
				}
			}
			if rule == nil {
				next.ServeHTTP(w, r)
				return
			}
			session, _ := identity.SessionFromContext(r.Context())
			entitlements, err := billing.LoadEntitlements(r.Context(), db, session.Workspace.ID)
			if err != nil {
				slog.ErrorContext(r.Context(), "load plan entitlements", "error", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "unable to check your plan"})
				return
			}
			if !entitlements.Enforced {
				next.ServeHTTP(w, r)
				return
			}
			body := map[string]any{}
			if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") && r.Body != nil {
				raw, err := io.ReadAll(io.LimitReader(r.Body, maxGatedBody+1))
				if err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unreadable request body"})
					return
				}
				// Put the body back for the handler, whatever it contains.
				r.Body = io.NopCloser(io.MultiReader(bytes.NewReader(raw), r.Body))
				if len(raw) <= maxGatedBody {
					_ = json.Unmarshal(raw, &body)
				}
			}
			err = rule.check(entitlements, body)
			if errors.Is(err, errPromotion) {
				err = nil
				if match := memberRolePath.FindStringSubmatch(r.URL.Path); match != nil {
					var current string
					if qerr := db.QueryRow(r.Context(), `SELECT role::text FROM organization_memberships WHERE organization_id = $1::uuid AND user_id::text = $2`, session.Workspace.ID, match[1]).Scan(&current); qerr == nil && !takesSeat(current) {
						err = entitlements.CheckSeat()
					}
				}
			}
			var planErr *billing.PlanError
			if errors.As(err, &planErr) {
				writeJSON(w, http.StatusPaymentRequired, planErr)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
