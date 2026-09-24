package email

import (
	"context"
	"fmt"
	"html"
	"strings"
	"time"
)

type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

type Result struct {
	Provider  string
	MessageID string
}

type Mailer interface {
	Send(context.Context, Message) (Result, error)
}

// Branding carries the sending organization's identity into recipient-facing emails.
type Branding struct {
	LogoDataURL          string
	BrandName            string
	PrimaryColor         string
	HidePlatformBranding bool
}

func (b Branding) displayName() string {
	name := strings.TrimSpace(b.BrandName)
	if name == "" {
		name = "Secure Sign"
	}
	return name
}

func (b Branding) accentColor() string {
	color := strings.TrimSpace(b.PrimaryColor)
	if !strings.HasPrefix(color, "#") || (len(color) != 4 && len(color) != 7) {
		return "#2563eb"
	}
	return color
}

type InvitationOptions struct {
	CustomSubject  string
	CustomBody     string
	RecipientRole  string
	PrivateMessage string
}

// emailShell wraps a body fragment in a styled, table-based HTML layout for broad email-client
// compatibility: a centered card with the sender's branding in the header and a small
// "Powered by" credit in the footer (unless the organization has hidden it).
func emailShell(branding Branding, bodyHTML string) string {
	var header string
	if strings.HasPrefix(branding.LogoDataURL, "data:image/") {
		header = fmt.Sprintf(`<img src="%s" alt="%s" height="36" style="height:36px;max-width:220px;object-fit:contain;">`,
			html.EscapeString(branding.LogoDataURL), html.EscapeString(branding.displayName()))
	} else {
		header = fmt.Sprintf(`<span style="font-size:18px;font-weight:700;color:#111827;">%s</span>`, html.EscapeString(branding.displayName()))
	}

	footer := ""
	if !branding.HidePlatformBranding {
		footer = `<tr><td align="center" style="padding:20px 32px 0;">
			<p style="margin:0;font-size:11px;color:#9ca3af;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Powered by Secure Sign</p>
		</td></tr>`
	}

	return fmt.Sprintf(`<!doctype html>
<html>
<body style="margin:0;padding:32px 16px;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%%;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
<tr><td align="center" style="padding:28px 32px 20px;border-bottom:1px solid #f0f0f2;">%s</td></tr>
<tr><td style="padding:28px 32px;">%s</td></tr>
%s
</table>
</td></tr></table>
</body>
</html>`, header, bodyHTML, footer)
}

func emailButton(label, url, accent string) string {
	return fmt.Sprintf(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0;"><tr><td align="center" style="border-radius:10px;background:%s;">
		<a href="%s" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">%s</a>
	</td></tr></table>`, accent, html.EscapeString(url), html.EscapeString(label))
}

func Invitation(to, name, title, url string, expires time.Time, opts InvitationOptions, branding Branding) Message {
	safeName := strings.TrimSpace(name)
	if safeName == "" {
		safeName = "there"
	}
	safeTitle := strings.TrimSpace(title)
	if safeTitle == "" {
		safeTitle = "a document"
	}
	expiry := expires.UTC().Format(time.RFC1123)
	action := "signature"
	linkLabel := "Review and sign"
	if opts.RecipientRole == "approver" {
		action = "approval"
		linkLabel = "Review and approve"
	}
	intro := fmt.Sprintf("%s is ready for your %s.", safeTitle, action)
	if body := strings.TrimSpace(opts.CustomBody); body != "" {
		intro = body
	}
	privateNote := ""
	privateHTML := ""
	if note := strings.TrimSpace(opts.PrivateMessage); note != "" {
		privateNote = fmt.Sprintf("\n\nPrivate message from the sender:\n%s\n", note)
		privateHTML = fmt.Sprintf(`<p style="margin:0 0 16px;padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:13px;color:#374151;"><strong>Private message from the sender:</strong><br>%s</p>`, html.EscapeString(note))
	}
	text := fmt.Sprintf("Hi %s,\n\n%s%s\n\nOpen this secure link to continue:\n%s\n\nThis link expires on %s.\n", safeName, intro, privateNote, url, expiry)
	bodyHTML := fmt.Sprintf(
		`<p style="margin:0 0 12px;font-size:15px;color:#111827;">Hi %s,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;">%s</p>%s%s<p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This link expires on %s.</p>`,
		html.EscapeString(safeName), html.EscapeString(intro), privateHTML, emailButton(linkLabel, url, branding.accentColor()), html.EscapeString(expiry),
	)
	subject := strings.TrimSpace(opts.CustomSubject)
	if subject == "" {
		subject = safeTitle + " is ready for your " + action
	}
	return Message{To: to, Subject: subject, Text: text, HTML: emailShell(branding, bodyHTML)}
}

func Reminder(to, name, title, url string, expires time.Time, role string, branding Branding) Message {
	safeName := strings.TrimSpace(name)
	if safeName == "" {
		safeName = "there"
	}
	safeTitle := strings.TrimSpace(title)
	if safeTitle == "" {
		safeTitle = "a document"
	}
	expiry := expires.UTC().Format(time.RFC1123)
	action := "signature"
	linkLabel := "Review and sign"
	if role == "approver" {
		action = "approval"
		linkLabel = "Review and approve"
	}
	text := fmt.Sprintf("Hi %s,\n\nThis is a reminder that %s is still waiting for your %s.\n\nOpen this secure link to continue:\n%s\n\nThis link expires on %s.\n", safeName, safeTitle, action, url, expiry)
	bodyHTML := fmt.Sprintf(
		`<p style="margin:0 0 12px;font-size:15px;color:#111827;">Hi %s,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;">This is a reminder that <strong>%s</strong> is still waiting for your %s.</p>%s<p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This link expires on %s.</p>`,
		html.EscapeString(safeName), html.EscapeString(safeTitle), action, emailButton(linkLabel, url, branding.accentColor()), html.EscapeString(expiry),
	)
	return Message{
		To:      to,
		Subject: "Reminder: " + safeTitle + " is waiting for your " + action,
		Text:    text,
		HTML:    emailShell(branding, bodyHTML),
	}
}

func Completion(to, name, title, url string, branding Branding) Message {
	safeName := strings.TrimSpace(name)
	if safeName == "" {
		safeName = "there"
	}
	safeTitle := strings.TrimSpace(title)
	if safeTitle == "" {
		safeTitle = "a document"
	}
	text := fmt.Sprintf("Hi %s,\n\n%s has been completed. All required parties have finished signing.\n\nDownload the completed document securely:\n%s\n", safeName, safeTitle, url)
	bodyHTML := fmt.Sprintf(
		`<p style="margin:0 0 12px;font-size:15px;color:#111827;">Hi %s,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;"><strong>%s</strong> has been completed. All required parties have finished signing.</p>%s`,
		html.EscapeString(safeName), html.EscapeString(safeTitle), emailButton("Download completed document", url, branding.accentColor()),
	)
	return Message{
		To:      to,
		Subject: safeTitle + " has been completed",
		Text:    text,
		HTML:    emailShell(branding, bodyHTML),
	}
}
