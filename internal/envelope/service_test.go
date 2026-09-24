package envelope

import (
	"context"
	"testing"
)

type fakeStore struct {
	created        CreateInput
	organizationID string
	userID         string
}

func (f *fakeStore) Create(_ context.Context, org, user string, input CreateInput) (Envelope, error) {
	f.organizationID, f.userID, f.created = org, user, input
	return Envelope{ID: "env", Title: input.Title}, nil
}
func (f *fakeStore) List(context.Context, string, ListFilter) ([]Envelope, error) {
	return []Envelope{}, nil
}
func (f *fakeStore) Get(context.Context, string, string) (Envelope, error) {
	return Envelope{}, ErrNotFound
}
func (f *fakeStore) Update(context.Context, string, string, UpdateInput) (Envelope, error) {
	return Envelope{}, ErrNotFound
}
func (f *fakeStore) MoveToFolder(context.Context, string, string, *string) (Envelope, error) {
	return Envelope{}, ErrNotFound
}
func (f *fakeStore) Delete(context.Context, string, string) error { return ErrNotFound }
func (f *fakeStore) Void(context.Context, string, string, string) (Envelope, error) {
	return Envelope{}, ErrNotFound
}
func (f *fakeStore) ListAudit(context.Context, string, string) ([]AuditEvent, error) {
	return nil, nil
}
func (f *fakeStore) BulkMoveToFolder(context.Context, string, []string, *string) (int64, error) {
	return 0, nil
}
func (f *fakeStore) BulkDelete(context.Context, string, []string) (int64, error) {
	return 0, nil
}
func (f *fakeStore) BulkVoid(context.Context, string, string, []string) (int64, error) {
	return 0, nil
}

func TestCreateDefaultsAndScopesEnvelope(t *testing.T) {
	store := &fakeStore{}
	service := NewService(store)
	value, err := service.Create(context.Background(), "org", "user", CreateInput{Title: " Agreement "})
	if err != nil {
		t.Fatal(err)
	}
	if value.Title != "Agreement" || store.organizationID != "org" || store.userID != "user" || store.created.Language != "en" || store.created.Timezone != "Etc/UTC" {
		t.Fatalf("unexpected create: %#v %#v", value, store.created)
	}
}

func TestCreateRejectsBlankTitle(t *testing.T) {
	if _, err := NewService(&fakeStore{}).Create(context.Background(), "org", "user", CreateInput{}); err == nil {
		t.Fatal("expected validation error")
	}
}
func TestListRejectsInvalidStatus(t *testing.T) {
	if _, err := NewService(&fakeStore{}).List(context.Background(), "org", ListFilter{Status: "unknown"}); err == nil {
		t.Fatal("expected validation error")
	}
}

func TestUpdateEnvelopeSettings(t *testing.T) {
	var updatedInput UpdateInput
	var updatedOrg, updatedID string
	store := &fakeStore{}
	// override Update
	service := &Service{
		store: &mockUpdateStore{
			fakeStore: store,
			onUpdate: func(ctx context.Context, org, id string, in UpdateInput) (Envelope, error) {
				updatedOrg = org
				updatedID = id
				updatedInput = in
				return Envelope{
					ID:                    id,
					Title:                 *in.Title,
					Language:              *in.Language,
					Timezone:              *in.Timezone,
					DateFormat:            *in.DateFormat,
					AllowedSignatureTypes: *in.AllowedSignatureTypes,
					ExternalID:            in.ExternalID,
					RedirectURL:           in.RedirectURL,
					AutoReminders:         *in.AutoReminders,
					FirstReminderDays:     *in.FirstReminderDays,
					RepeatReminderDays:    *in.RepeatReminderDays,
					NotifyOnView:          *in.NotifyOnView,
					NotifyOnSign:          *in.NotifyOnSign,
					AttachCompletedPDF:    *in.AttachCompletedPDF,
					SessionTimeoutMinutes: *in.SessionTimeoutMinutes,
					RequirePasscode:       *in.RequirePasscode,
				}, nil
			},
		},
	}

	title := " Updated Title "
	lang := "fr"
	tz := "Europe/Paris"
	df := "DD/MM/YYYY"
	sigType := "draw_only"
	extID := " CRM-12345 "
	redURL := " https://example.com/done "
	autoRem := true
	firstRem := 5
	repRem := 3
	notView := false
	notSign := true
	attachPdf := true
	timeout := 45
	reqPass := true
	pass := " secret123 "

	distMethod := "NONE"
	res, err := service.Update(context.Background(), "org-1", "env-1", UpdateInput{
		Title:                 &title,
		Language:              &lang,
		Timezone:              &tz,
		DateFormat:            &df,
		AllowedSignatureTypes: &sigType,
		DistributionMethod:    &distMethod,
		ExternalID:            &extID,
		RedirectURL:           &redURL,
		AutoReminders:         &autoRem,
		FirstReminderDays:     &firstRem,
		RepeatReminderDays:    &repRem,
		NotifyOnView:          &notView,
		NotifyOnSign:          &notSign,
		AttachCompletedPDF:    &attachPdf,
		SessionTimeoutMinutes: &timeout,
		RequirePasscode:       &reqPass,
		Passcode:              &pass,
	})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if updatedOrg != "org-1" || updatedID != "env-1" {
		t.Fatalf("unexpected org or id: %s %s", updatedOrg, updatedID)
	}
	if *updatedInput.Title != "Updated Title" {
		t.Fatalf("expected trimmed title, got %q", *updatedInput.Title)
	}
	if *updatedInput.ExternalID != "CRM-12345" {
		t.Fatalf("expected trimmed externalId, got %v", updatedInput.ExternalID)
	}
	if *updatedInput.RedirectURL != "https://example.com/done" {
		t.Fatalf("expected trimmed redirectUrl, got %v", updatedInput.RedirectURL)
	}
	if *updatedInput.AllowedSignatureTypes != "draw_only" {
		t.Fatalf("expected draw_only, got %s", *updatedInput.AllowedSignatureTypes)
	}
	if res.SessionTimeoutMinutes != 45 || !res.RequirePasscode || res.FirstReminderDays != 5 {
		t.Fatalf("unexpected envelope fields: %#v", res)
	}
}

func TestUpdateInvalidSignatureTypeDefaultsToTypeDrawUpload(t *testing.T) {
	var updatedInput UpdateInput
	service := &Service{
		store: &mockUpdateStore{
			fakeStore: &fakeStore{},
			onUpdate: func(ctx context.Context, org, id string, in UpdateInput) (Envelope, error) {
				updatedInput = in
				return Envelope{}, nil
			},
		},
	}

	invalidSig := "quantum_crypto"
	_, err := service.Update(context.Background(), "org-1", "env-1", UpdateInput{
		AllowedSignatureTypes: &invalidSig,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *updatedInput.AllowedSignatureTypes != "type_draw_upload" {
		t.Fatalf("expected fallback to type_draw_upload, got %q", *updatedInput.AllowedSignatureTypes)
	}
}

type mockUpdateStore struct {
	*fakeStore
	onUpdate func(ctx context.Context, org, id string, in UpdateInput) (Envelope, error)
}

func (m *mockUpdateStore) Update(ctx context.Context, org, id string, in UpdateInput) (Envelope, error) {
	if m.onUpdate != nil {
		return m.onUpdate(ctx, org, id, in)
	}
	return Envelope{}, nil
}

