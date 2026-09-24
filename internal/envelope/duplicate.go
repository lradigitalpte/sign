package envelope

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"signing-platform/internal/storage"
)

type Duplicator struct {
	db      *pgxpool.Pool
	objects storage.Resolver
}

func NewDuplicator(db *pgxpool.Pool, objects storage.Resolver) *Duplicator {
	return &Duplicator{db: db, objects: objects}
}

type sourceDocument struct {
	ID        string
	Position  int
	Filename  string
	ObjectKey string
	MimeType  string
	SizeBytes int64
	PageCount int
	SHA256    *string
}

type sourceRecipient struct {
	ID             string
	Name           string
	Email          string
	Role           string
	SigningOrder   int
	PrivateMessage *string
}

type sourceField struct {
	DocumentID  string
	RecipientID string
	Type        string
	Page        int
	X           float64
	Y           float64
	Width       float64
	Height      float64
	Label       *string
	Required    bool
}

func (d *Duplicator) Duplicate(ctx context.Context, organizationID, userID, sourceID string, asTemplate bool) (Envelope, error) {
	tx, err := d.db.Begin(ctx)
	if err != nil {
		return Envelope{}, err
	}
	defer tx.Rollback(ctx)

	source, err := scan(tx.QueryRow(ctx, `SELECT `+columns+` FROM envelopes WHERE id=$1::uuid AND organization_id=$2::uuid`, sourceID, organizationID))
	if err != nil {
		return Envelope{}, err
	}
	if source.Status == "voided" {
		return Envelope{}, ErrNotEditable
	}

	// Saving as a template, or instantiating a document from one, keeps the name as-is;
	// only a plain document-to-document duplicate reads as a "copy".
	title := "Copy of " + source.Title
	if asTemplate || source.IsTemplate {
		title = source.Title
	}
	duplicate, err := scan(tx.QueryRow(ctx, `INSERT INTO envelopes (
		organization_id, created_by, title, language, timezone, date_format,
		allowed_signature_types, distribution_method, external_id, redirect_url, email_subject, email_body,
		auto_reminders, first_reminder_days, repeat_reminder_days, notify_on_view, notify_on_sign,
		attach_completed_pdf, session_timeout_minutes, require_passcode, expires_at, is_template
	) VALUES (
		$1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
	) RETURNING `+columns,
		organizationID, userID, title, source.Language, source.Timezone, source.DateFormat,
		source.AllowedSignatureTypes, source.DistributionMethod, source.ExternalID, source.RedirectURL, source.EmailSubject, source.EmailBody,
		source.AutoReminders, source.FirstReminderDays, source.RepeatReminderDays, source.NotifyOnView, source.NotifyOnSign,
		source.AttachCompletedPDF, source.SessionTimeoutMinutes, source.RequirePasscode, source.ExpiresAt, asTemplate))
	if err != nil {
		return Envelope{}, err
	}

	docRows, err := tx.Query(ctx, `
SELECT id::text, position, filename, object_key, mime_type, size_bytes, page_count, sha256
FROM documents WHERE envelope_id=$1::uuid ORDER BY position`, sourceID)
	if err != nil {
		return Envelope{}, err
	}
	defer docRows.Close()

	documents := []sourceDocument{}
	for docRows.Next() {
		var document sourceDocument
		if err := docRows.Scan(&document.ID, &document.Position, &document.Filename, &document.ObjectKey, &document.MimeType, &document.SizeBytes, &document.PageCount, &document.SHA256); err != nil {
			return Envelope{}, err
		}
		documents = append(documents, document)
	}
	if err := docRows.Err(); err != nil {
		return Envelope{}, err
	}
	docRows.Close()

	documentMap := map[string]string{}
	store, err := d.objects.For(ctx, organizationID)
	if err != nil {
		return Envelope{}, err
	}
	for _, document := range documents {
		body, err := store.Get(ctx, document.ObjectKey)
		if err != nil {
			return Envelope{}, fmt.Errorf("load document %s: %w", document.Filename, err)
		}
		data, err := io.ReadAll(body)
		body.Close()
		if err != nil {
			return Envelope{}, err
		}
		key := organizationID + "/" + duplicate.ID + "/" + uuid.NewString() + ".pdf"
		if err := store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), document.MimeType); err != nil {
			return Envelope{}, fmt.Errorf("store document copy: %w", err)
		}
		var newID string
		err = tx.QueryRow(ctx, `
INSERT INTO documents(envelope_id, position, filename, object_key, mime_type, size_bytes, page_count, sha256)
VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`,
			duplicate.ID, document.Position, document.Filename, key, document.MimeType, document.SizeBytes, document.PageCount, document.SHA256,
		).Scan(&newID)
		if err != nil {
			_ = store.Delete(ctx, key)
			return Envelope{}, err
		}
		documentMap[document.ID] = newID
	}

	recipientRows, err := tx.Query(ctx, `
SELECT id::text, name, email, role::text, signing_order, private_message
FROM recipients WHERE envelope_id=$1::uuid ORDER BY signing_order, created_at`, sourceID)
	if err != nil {
		return Envelope{}, err
	}
	defer recipientRows.Close()

	recipients := []sourceRecipient{}
	for recipientRows.Next() {
		var recipient sourceRecipient
		if err := recipientRows.Scan(&recipient.ID, &recipient.Name, &recipient.Email, &recipient.Role, &recipient.SigningOrder, &recipient.PrivateMessage); err != nil {
			return Envelope{}, err
		}
		recipients = append(recipients, recipient)
	}
	if err := recipientRows.Err(); err != nil {
		return Envelope{}, err
	}
	recipientRows.Close()

	recipientMap := map[string]string{}
	for _, recipient := range recipients {
		// Saving as a template strips real recipient emails so the result is a clean set of
		// placeholder roles (e.g. "Customer") rather than baked-in people; using a template
		// copies those placeholders forward as-is, ready to be filled in per envelope.
		email := recipient.Email
		if asTemplate {
			email = ""
		}
		var newID string
		err = tx.QueryRow(ctx, `
INSERT INTO recipients(envelope_id, name, email, role, signing_order, private_message)
VALUES ($1::uuid,$2,$3,$4::recipient_role,$5,$6) RETURNING id::text`,
			duplicate.ID, recipient.Name, email, recipient.Role, recipient.SigningOrder, recipient.PrivateMessage,
		).Scan(&newID)
		if err != nil {
			return Envelope{}, err
		}
		recipientMap[recipient.ID] = newID
	}

	fieldRows, err := tx.Query(ctx, `
SELECT f.document_id::text, f.recipient_id::text, f.type::text, f.page, f.x::float8, f.y::float8, f.width::float8, f.height::float8, f.label, f.required
FROM document_fields f
JOIN documents d ON d.id = f.document_id
WHERE d.envelope_id=$1::uuid`, sourceID)
	if err != nil {
		return Envelope{}, err
	}
	defer fieldRows.Close()

	fields := []sourceField{}
	for fieldRows.Next() {
		var field sourceField
		if err := fieldRows.Scan(&field.DocumentID, &field.RecipientID, &field.Type, &field.Page, &field.X, &field.Y, &field.Width, &field.Height, &field.Label, &field.Required); err != nil {
			return Envelope{}, err
		}
		fields = append(fields, field)
	}
	if err := fieldRows.Err(); err != nil {
		return Envelope{}, err
	}
	fieldRows.Close()

	for _, field := range fields {
		newDocumentID := documentMap[field.DocumentID]
		newRecipientID := recipientMap[field.RecipientID]
		if newDocumentID == "" || newRecipientID == "" {
			continue
		}
		_, err = tx.Exec(ctx, `
INSERT INTO document_fields(document_id, recipient_id, type, page, x, y, width, height, label, required)
VALUES ($1::uuid,$2::uuid,$3::field_type,$4,$5,$6,$7,$8,$9,$10)`,
			newDocumentID, newRecipientID, field.Type, field.Page, field.X, field.Y, field.Width, field.Height, field.Label, field.Required,
		)
		if err != nil {
			return Envelope{}, err
		}
	}

	_, err = tx.Exec(ctx, `
INSERT INTO audit_events(envelope_id, actor_user_id, event_type, metadata)
VALUES ($1::uuid,$2::uuid,'envelope.duplicated', jsonb_build_object('sourceEnvelopeId', $3::text))`,
		duplicate.ID, userID, sourceID,
	)
	if err != nil {
		return Envelope{}, err
	}

	attachmentRows, err := tx.Query(ctx, `
SELECT kind, label, url, object_key, filename, mime_type, size_bytes, sha256, position
FROM envelope_attachments WHERE envelope_id=$1::uuid ORDER BY position`, sourceID)
	if err != nil {
		return Envelope{}, err
	}
	defer attachmentRows.Close()
	for attachmentRows.Next() {
		var kind, label string
		var url, objectKey, filename, mimeType, sha256 *string
		var sizeBytes *int64
		var position int
		if err := attachmentRows.Scan(&kind, &label, &url, &objectKey, &filename, &mimeType, &sizeBytes, &sha256, &position); err != nil {
			return Envelope{}, err
		}
		if kind == "link" && url != nil {
			_, err = tx.Exec(ctx, `INSERT INTO envelope_attachments(envelope_id,kind,label,url,position) VALUES ($1::uuid,'link',$2,$3,$4)`, duplicate.ID, label, *url, position)
		} else if kind == "file" && objectKey != nil && filename != nil && mimeType != nil && sizeBytes != nil {
			body, err := store.Get(ctx, *objectKey)
			if err != nil {
				return Envelope{}, fmt.Errorf("load attachment %s: %w", *filename, err)
			}
			data, err := io.ReadAll(body)
			body.Close()
			if err != nil {
				return Envelope{}, err
			}
			key := organizationID + "/" + duplicate.ID + "/attachments/" + uuid.NewString()
			if idx := strings.LastIndex(*filename, "."); idx >= 0 {
				key += strings.ToLower((*filename)[idx:])
			}
			if err := store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), *mimeType); err != nil {
				return Envelope{}, fmt.Errorf("store attachment copy: %w", err)
			}
			_, err = tx.Exec(ctx, `
INSERT INTO envelope_attachments(envelope_id,kind,label,object_key,filename,mime_type,size_bytes,sha256,position)
VALUES ($1::uuid,'file',$2,$3,$4,$5,$6,$7,$8)`, duplicate.ID, label, key, *filename, *mimeType, *sizeBytes, sha256, position)
		}
		if err != nil {
			return Envelope{}, err
		}
	}
	if err := attachmentRows.Err(); err != nil {
		return Envelope{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Envelope{}, err
	}
	return duplicate, nil
}
