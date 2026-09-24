package email

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const resendAPIURL = "https://api.resend.com/emails"

type ResendMailer struct {
	apiKey     string
	from       string
	baseURL    string
	httpClient *http.Client
}

func NewResend(apiKey, from string) *ResendMailer {
	if from == "" {
		from = "Signing Platform <noreply@localhost>"
	}
	return &ResendMailer{
		apiKey:     apiKey,
		from:       from,
		baseURL:    resendAPIURL,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

type resendRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	Text    string   `json:"text,omitempty"`
	HTML    string   `json:"html,omitempty"`
}

type resendResponse struct {
	ID string `json:"id"`
}

type resendError struct {
	Message string `json:"message"`
	Name    string `json:"name"`
}

func (r *ResendMailer) Send(ctx context.Context, message Message) (Result, error) {
	if r.apiKey == "" {
		return Result{}, fmt.Errorf("resend: missing API key")
	}

	payload, err := json.Marshal(resendRequest{
		From:    r.from,
		To:      []string{message.To},
		Subject: message.Subject,
		Text:    message.Text,
		HTML:    message.HTML,
	})
	if err != nil {
		return Result{}, fmt.Errorf("resend: encode request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.baseURL, bytes.NewReader(payload))
	if err != nil {
		return Result{}, fmt.Errorf("resend: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("resend: send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return Result{}, fmt.Errorf("resend: read response: %w", err)
	}

	if resp.StatusCode >= 300 {
		var apiErr resendError
		_ = json.Unmarshal(body, &apiErr)
		if apiErr.Message != "" {
			return Result{}, fmt.Errorf("resend: %s (%s)", apiErr.Message, resp.Status)
		}
		return Result{}, fmt.Errorf("resend: unexpected status %s", resp.Status)
	}

	var parsed resendResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Result{}, fmt.Errorf("resend: decode response: %w", err)
	}

	return Result{Provider: "resend", MessageID: parsed.ID}, nil
}
