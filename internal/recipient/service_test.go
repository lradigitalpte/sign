package recipient

import (
	"context"
	"testing"
)

type fakeStore struct {
	created    CreateInput
	updated    UpdateInput
	isTemplate bool
}

func (f *fakeStore) List(context.Context, string, string) ([]Recipient, error) {
	return []Recipient{}, nil
}
func (f *fakeStore) Create(_ context.Context, _, _ string, i CreateInput) (Recipient, error) {
	f.created = i
	return Recipient{ID: "recipient", Email: i.Email, Role: i.Role}, nil
}
func (f *fakeStore) Update(_ context.Context, _, _, _ string, i UpdateInput) (Recipient, error) {
	f.updated = i
	return Recipient{ID: "recipient"}, nil
}
func (f *fakeStore) Delete(context.Context, string, string, string) error { return nil }
func (f *fakeStore) IsTemplate(context.Context, string, string) (bool, error) {
	return f.isTemplate, nil
}
func TestCreateNormalizesRecipient(t *testing.T) {
	store := &fakeStore{}
	value, err := NewService(store).Create(context.Background(), "org", "env", CreateInput{Name: " Morgan ", Email: " MORGAN@example.com "})
	if err != nil {
		t.Fatal(err)
	}
	if value.Email != "morgan@example.com" || store.created.Name != "Morgan" || store.created.Role != "signer" {
		t.Fatalf("unexpected recipient %#v %#v", value, store.created)
	}
}
func TestCreateRejectsInvalidRole(t *testing.T) {
	_, err := NewService(&fakeStore{}).Create(context.Background(), "org", "env", CreateInput{Name: "Morgan", Email: "morgan@example.com", Role: "owner"})
	if err == nil {
		t.Fatal("expected invalid role")
	}
}
func TestUpdateRejectsInvalidOrder(t *testing.T) {
	zero := 0
	_, err := NewService(&fakeStore{}).Update(context.Background(), "org", "env", "id", UpdateInput{SigningOrder: &zero})
	if err == nil {
		t.Fatal("expected invalid order")
	}
}
func TestCreateRejectsBlankEmailOnRegularEnvelope(t *testing.T) {
	_, err := NewService(&fakeStore{isTemplate: false}).Create(context.Background(), "org", "env", CreateInput{Name: "Signer 1", Email: ""})
	if err == nil {
		t.Fatal("expected blank email to be rejected on a non-template envelope")
	}
}
func TestCreateAllowsBlankEmailOnTemplate(t *testing.T) {
	store := &fakeStore{isTemplate: true}
	value, err := NewService(store).Create(context.Background(), "org", "env", CreateInput{Name: "Signer 1", Email: ""})
	if err != nil {
		t.Fatal(err)
	}
	if value.Email != "" || store.created.Name != "Signer 1" {
		t.Fatalf("unexpected placeholder recipient %#v", value)
	}
}
func TestUpdateAllowsBlankingEmailOnTemplate(t *testing.T) {
	store := &fakeStore{isTemplate: true}
	empty := ""
	_, err := NewService(store).Update(context.Background(), "org", "env", "id", UpdateInput{Email: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if store.updated.Email == nil || *store.updated.Email != "" {
		t.Fatalf("expected blank email to pass through, got %#v", store.updated.Email)
	}
}
