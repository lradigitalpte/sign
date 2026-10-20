package billing

import (
	"context"
	"fmt"
	"time"

	"signing-platform/internal/features"
)

// EnforcementFlag is the feature flag that turns plan limits on. It starts off, so nothing is blocked
// until Signet staff switch it on (for chosen workspaces first, then for everyone).
const EnforcementFlag = "plan-enforcement"

// Feature is something only some plans include. The minimum plans mirror the pricing page.
type Feature string

const (
	FeatureSigningLinks   Feature = "signing_links"
	FeatureRedirect       Feature = "redirect_after_signing"
	FeatureAdvancedFields Feature = "advanced_fields"
	FeatureAttachments    Feature = "attachments"
	FeatureFolders        Feature = "shared_folders"
	FeatureBulkActions    Feature = "bulk_actions"
	FeatureTeams          Feature = "teams_and_groups"
	FeatureBranding       Feature = "email_branding"
	FeatureSignerPasscode Feature = "signer_passcode"
	FeatureRemoveBranding Feature = "remove_signet_branding"
	FeaturePDFVault       Feature = "pdf_vault"
	FeatureOwnStorage     Feature = "own_storage"
)

// MinimumPlan is the cheapest plan that includes each feature.
var MinimumPlan = map[Feature]string{
	FeatureSigningLinks:   "business",
	FeatureRedirect:       "business",
	FeatureAdvancedFields: "business",
	FeatureAttachments:    "business",
	FeatureFolders:        "business",
	FeatureBulkActions:    "business",
	FeatureTeams:          "business",
	FeatureBranding:       "business",
	FeatureSignerPasscode: "business",
	FeatureRemoveBranding: "premium",
	FeaturePDFVault:       "premium",
	FeatureOwnStorage:     "enterprise",
}

// FeatureLabels name each feature the way the pricing page does, for error messages.
var FeatureLabels = map[Feature]string{
	FeatureSigningLinks:   "Delivery by signing link",
	FeatureRedirect:       "Redirecting signers after signing",
	FeatureAdvancedFields: "Dropdown, radio and file-upload fields",
	FeatureAttachments:    "Attachments on envelopes",
	FeatureFolders:        "Shared folders",
	FeatureBulkActions:    "Bulk move, delete and void",
	FeatureTeams:          "Teams and groups",
	FeatureBranding:       "Your branding on recipient emails",
	FeatureSignerPasscode: "Signer passcodes",
	FeatureRemoveBranding: "Removing Signet branding",
	FeaturePDFVault:       "The PDF encryption vault",
	FeatureOwnStorage:     "Bring your own storage",
}

// FreeMonthlySends is how many envelopes a Free workspace can send per calendar month (UTC).
const FreeMonthlySends = 3

var planRank = map[string]int{"free": 0, "starter": 1, "business": 2, "premium": 3, "enterprise": 4}

// Entitlements is what a workspace may do on its current plan.
type Entitlements struct {
	// Enforced is false while the plan-enforcement flag is off for the workspace; then everything is allowed.
	Enforced bool `json:"enforced"`
	// Plan is the plan limits come from: Free once a canceled plan's paid period is over.
	Plan string `json:"plan"`
	// Seats is how many members may send; viewers don't count.
	Seats     int `json:"seats"`
	SeatsUsed int `json:"seatsUsed"`
	// PendingSeats counts invitations that would take a seat when accepted.
	PendingSeats int `json:"pendingSeats"`
	// MonthlySendLimit is nil when sending isn't capped.
	MonthlySendLimit *int             `json:"monthlySendLimit"`
	SentThisMonth    int              `json:"sentThisMonth"`
	Features         map[Feature]bool `json:"features"`
}

type entitlementQuerier interface {
	querier
	rowsQuerier
}

// LoadEntitlements works out a workspace's limits from its subscription and the enforcement flag.
func LoadEntitlements(ctx context.Context, db entitlementQuerier, organizationID string) (Entitlements, error) {
	sub, err := Load(ctx, db, organizationID)
	if err != nil {
		return Entitlements{}, err
	}
	flags, err := features.ForWorkspace(ctx, db, organizationID)
	if err != nil {
		return Entitlements{}, err
	}
	e := Entitlements{Enforced: flags[EnforcementFlag], Plan: sub.Plan, Seats: sub.Seats, SeatsUsed: sub.SeatsUsed, Features: map[Feature]bool{}}
	// A canceled plan keeps working until its paid period ends; past due keeps working (staff follow up).
	if sub.Status == "canceled" && (sub.PeriodEndsAt == nil || sub.PeriodEndsAt.Before(time.Now())) {
		e.Plan = "free"
	}
	if e.Plan == "free" {
		e.Seats = 1
		limit := FreeMonthlySends
		e.MonthlySendLimit = &limit
	}
	if err := db.QueryRow(ctx, `
SELECT
  (SELECT count(*) FROM envelopes WHERE organization_id = $1::uuid AND sent_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),
  (SELECT count(*) FROM organization_invitations WHERE organization_id = $1::uuid AND status = 'pending' AND expires_at > now() AND role <> 'viewer')`, organizationID).
		Scan(&e.SentThisMonth, &e.PendingSeats); err != nil {
		return Entitlements{}, err
	}
	for feature, minimum := range MinimumPlan {
		e.Features[feature] = planRank[e.Plan] >= planRank[minimum]
	}
	return e, nil
}

// PlanError explains a blocked action and which plan would allow it. The API answers 402 with it.
type PlanError struct {
	Code         string  `json:"code"` // plan_required, seat_limit or send_limit
	Message      string  `json:"error"`
	Feature      Feature `json:"feature,omitempty"`
	RequiredPlan string  `json:"requiredPlan,omitempty"`
}

func (e *PlanError) Error() string { return e.Message }

var planNames = map[string]string{"free": "Free", "starter": "Starter", "business": "Business", "premium": "Premium", "enterprise": "Enterprise"}

// CheckFeature returns a PlanError when the plan doesn't include feature.
func (e Entitlements) CheckFeature(feature Feature) error {
	if !e.Enforced || e.Features[feature] {
		return nil
	}
	required := MinimumPlan[feature]
	return &PlanError{Code: "plan_required", Feature: feature, RequiredPlan: required,
		Message: fmt.Sprintf("%s is included from the %s plan. Upgrade to use it.", FeatureLabels[feature], planNames[required])}
}

// CheckSeat returns a PlanError when another sending member wouldn't fit in the paid seats.
func (e Entitlements) CheckSeat() error {
	if !e.Enforced || e.SeatsUsed+e.PendingSeats < e.Seats {
		return nil
	}
	if e.Plan == "free" {
		return &PlanError{Code: "seat_limit", RequiredPlan: "starter",
			Message: "The Free plan has one sender. Invite them as a viewer, or upgrade to add sender seats."}
	}
	return &PlanError{Code: "seat_limit",
		Message: fmt.Sprintf("All %d seats are in use (pending invitations count too). Add seats to your plan, or invite them as a viewer.", e.Seats)}
}

// CheckSend returns a PlanError when the monthly sending allowance is used up.
func (e Entitlements) CheckSend() error {
	if !e.Enforced || e.MonthlySendLimit == nil || e.SentThisMonth < *e.MonthlySendLimit {
		return nil
	}
	return &PlanError{Code: "send_limit", RequiredPlan: "starter",
		Message: fmt.Sprintf("The Free plan includes %d sent envelopes a month, and you've used them. Upgrade to send more, or wait until the 1st.", *e.MonthlySendLimit)}
}
