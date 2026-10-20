package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// ErrNoDirectoryAdmin means the directory can't make changes (only the WorkOS directory can).
var ErrNoDirectoryAdmin = errors.New("renaming and deleting in WorkOS isn't available")

// DirectoryAdmin makes the changes Signet staff ask for in WorkOS itself.
type DirectoryAdmin interface {
	RenameOrganization(ctx context.Context, subject, name string) error
	DeleteUser(ctx context.Context, subject string) error
}

// RenameOrganization renames a WorkOS organization, so the new name survives the next sign-in sync.
func (d *WorkOSDirectory) RenameOrganization(ctx context.Context, subject, name string) error {
	body, err := json.Marshal(map[string]string{"name": name})
	if err != nil {
		return err
	}
	return d.send(ctx, http.MethodPut, "/organizations/"+url.PathEscape(subject), body)
}

// DeleteUser removes a WorkOS user, ending their sign-in. A user who no longer exists counts as deleted.
func (d *WorkOSDirectory) DeleteUser(ctx context.Context, subject string) error {
	err := d.send(ctx, http.MethodDelete, "/user_management/users/"+url.PathEscape(subject), nil)
	var status statusError
	if errors.As(err, &status) && status == http.StatusNotFound {
		return nil
	}
	return err
}

type statusError int

func (e statusError) Error() string {
	return fmt.Sprintf("WorkOS returned %d %s", int(e), http.StatusText(int(e)))
}

func (d *WorkOSDirectory) send(ctx context.Context, method, path string, body []byte) error {
	request, err := http.NewRequestWithContext(ctx, method, d.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+d.apiKey)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := d.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode >= 300 {
		return statusError(response.StatusCode)
	}
	return nil
}

// Admin returns the directory's admin operations, or ErrNoDirectoryAdmin when it has none.
func (s *Service) Admin() (DirectoryAdmin, error) {
	admin, ok := s.directory.(DirectoryAdmin)
	if !ok {
		return nil, ErrNoDirectoryAdmin
	}
	return admin, nil
}

// IsPersonalSubject reports whether an organization subject is a personal workspace rather than a WorkOS organization.
func IsPersonalSubject(subject string) bool { return strings.HasPrefix(subject, "personal:") }
