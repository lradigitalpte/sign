package admin

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"signing-platform/internal/announcements"
	"signing-platform/internal/database"
	"signing-platform/internal/document"
	"signing-platform/internal/lifecycle"
	"signing-platform/internal/storage"
	"signing-platform/internal/supportaccess"
)

// memoryStore is an in-memory object store that can be told to fail deletes.
type memoryStore struct {
	mu         sync.Mutex
	objects    map[string][]byte
	failDelete bool
}

func (m *memoryStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.objects[key] = data
	return nil
}

func (m *memoryStore) Get(_ context.Context, key string) (io.ReadCloser, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	data, ok := m.objects[key]
	if !ok {
		return nil, errors.New("no such key")
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

func (m *memoryStore) Delete(_ context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.failDelete {
		return errors.New("storage unavailable")
	}
	delete(m.objects, key)
	return nil
}

func (m *memoryStore) has(key string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.objects[key]
	return ok
}

// Support access, document viewing, announcements, export, retention and workspace deletion on throwaway records.
// Run with: ADMIN_TEST_DATABASE_URL=postgres://... go test ./internal/admin -run Integration
func TestIntegrationSupportAndLifecycle(t *testing.T) {
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
	store := &memoryStore{objects: map[string][]byte{}}
	objects := storage.Static(store)
	life := lifecycle.New(pool, objects, nil)
	s := NewService(pool).WithLifecycle(life).WithDocuments(document.NewService(document.NewPostgresStore(pool), objects))

	suffix := time.Now().Format("150405.000000")
	var userID, orgID string
	if err := pool.QueryRow(ctx, `INSERT INTO users (email, name) VALUES ($1, 'Lifecycle Owner') RETURNING id::text`, "lifecycle-"+suffix+"@example.com").Scan(&userID); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO organizations (name, slug) VALUES ('Lifecycle Co', $1) RETURNING id::text`, "lifecycle-"+suffix).Scan(&orgID); err != nil {
		t.Fatal(err)
	}
	var announcementIDs []string
	t.Cleanup(func() {
		for _, step := range []struct{ sql, id string }{
			{`DELETE FROM admin_audit_events WHERE admin_user_id = $1::uuid`, userID},
			{`DELETE FROM announcements WHERE created_by = $1::uuid`, userID},
			{`DELETE FROM workspace_deletion_requests WHERE requested_by = $1::uuid OR organization_name = 'Lifecycle Co'`, userID},
			{`DELETE FROM retention_runs WHERE organization_id = $1::uuid`, orgID},
			{`DELETE FROM organizations WHERE id = $1::uuid`, orgID},
			{`DELETE FROM users WHERE id = $1::uuid`, userID},
		} {
			if _, err := pool.Exec(ctx, step.sql, step.id); err != nil {
				t.Errorf("cleanup %q: %v", step.sql, err)
			}
		}
	})
	if _, err := pool.Exec(ctx, `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1::uuid, $2::uuid, 'owner')`, orgID, userID); err != nil {
		t.Fatal(err)
	}
	// An envelope with a document (and its signed copy) finished at a given age.
	newEnvelope := func(title, status string, finishedMonthsAgo int) (envelopeID, docID, key, signedKey string) {
		t.Helper()
		if err := pool.QueryRow(ctx, `INSERT INTO envelopes (organization_id, created_by, title, status, completed_at, updated_at)
VALUES ($1::uuid, $2::uuid, $3, $4::envelope_status, now() - make_interval(months => $5), now() - make_interval(months => $5)) RETURNING id::text`,
			orgID, userID, title, status, finishedMonthsAgo).Scan(&envelopeID); err != nil {
			t.Fatal(err)
		}
		key, signedKey = orgID+"/"+envelopeID+"/doc.pdf", orgID+"/"+envelopeID+"/doc-signed.pdf"
		if err := pool.QueryRow(ctx, `INSERT INTO documents (envelope_id, filename, object_key, completed_object_key, size_bytes, sha256) VALUES ($1::uuid, 'contract.pdf', $2, $3, 9, 'test') RETURNING id::text`,
			envelopeID, key, signedKey).Scan(&docID); err != nil {
			t.Fatal(err)
		}
		store.objects[key], store.objects[signedKey] = []byte("%PDF-orig"), []byte("%PDF-sign")
		return
	}
	actor := Actor{Admin: Admin{UserID: userID}, IPAddress: "127.0.0.1", UserAgent: "test"}

	// ---- Support access and opening documents ----
	envelopeID, docID, _, _ := newEnvelope("Recent contract", "completed", 1)
	if _, _, err := s.OpenDocument(ctx, actor, envelopeID, docID, false); !errors.Is(err, ErrNoSupportAccess) {
		t.Fatalf("OpenDocument without access = %v", err)
	}
	if _, err := supportaccess.Allow(ctx, pool, orgID, userID, 5, ""); !errors.Is(err, supportaccess.ErrDuration) {
		t.Fatalf("odd duration = %v", err)
	}
	if _, err := supportaccess.Allow(ctx, pool, orgID, userID, 24, "Ticket 51"); err != nil {
		t.Fatalf("Allow: %v", err)
	}
	stored, body, err := s.OpenDocument(ctx, actor, envelopeID, docID, false)
	if err != nil {
		t.Fatalf("OpenDocument: %v", err)
	}
	content, _ := io.ReadAll(body)
	body.Close()
	if string(content) != "%PDF-orig" || stored.Filename != "contract.pdf" {
		t.Fatalf("opened %q (%s)", content, stored.Filename)
	}
	var viewed int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM audit_events WHERE envelope_id = $1::uuid AND event_type = 'envelope.support_viewed' AND metadata->>'support' = 'true'`, envelopeID).Scan(&viewed); err != nil || viewed != 1 {
		t.Fatalf("customer-visible view events = %d, %v", viewed, err)
	}
	if err := supportaccess.Revoke(ctx, pool, orgID, userID); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if _, _, err := s.OpenDocument(ctx, actor, envelopeID, docID, false); !errors.Is(err, ErrNoSupportAccess) {
		t.Fatalf("OpenDocument after revoke = %v", err)
	}

	// ---- Announcements ----
	if _, err := s.SaveAnnouncement(ctx, actor, "", AnnouncementInput{Title: "", Severity: "info"}); err == nil {
		t.Fatal("announcement without a title accepted")
	}
	everyone, err := s.SaveAnnouncement(ctx, actor, "", AnnouncementInput{Title: "Maintenance tonight " + suffix, Severity: "warning"})
	if err != nil || everyone.State != "live" {
		t.Fatalf("SaveAnnouncement = %+v, %v", everyone, err)
	}
	premiumOnly, err := s.SaveAnnouncement(ctx, actor, "", AnnouncementInput{Title: "Premium news " + suffix, Severity: "info", Plans: []string{"premium"}})
	if err != nil {
		t.Fatal(err)
	}
	announcementIDs = append(announcementIDs, everyone.ID, premiumOnly.ID)
	shown, err := announcements.ForWorkspace(ctx, pool, orgID)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for _, a := range shown {
		seen[a.ID] = true
	}
	if !seen[everyone.ID] || seen[premiumOnly.ID] {
		t.Fatalf("free workspace sees %v (want the general one, not the premium one)", seen)
	}
	if err := s.EndAnnouncement(ctx, actor, everyone.ID); err != nil {
		t.Fatalf("EndAnnouncement: %v", err)
	}
	if shown, _ := announcements.ForWorkspace(ctx, pool, orgID); len(shown) != 0 && shown[0].ID == everyone.ID {
		t.Fatal("ended announcement still showing")
	}

	// ---- Export ----
	var zipped bytes.Buffer
	if err := life.WriteExport(ctx, orgID, &zipped); err != nil {
		t.Fatalf("WriteExport: %v", err)
	}
	archive, err := zip.NewReader(bytes.NewReader(zipped.Bytes()), int64(zipped.Len()))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range archive.File {
		names[f.Name] = true
	}
	if !names["workspace.json"] || !names["README.txt"] || len(archive.File) != 4 {
		t.Fatalf("export holds %v", names)
	}

	// ---- Retention ----
	oldID, _, oldKey, oldSigned := newEnvelope("Old contract", "completed", 5)
	activeID, _, activeKey, _ := newEnvelope("Old but in progress", "in_progress", 5)
	if _, err := pool.Exec(ctx, `INSERT INTO organization_settings (organization_id, section, config) VALUES ($1::uuid, 'retention', '{"autoDelete": true, "retentionMonths": 3, "legalHold": true}')`, orgID); err != nil {
		t.Fatal(err)
	}
	if _, err := life.RunRetention(ctx); err != nil {
		t.Fatal(err)
	}
	if !store.has(oldKey) {
		t.Fatal("legal hold didn't stop retention")
	}
	if _, err := pool.Exec(ctx, `UPDATE organization_settings SET config = '{"autoDelete": true, "retentionMonths": 3, "legalHold": false}' WHERE organization_id = $1::uuid AND section = 'retention'`, orgID); err != nil {
		t.Fatal(err)
	}
	if _, err := life.RunRetention(ctx); err != nil {
		t.Fatal(err)
	}
	var remaining []string
	rows, _ := pool.Query(ctx, `SELECT id::text FROM envelopes WHERE organization_id = $1::uuid`, orgID)
	for rows.Next() {
		var id string
		_ = rows.Scan(&id)
		remaining = append(remaining, id)
	}
	rows.Close()
	joined := strings.Join(remaining, ",")
	if strings.Contains(joined, oldID) || !strings.Contains(joined, activeID) || !strings.Contains(joined, envelopeID) || len(remaining) != 2 {
		t.Fatalf("after retention: %v (old %s should be gone; recent and in-progress kept)", remaining, oldID)
	}
	if store.has(oldKey) || store.has(oldSigned) || !store.has(activeKey) {
		t.Fatal("retention deleted the wrong files")
	}
	detail, err := s.GetWorkspace(ctx, orgID)
	if err != nil || !detail.Privacy.Retention.Active || len(detail.Privacy.Retention.Runs) == 0 || detail.Privacy.Retention.Runs[0].EnvelopesDeleted != 1 {
		t.Fatalf("workspace privacy = %+v, %v", detail.Privacy, err)
	}

	// Deleting the workspace detaches its retention rows, so clean them up while they still point at it.
	if _, err := pool.Exec(ctx, `DELETE FROM retention_runs WHERE organization_id = $1::uuid`, orgID); err != nil {
		t.Fatal(err)
	}

	// ---- Workspace deletion ----
	if _, err := pool.Exec(ctx, `UPDATE organization_settings SET config = config || '{"legalHold": true}' WHERE organization_id = $1::uuid AND section = 'retention'`, orgID); err != nil {
		t.Fatal(err)
	}
	if _, err := life.RequestDeletion(ctx, orgID, userID, "lifecycle@example.com"); !errors.Is(err, lifecycle.ErrLegalHold) {
		t.Fatalf("deletion under legal hold = %v", err)
	}
	if _, err := pool.Exec(ctx, `UPDATE organization_settings SET config = config || '{"legalHold": false}' WHERE organization_id = $1::uuid AND section = 'retention'`, orgID); err != nil {
		t.Fatal(err)
	}
	request, err := life.RequestDeletion(ctx, orgID, userID, "lifecycle@example.com")
	if err != nil || request.ScheduledFor.Before(time.Now().Add(29*24*time.Hour)) {
		t.Fatalf("RequestDeletion = %+v, %v", request, err)
	}
	if _, err := life.RequestDeletion(ctx, orgID, userID, "lifecycle@example.com"); !errors.Is(err, lifecycle.ErrAlreadyScheduled) {
		t.Fatalf("second request = %v", err)
	}
	if n, err := life.RunDueDeletions(ctx); err != nil || n != 0 {
		t.Fatalf("not-yet-due deletion ran: %d, %v", n, err)
	}
	if _, err := s.CancelDeletion(ctx, actor, request.ID, "owner changed their mind"); err != nil {
		t.Fatalf("CancelDeletion: %v", err)
	}
	request, err = life.RequestDeletion(ctx, orgID, userID, "lifecycle@example.com")
	if err != nil {
		t.Fatalf("request again: %v", err)
	}
	// Storage fails: nothing is deleted, the request is marked failed, and the run can be retried.
	store.failDelete = true
	if _, err := s.RunDeletionNow(ctx, actor, request.ID, "owner asked for it today"); err == nil {
		t.Fatal("deletion succeeded while storage was failing")
	}
	var exists bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM organizations WHERE id = $1::uuid)`, orgID).Scan(&exists); err != nil || !exists {
		t.Fatalf("workspace gone after a failed deletion: %v", err)
	}
	store.failDelete = false
	done, err := s.RunDeletionNow(ctx, actor, request.ID, "retry after storage recovered")
	if err != nil || done.Status != "completed" || done.EnvelopesDeleted == nil || *done.EnvelopesDeleted != 2 || done.OrganizationID != nil {
		t.Fatalf("RunDeletionNow = %+v, %v", done, err)
	}
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM organizations WHERE id = $1::uuid)`, orgID).Scan(&exists); err != nil || exists {
		t.Fatalf("workspace still exists: %v", err)
	}
	if len(store.objects) != 0 {
		t.Fatalf("files left in storage: %v", store.objects)
	}
	if list, err := s.ListDeletions(ctx, "completed", Page{}); err != nil || list.Total == 0 {
		t.Fatalf("ListDeletions = %+v, %v", list, err)
	}
	_ = announcementIDs
}
