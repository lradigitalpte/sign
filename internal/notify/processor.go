package notify

import (
	"context"
	"errors"
	"log/slog"
	"net/url"
	"strings"
	"time"

	"signing-platform/internal/email"
	"signing-platform/internal/securetoken"
)

type Store interface {
	Claim(context.Context) (Job, bool, error)
	LoadInvitation(context.Context, Job) (Invitation, error)
	MarkSent(context.Context, Job, string, string) error
	MarkFailed(context.Context, Job, error, time.Time) error
}

type Processor struct {
	store     Store
	mailer    email.Mailer
	protector *securetoken.Protector
	origin    string
	logger    *slog.Logger
}

func NewProcessor(store Store, mailer email.Mailer, protector *securetoken.Protector, origin string, logger *slog.Logger) *Processor {
	if logger == nil {
		logger = slog.Default()
	}
	return &Processor{store: store, mailer: mailer, protector: protector, origin: strings.TrimRight(origin, "/"), logger: logger}
}

func (p *Processor) ProcessOne(ctx context.Context) (bool, error) {
	job, ok, err := p.store.Claim(ctx)
	if err != nil || !ok {
		return false, err
	}

	sendErr := p.deliver(ctx, job)
	if sendErr == nil {
		return true, nil
	}
	retryAt := time.Now().UTC().Add(Backoff(job.Attempts))
	if !Retryable(sendErr, job.Attempts) {
		retryAt = time.Now().UTC().Add(100 * 365 * 24 * time.Hour)
	}
	if err := p.store.MarkFailed(ctx, job, sendErr, retryAt); err != nil {
		return true, err
	}
	p.logger.Error("notification delivery failed", "jobId", job.ID, "envelopeId", job.EnvelopeID, "recipientId", job.RecipientID, "kind", job.Kind, "attempt", job.Attempts)
	return true, nil
}

func (p *Processor) deliver(ctx context.Context, job Job) error {
	invitation, err := p.store.LoadInvitation(ctx, job)
	if err != nil {
		return err
	}
	message, err := p.messageFor(job, invitation)
	if err != nil {
		return err
	}
	result, err := p.mailer.Send(ctx, message)
	if err != nil {
		return err
	}
	return p.store.MarkSent(ctx, job, result.Provider, result.MessageID)
}

func invitationOptions(invitation Invitation) email.InvitationOptions {
	opts := email.InvitationOptions{RecipientRole: invitation.RecipientRole}
	if invitation.EmailSubject != nil {
		opts.CustomSubject = *invitation.EmailSubject
	}
	if invitation.EmailBody != nil {
		opts.CustomBody = *invitation.EmailBody
	}
	if invitation.PrivateMessage != nil {
		opts.PrivateMessage = *invitation.PrivateMessage
	}
	return opts
}

func (p *Processor) messageFor(job Job, invitation Invitation) (email.Message, error) {
	switch jobKind(job.Kind) {
	case "completion":
		raw, err := p.protector.Decrypt(job.TokenCiphertext)
		if err != nil {
			return email.Message{}, errors.Join(ErrPermanent, err)
		}
		link := p.origin + "/sign/" + url.PathEscape(string(raw)) + "/completed"
		return email.Completion(invitation.RecipientEmail, invitation.RecipientName, invitation.EnvelopeTitle, link, invitation.Branding), nil
	case "reminder":
		raw, err := p.protector.Decrypt(job.TokenCiphertext)
		if err != nil {
			return email.Message{}, errors.Join(ErrPermanent, err)
		}
		link := p.origin + "/sign/" + url.PathEscape(string(raw))
		return email.Reminder(invitation.RecipientEmail, invitation.RecipientName, invitation.EnvelopeTitle, link, invitation.ExpiresAt, invitation.RecipientRole, invitation.Branding), nil
	default:
		raw, err := p.protector.Decrypt(job.TokenCiphertext)
		if err != nil {
			return email.Message{}, errors.Join(ErrPermanent, err)
		}
		link := p.origin + "/sign/" + url.PathEscape(string(raw))
		return email.Invitation(invitation.RecipientEmail, invitation.RecipientName, invitation.EnvelopeTitle, link, invitation.ExpiresAt, invitationOptions(invitation), invitation.Branding), nil
	}
}

func (p *Processor) Run(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		for {
			processed, err := p.ProcessOne(ctx)
			if err != nil {
				p.logger.Error("invitation worker", "error", err)
				break
			}
			if !processed {
				break
			}
		}
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
	}
}
