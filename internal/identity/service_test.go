package identity

import (
	"context"
	"errors"
	"testing"
)

type fakeDirectory struct {
	user         ProviderUser
	organization ProviderOrganization
	err          error
}

func (f fakeDirectory) GetUser(context.Context, string) (ProviderUser, error) { return f.user, f.err }
func (f fakeDirectory) GetOrganization(context.Context, string) (ProviderOrganization, error) {
	return f.organization, f.err
}

type fakeStore struct {
	provider     string
	user         ProviderUser
	organization ProviderOrganization
}

func (f *fakeStore) Upsert(_ context.Context, provider string, user ProviderUser, organization ProviderOrganization) (Session, error) {
	f.provider, f.user, f.organization = provider, user, organization
	return Session{User: User{ID: "local-user", Email: user.Email, Name: user.Name, Provider: provider}, Workspace: Workspace{ID: "workspace", Name: organization.Name, Role: organization.Role}}, nil
}

func (f *fakeStore) UpdateProfile(_ context.Context, id, name string, avatar *string) (User, error) {
	return User{ID: id, Name: name}, nil
}

func TestServiceSyncNormalizesAndPersistsWorkOSUser(t *testing.T) {
	store := &fakeStore{}
	service := NewService(fakeDirectory{user: ProviderUser{Subject: "user_123", Email: " Person@Example.COM ", Name: " Person ", EmailVerified: true}}, store)
	current, err := service.Sync(context.Background(), "user_123", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if current.User.ID != "local-user" || store.provider != "workos" || store.user.Email != "person@example.com" || store.user.Name != "Person" || !store.organization.Personal || store.organization.Role != "owner" {
		t.Fatalf("unexpected sync result: %#v %#v", current, store.organization)
	}
}

func TestServiceSyncPersistsActiveOrganizationWithSafeRole(t *testing.T) {
	store := &fakeStore{}
	service := NewService(fakeDirectory{user: ProviderUser{Subject: "user_123", Email: "person@example.com", Name: "Person"}, organization: ProviderOrganization{Subject: "org_123", Name: "Acme"}}, store)
	current, err := service.Sync(context.Background(), "user_123", "org_123", "custom-role")
	if err != nil {
		t.Fatal(err)
	}
	if current.Workspace.Name != "Acme" || store.organization.Role != "member" || store.organization.Personal {
		t.Fatalf("unexpected organization: %#v", store.organization)
	}
}

func TestServiceSyncRejectsMismatchedSubject(t *testing.T) {
	service := NewService(fakeDirectory{user: ProviderUser{Subject: "different", Email: "person@example.com"}}, &fakeStore{})
	if _, err := service.Sync(context.Background(), "user_123", "", ""); err == nil {
		t.Fatal("expected subject mismatch error")
	}
}

func TestServiceSyncPropagatesDirectoryFailure(t *testing.T) {
	service := NewService(fakeDirectory{err: errors.New("unavailable")}, &fakeStore{})
	if _, err := service.Sync(context.Background(), "user_123", "", ""); err == nil {
		t.Fatal("expected directory error")
	}
}
