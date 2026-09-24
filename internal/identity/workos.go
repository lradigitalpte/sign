package identity

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type WorkOSDirectory struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

func NewWorkOSDirectory(apiKey string) (*WorkOSDirectory, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("WORKOS_API_KEY is required")
	}
	return &WorkOSDirectory{apiKey: apiKey, baseURL: "https://api.workos.com", client: &http.Client{Timeout: 5 * time.Second}}, nil
}

func (d *WorkOSDirectory) GetUser(ctx context.Context, subject string) (ProviderUser, error) {
	endpoint := d.baseURL + "/user_management/users/" + url.PathEscape(subject)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ProviderUser{}, err
	}
	request.Header.Set("Authorization", "Bearer "+d.apiKey)
	response, err := d.client.Do(request)
	if err != nil {
		return ProviderUser{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ProviderUser{}, fmt.Errorf("WorkOS returned %s", response.Status)
	}
	var user struct {
		ID            string `json:"id"`
		Email         string `json:"email"`
		Name          string `json:"name"`
		FirstName     string `json:"first_name"`
		LastName      string `json:"last_name"`
		EmailVerified bool   `json:"email_verified"`
	}
	if err := json.NewDecoder(response.Body).Decode(&user); err != nil {
		return ProviderUser{}, err
	}
	name := strings.TrimSpace(user.Name)
	if name == "" {
		name = strings.TrimSpace(user.FirstName + " " + user.LastName)
	}
	return ProviderUser{Subject: user.ID, Email: user.Email, Name: name, EmailVerified: user.EmailVerified}, nil
}

func (d *WorkOSDirectory) GetOrganization(ctx context.Context, subject string) (ProviderOrganization, error) {
	endpoint := d.baseURL + "/organizations/" + url.PathEscape(subject)
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ProviderOrganization{}, err
	}
	request.Header.Set("Authorization", "Bearer "+d.apiKey)
	response, err := d.client.Do(request)
	if err != nil {
		return ProviderOrganization{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return ProviderOrganization{}, fmt.Errorf("WorkOS returned %s", response.Status)
	}
	var organization struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	if err := json.NewDecoder(response.Body).Decode(&organization); err != nil {
		return ProviderOrganization{}, err
	}
	return ProviderOrganization{Subject: organization.ID, Name: strings.TrimSpace(organization.Name)}, nil
}
