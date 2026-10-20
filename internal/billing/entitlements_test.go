package billing

import (
	"errors"
	"testing"
)

func entitlements(plan string, enforced bool) Entitlements {
	e := Entitlements{Enforced: enforced, Plan: plan, Seats: 5, Features: map[Feature]bool{}}
	for feature, minimum := range MinimumPlan {
		e.Features[feature] = planRank[plan] >= planRank[minimum]
	}
	if plan == "free" {
		e.Seats = 1
		limit := FreeMonthlySends
		e.MonthlySendLimit = &limit
	}
	return e
}

func TestEntitlementChecks(t *testing.T) {
	var planErr *PlanError

	// Off: nothing is blocked, whatever the plan.
	off := entitlements("free", false)
	off.SentThisMonth, off.SeatsUsed = 99, 99
	if off.CheckFeature(FeatureOwnStorage) != nil || off.CheckSeat() != nil || off.CheckSend() != nil {
		t.Fatal("limits applied while enforcement is off")
	}

	free := entitlements("free", true)
	if err := free.CheckFeature(FeatureBulkActions); !errors.As(err, &planErr) || planErr.Code != "plan_required" || planErr.RequiredPlan != "business" {
		t.Fatalf("free bulk actions = %v", err)
	}
	free.SeatsUsed = 1
	if err := free.CheckSeat(); !errors.As(err, &planErr) || planErr.Code != "seat_limit" {
		t.Fatalf("free second sender = %v", err)
	}
	free.SentThisMonth = 2
	if err := free.CheckSend(); err != nil {
		t.Fatalf("free third send blocked: %v", err)
	}
	free.SentThisMonth = 3
	if err := free.CheckSend(); !errors.As(err, &planErr) || planErr.Code != "send_limit" {
		t.Fatalf("free fourth send = %v", err)
	}

	business := entitlements("business", true)
	business.SentThisMonth = 1000
	if business.CheckFeature(FeatureBulkActions) != nil || business.CheckSend() != nil {
		t.Fatal("business blocked from its own features or from sending")
	}
	if err := business.CheckFeature(FeaturePDFVault); !errors.As(err, &planErr) || planErr.RequiredPlan != "premium" {
		t.Fatalf("business PDF vault = %v", err)
	}
	business.SeatsUsed, business.PendingSeats = 4, 1
	if err := business.CheckSeat(); !errors.As(err, &planErr) {
		t.Fatalf("pending invitations should count toward seats: %v", err)
	}
	if err := entitlements("enterprise", true).CheckFeature(FeatureOwnStorage); err != nil {
		t.Fatalf("enterprise own storage = %v", err)
	}
}
