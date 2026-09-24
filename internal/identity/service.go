package identity

import (
	"context"
	"fmt"
	"strings"
	"time"
)

type contextKey struct{}

func SessionFromContext(ctx context.Context) (Session, bool) {
	session, ok := ctx.Value(contextKey{}).(Session)
	return session, ok
}

type ProviderUser struct {
	Subject       string
	Email         string
	Name          string
	EmailVerified bool
}

type ProviderOrganization struct {
	Subject  string
	Name     string
	Role     string
	Personal bool
}

type Workspace struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Role string `json:"role"`
}

type Session struct {
	User      User      `json:"user"`
	Workspace Workspace `json:"workspace"`
}

type User struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	Name            string     `json:"name"`
	EmailVerifiedAt *time.Time `json:"emailVerifiedAt,omitempty"`
	Provider        string     `json:"provider"`
	ProviderSubject string     `json:"-"`
	AvatarDataURL   string     `json:"avatarDataUrl,omitempty"`
}

type Directory interface {
	GetUser(context.Context, string) (ProviderUser, error)
	GetOrganization(context.Context, string) (ProviderOrganization, error)
}

type Store interface {
	Upsert(context.Context, string, ProviderUser, ProviderOrganization) (Session, error)
	UpdateProfile(context.Context, string, string, *string) (User, error)
}

func (s *Service) UpdateProfile(ctx context.Context, userID, name string, avatarDataURL *string) (User, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 100 {
		return User{}, fmt.Errorf("name must be between 1 and 100 characters")
	}
	if avatarDataURL != nil && *avatarDataURL != "" {
		validType := strings.HasPrefix(*avatarDataURL, "data:image/png;base64,") || strings.HasPrefix(*avatarDataURL, "data:image/jpeg;base64,") || strings.HasPrefix(*avatarDataURL, "data:image/webp;base64,")
		if len(*avatarDataURL) > 2_800_000 || !validType {
			return User{}, fmt.Errorf("profile photo must be a PNG, JPEG, or WebP image under 2 MB")
		}
	}
	return s.store.UpdateProfile(ctx, userID, name, avatarDataURL)
}

type Service struct {
	directory Directory
	store     Store
}

func NewService(directory Directory, store Store) *Service {
	return &Service{directory: directory, store: store}
}

func (s *Service) Sync(ctx context.Context, subject, organizationSubject, role string) (Session, error) {
	if strings.TrimSpace(subject) == "" {
		return Session{}, fmt.Errorf("subject is required")
	}
	providerUser, err := s.directory.GetUser(ctx, subject)
	if err != nil {
		return Session{}, fmt.Errorf("retrieve WorkOS user: %w", err)
	}
	if providerUser.Subject != subject || strings.TrimSpace(providerUser.Email) == "" {
		return Session{}, fmt.Errorf("WorkOS user response did not match authenticated subject")
	}
	providerUser.Email = strings.ToLower(strings.TrimSpace(providerUser.Email))
	providerUser.Name = strings.TrimSpace(providerUser.Name)
	if providerUser.Name == "" {
		providerUser.Name = providerUser.Email
	}
	var organization ProviderOrganization
	if organizationSubject == "" {
		organization = ProviderOrganization{Subject: "personal:" + subject, Name: providerUser.Name + "'s Workspace", Role: "owner", Personal: true}
	} else {
		organization, err = s.directory.GetOrganization(ctx, organizationSubject)
		if err != nil {
			return Session{}, fmt.Errorf("retrieve WorkOS organization: %w", err)
		}
		if organization.Subject != organizationSubject {
			return Session{}, fmt.Errorf("WorkOS organization response did not match session")
		}
		organization.Role = localRole(role)
	}
	return s.store.Upsert(ctx, "workos", providerUser, organization)
}

func localRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "owner":
		return "owner"
	case "admin":
		return "admin"
	default:
		return "member"
	}
}
