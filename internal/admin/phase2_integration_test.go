package admin

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"signing-platform/internal/billing"
	"signing-platform/internal/database"
	"signing-platform/internal/features"
	"signing-platform/internal/webhooks"
)

func signWorkOS(secret string, body []byte) string {
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(body)
	return "t=" + timestamp + ", v1=" + hex.EncodeToString(mac.Sum(nil))
}

// Plans, feature flags, usage and WorkOS webhooks on throwaway records, through the real webhook handler.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationPlansFlagsWebhooks(t *testing.T) {
	url := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ADMIN_TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := database.Open(ctx, url)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(pool.Close)
	processor := webhooks.NewProcessor(pool)
	s := NewService(pool).WithWebhooks(processor)

	suffix := time.Now().Format("150405.000000")
	subject, orgSubject, flagKey := "user_test_"+suffix, "org_test_"+suffix, "test.flag-"+time.Now().Format("150405")
	var userID, otherID, orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Phase Two') RETURNING id::text`, "phase2-"+suffix+"@example.com").Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Taken') RETURNING id::text`, "taken-"+suffix+"@example.com").Scan(&otherID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Phase Two Co', $1) RETURNING id::text`, "phase2-"+suffix).Scan(&orgID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, step := range []struct{ sql, id string }{
			{`DELETE FROM admin_audit_events WHERE admin_user_id = $1::uuid`, userID},
			{`DELETE FROM auth_webhook_events WHERE payload::text LIKE '%' || $1 || '%'`, suffix},
			{`DELETE FROM feature_flags WHERE key = $1`, flagKey},
			{`DELETE FROM organizations WHERE id = $1::uuid`, orgID},
			{`DELETE FROM users WHERE id = $1::uuid`, userID},
			{`DELETE FROM users WHERE id = $1::uuid`, otherID},
		} {
			if _, err := pool.Exec(ctx, step.sql, step.id); err != nil {
				t.Errorf("cleanup %q: %v", step.sql, err)
			}
		}
	})
	if _, err := pool.Exec(ctx, `INSERT INTO auth_identities (user_id, provider, provider_subject, provider_email) VALUES ($1::uuid, 'workos', $2, $3)`, userID, subject, "phase2-"+suffix+"@example.com"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO organization_auth_identities (organization_id, provider, provider_subject) VALUES ($1::uuid, 'workos', $2)`, orgID, orgSubject); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner'), ($1::uuid, $3::uuid, 'viewer')`, orgID, userID, otherID); err != nil {
		t.Fatal(err)
	}
	actor := Actor{Admin: Admin{UserID: userID}, IPAddress: "127.0.0.1", UserAgent: "test"}
	var actionErr *ActionError

	// ---- Plans ----
	sub, err := billing.Load(ctx, pool, orgID)
	if err != nil || sub.Plan != "free" || sub.SeatsUsed != 1 {
		t.Fatalf("default subscription = %+v, %v (viewers shouldn't use a seat)", sub, err)
	}
	if _, err := s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "gold", Reason: "x"}); !errors.As(err, &actionErr) || actionErr.Code != "invalid_plan" {
		t.Fatalf("invalid plan = %v", err)
	}
	if _, err := s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 5, Status: "trialing", Reason: "x"}); !errors.As(err, &actionErr) || actionErr.Code != "trial_end_required" {
		t.Fatalf("trial without end = %v", err)
	}
	annual, ends := "annual", time.Now().Add(365*24*time.Hour)
	got, err := s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "business", Seats: 5, BillingCycle: &annual, Status: "active", PeriodEndsAt: &ends, Note: "Invoice INV-1", Reason: "paid by bank transfer"})
	if err != nil || got.Plan != "business" || got.Seats != 5 || got.Note == nil || *got.Note != "Invoice INV-1" {
		t.Fatalf("SetSubscription = %+v, %v", got, err)
	}
	if list, err := s.ListWorkspaces(ctx, "Phase Two Co", "", "business", Page{}); err != nil || list.Total != 1 || list.Items[0].Plan != "business" {
		t.Fatalf("ListWorkspaces by plan = %+v, %v", list, err)
	}
	if got, err := s.SetSubscription(ctx, actor, orgID, SubscriptionInput{Plan: "free", Seats: 40, BillingCycle: &annual, Reason: "downgraded"}); err != nil || got.Seats != 1 || got.BillingCycle != nil {
		t.Fatalf("free clears billing details: %+v, %v", got, err)
	}

	// ---- Feature flags ----
	if err := s.CreateFlag(ctx, actor, FlagInput{Key: "Bad Key", Reason: ""}); !errors.As(err, &actionErr) || actionErr.Code != "invalid_key" {
		t.Fatalf("bad key = %v", err)
	}
	if err := s.CreateFlag(ctx, actor, FlagInput{Key: flagKey, Description: "Test flag"}); err != nil {
		t.Fatalf("CreateFlag: %v", err)
	}
	if err := s.CreateFlag(ctx, actor, FlagInput{Key: flagKey}); !errors.As(err, &actionErr) || actionErr.Code != "exists" {
		t.Fatalf("duplicate flag = %v", err)
	}
	on := true
	if err := s.SetFlagOverride(ctx, actor, flagKey, orgID, &on, "beta tester"); err != nil {
		t.Fatalf("SetFlagOverride: %v", err)
	}
	if flags, err := features.ForWorkspace(ctx, pool, orgID); err != nil || !flags[flagKey] {
		t.Fatalf("override on: %v, %v", flags, err)
	}
	if err := s.SetFlagOverride(ctx, actor, flagKey, orgID, nil, "beta over"); err != nil {
		t.Fatalf("remove override: %v", err)
	}
	if flags, _ := features.ForWorkspace(ctx, pool, orgID); flags[flagKey] {
		t.Fatal("flag still on after removing the override; default is off")
	}
	if err := s.SetFlagDefault(ctx, actor, flagKey, true, "launch"); err != nil {
		t.Fatalf("SetFlagDefault: %v", err)
	}
	if flags, _ := features.ForWorkspace(ctx, pool, orgID); !flags[flagKey] {
		t.Fatal("flag off after turning the default on")
	}
	if all, err := s.ListFlags(ctx); err != nil || len(all) == 0 {
		t.Fatalf("ListFlags = %d, %v", len(all), err)
	}
	if err := s.DeleteFlag(ctx, actor, flagKey, "cleanup"); err != nil {
		t.Fatalf("DeleteFlag: %v", err)
	}

	// ---- Usage ----
	if usage, err := s.GetWorkspaceUsage(ctx, orgID); err != nil || len(usage.Weeks) != usageWeeks {
		t.Fatalf("GetWorkspaceUsage = %+v, %v", usage, err)
	}

	// ---- WorkOS webhooks through the real handler ----
	handler := webhooks.Handler("whsec_test", processor, slog.Default())
	deliver := func(body string, signature string) int {
		request := httptest.NewRequest(http.MethodPost, "/webhooks/workos", bytes.NewBufferString(body))
		request.Header.Set(webhooks.SignatureHeader, signature)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response.Code
	}
	newEmail := "renamed-" + suffix + "@example.com"
	userUpdated := `{"id":"event_u_` + suffix + `","event":"user.updated","data":{"id":"` + subject + `","email":"` + newEmail + `","first_name":"Ana","last_name":"Mensah","email_verified":true}}`
	if code := deliver(userUpdated, "t=1, v1=00"); code != http.StatusUnauthorized {
		t.Fatalf("bad signature = %d, want 401", code)
	}
	if code := deliver(userUpdated, signWorkOS("whsec_test", []byte(userUpdated))); code != http.StatusOK {
		t.Fatalf("user.updated = %d", code)
	}
	var name, email string
	var verified bool
	if err := pool.QueryRow(ctx, `SELECT name, email, email_verified_at IS NOT NULL FROM users WHERE id = $1::uuid`, userID).Scan(&name, &email, &verified); err != nil || name != "Ana Mensah" || email != newEmail || !verified {
		t.Fatalf("after user.updated: %q %q %v %v", name, email, verified, err)
	}
	// Re-delivery of the same event is stored once.
	if code := deliver(userUpdated, signWorkOS("whsec_test", []byte(userUpdated))); code != http.StatusOK {
		t.Fatalf("redelivery = %d", code)
	}
	orgUpdated := `{"id":"event_o_` + suffix + `","event":"organization.updated","data":{"id":"` + orgSubject + `","name":"Phase Two Renamed"}}`
	if code := deliver(orgUpdated, signWorkOS("whsec_test", []byte(orgUpdated))); code != http.StatusOK {
		t.Fatalf("organization.updated = %d", code)
	}
	var orgName string
	if err := pool.QueryRow(ctx, `SELECT name FROM organizations WHERE id = $1::uuid`, orgID).Scan(&orgName); err != nil || orgName != "Phase Two Renamed" {
		t.Fatalf("org name = %q, %v", orgName, err)
	}
	// An email change that collides with another account fails, is recorded, and can be reprocessed later.
	collide := `{"id":"event_c_` + suffix + `","event":"user.updated","data":{"id":"` + subject + `","email":"taken-` + suffix + `@example.com","first_name":"Ana","last_name":"Mensah","email_verified":true}}`
	if code := deliver(collide, signWorkOS("whsec_test", []byte(collide))); code != http.StatusOK {
		t.Fatalf("colliding user.updated = %d (stored events answer 200)", code)
	}
	failed, err := s.ListWebhookEvents(ctx, "event_c_"+suffix, "failed", Page{})
	if err != nil || failed.Total != 1 || failed.Items[0].Error == nil {
		t.Fatalf("failed events = %+v, %v", failed, err)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET email = $2 WHERE id = $1::uuid`, otherID, "freed-"+suffix+"@example.com"); err != nil {
		t.Fatal(err)
	}
	again, err := s.ReprocessWebhookEvent(ctx, actor, failed.Items[0].ID, "other account changed email")
	if err != nil || again.State != "processed" {
		t.Fatalf("reprocess = %+v, %v", again, err)
	}
	all, err := s.ListWebhookEvents(ctx, suffix, "", Page{})
	if err != nil || all.Total != 3 {
		t.Fatalf("events for this test = %d, %v (want 3: redelivery not stored twice)", all.Total, err)
	}
	if detail, err := s.GetWebhookEvent(ctx, again.ID); err != nil || len(detail.Payload) == 0 {
		t.Fatalf("GetWebhookEvent payload = %d bytes, %v", len(detail.Payload), err)
	}
}
