package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const resendEndpoint = "https://api.resend.com/emails"

// resendTransport delivers email via the Resend HTTP API (POST /emails).
//
// Security: the API key travels only in the Authorization header of the
// outbound request — it is never logged. The response body is read only to
// surface a bounded, non-sensitive error message; it is never logged wholesale.
type resendTransport struct {
	apiKey string
	client *http.Client
}

func (t *resendTransport) configured() bool {
	return t.apiKey != ""
}

// resendPayload is the JSON body for POST /emails. Field names match the Resend
// API (reply_to is snake_case).
type resendPayload struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
	Text    string   `json:"text,omitempty"`
	ReplyTo string   `json:"reply_to,omitempty"`
}

func (t *resendTransport) send(m message) error {
	body, err := json.Marshal(resendPayload{
		From:    fmt.Sprintf("%s <%s>", m.fromName, m.fromAddr),
		To:      []string{m.to},
		Subject: m.subject,
		HTML:    m.html,
		Text:    m.text,
		ReplyTo: m.replyTo,
	})
	if err != nil {
		return fmt.Errorf("marshal resend payload: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, resendEndpoint, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build resend request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+t.apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := t.client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("resend request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode/100 != 2 {
		// Surface only Resend's structured error message (safe — no secrets),
		// bounded in size. Never return/log the raw API key or auth header.
		var er struct {
			Message string `json:"message"`
			Name    string `json:"name"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 2048)).Decode(&er)
		if er.Message != "" {
			return fmt.Errorf("resend status %d: %s", resp.StatusCode, er.Message)
		}
		return fmt.Errorf("resend status %d", resp.StatusCode)
	}

	// Drain the success body (contains only a non-sensitive email id) so the
	// connection can be reused; do not log it.
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 2048))
	return nil
}
