package email

import (
	"context"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

type SMTPMailer struct {
	host string
	port int
	from string
}

func NewSMTP(host string, port int, from string) *SMTPMailer {
	if port == 0 {
		port = 1025
	}
	if from == "" {
		from = "Signing Platform <noreply@localhost>"
	}
	return &SMTPMailer{host: host, port: port, from: from}
}

func (s *SMTPMailer) Send(_ context.Context, message Message) (Result, error) {
	addr := net.JoinHostPort(s.host, fmt.Sprintf("%d", s.port))
	from := s.from
	payload := []byte("From: " + from + "\r\n" +
		"To: " + message.To + "\r\n" +
		"Subject: " + sanitizeHeader(message.Subject) + "\r\n" +
		"MIME-Version: 1.0\r\n" +
		"Content-Type: text/plain; charset=UTF-8\r\n" +
		"\r\n" +
		message.Text)
	if err := smtp.SendMail(addr, nil, envelopeAddress(from), []string{message.To}, payload); err != nil {
		return Result{}, err
	}
	return Result{Provider: "smtp", MessageID: addr}, nil
}

func sanitizeHeader(value string) string {
	return strings.Map(func(r rune) rune {
		if r == '\r' || r == '\n' {
			return -1
		}
		return r
	}, value)
}

func envelopeAddress(from string) string {
	start := strings.LastIndex(from, "<")
	end := strings.LastIndex(from, ">")
	if start >= 0 && end > start {
		return from[start+1 : end]
	}
	return from
}
