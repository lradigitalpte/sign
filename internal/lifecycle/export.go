package lifecycle

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path"
	"regexp"
	"time"
)

// Export is workspace.json inside the export zip.
type Export struct {
	ExportedAt time.Time        `json:"exportedAt"`
	Workspace  ExportWorkspace  `json:"workspace"`
	Members    []ExportMember   `json:"members"`
	Envelopes  []ExportEnvelope `json:"envelopes"`
}

type ExportWorkspace struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type ExportMember struct {
	Name     string    `json:"name"`
	Email    string    `json:"email"`
	Role     string    `json:"role"`
	JoinedAt time.Time `json:"joinedAt"`
}

type ExportEnvelope struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	Status      string            `json:"status"`
	IsTemplate  bool              `json:"isTemplate"`
	SenderEmail string            `json:"senderEmail"`
	CreatedAt   time.Time         `json:"createdAt"`
	SentAt      *time.Time        `json:"sentAt"`
	CompletedAt *time.Time        `json:"completedAt"`
	ExpiresAt   *time.Time        `json:"expiresAt"`
	Recipients  []json.RawMessage `json:"recipients"`
	Documents   []ExportFile      `json:"documents"`
	Attachments []ExportFile      `json:"attachments"`
	AuditTrail  []json.RawMessage `json:"auditTrail"`
}

// ExportFile points at a file in the zip, or says why it isn't there.
type ExportFile struct {
	Filename   string `json:"filename"`
	Path       string `json:"path,omitempty"`
	SignedPath string `json:"signedPath,omitempty"`
	Missing    string `json:"missing,omitempty"`

	key       string
	signedKey string
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._ -]+`)

func safeName(name string) string {
	name = unsafeName.ReplaceAllString(name, "_")
	if len(name) > 120 {
		name = name[len(name)-120:]
	}
	if name == "" {
		return "file"
	}
	return name
}

// WriteExport streams a zip of everything in the workspace: workspace.json plus every document
// (original and signed) and attachment file.
func (s *Service) WriteExport(ctx context.Context, organizationID string, w io.Writer) error {
	export := Export{ExportedAt: time.Now().UTC(), Members: []ExportMember{}, Envelopes: []ExportEnvelope{}}
	if err := s.db.QueryRow(ctx, `SELECT id::text, name, created_at FROM organizations WHERE id = $1::uuid`, organizationID).
		Scan(&export.Workspace.ID, &export.Workspace.Name, &export.Workspace.CreatedAt); err != nil {
		return err
	}

	rows, err := s.db.Query(ctx, `
SELECT u.name, u.email, m.role::text, m.created_at FROM organization_memberships m JOIN users u ON u.id = m.user_id
WHERE m.organization_id = $1::uuid ORDER BY m.created_at`, organizationID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var m ExportMember
		if err := rows.Scan(&m.Name, &m.Email, &m.Role, &m.JoinedAt); err != nil {
			rows.Close()
			return err
		}
		export.Members = append(export.Members, m)
	}
	rows.Close()

	rows, err = s.db.Query(ctx, `
SELECT e.id::text, e.title, e.status::text, e.is_template, u.email, e.created_at, e.sent_at, e.completed_at, e.expires_at,
  COALESCE((SELECT json_agg(json_build_object('name', r.name, 'email', r.email, 'role', r.role, 'status', r.status, 'signingOrder', r.signing_order,
      'sentAt', r.sent_at, 'viewedAt', r.viewed_at, 'completedAt', r.completed_at, 'declinedAt', r.declined_at, 'declineReason', r.decline_reason)
    ORDER BY r.signing_order, r.created_at) FROM recipients r WHERE r.envelope_id = e.id), '[]'),
  COALESCE((SELECT json_agg(json_build_object('event', a.event_type, 'actor', au.name, 'recipient', ar.name, 'ipAddress', host(a.ip_address),
      'userAgent', a.user_agent, 'metadata', a.metadata, 'occurredAt', a.occurred_at) ORDER BY a.occurred_at)
    FROM audit_events a LEFT JOIN users au ON au.id = a.actor_user_id LEFT JOIN recipients ar ON ar.id = a.recipient_id WHERE a.envelope_id = e.id), '[]')
FROM envelopes e JOIN users u ON u.id = e.created_by
WHERE e.organization_id = $1::uuid ORDER BY e.created_at`, organizationID)
	if err != nil {
		return err
	}
	index := map[string]int{}
	for rows.Next() {
		var e ExportEnvelope
		var recipients, audit []byte
		if err := rows.Scan(&e.ID, &e.Title, &e.Status, &e.IsTemplate, &e.SenderEmail, &e.CreatedAt, &e.SentAt, &e.CompletedAt, &e.ExpiresAt, &recipients, &audit); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(recipients, &e.Recipients); err != nil {
			rows.Close()
			return err
		}
		if err := json.Unmarshal(audit, &e.AuditTrail); err != nil {
			rows.Close()
			return err
		}
		e.Documents, e.Attachments = []ExportFile{}, []ExportFile{}
		index[e.ID] = len(export.Envelopes)
		export.Envelopes = append(export.Envelopes, e)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	rows, err = s.db.Query(ctx, `
SELECT d.envelope_id::text, d.id::text, d.filename, d.object_key, COALESCE(d.completed_object_key, '') FROM documents d
JOIN envelopes e ON e.id = d.envelope_id WHERE e.organization_id = $1::uuid ORDER BY d.envelope_id, d.position`, organizationID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var envelopeID, id string
		var f ExportFile
		if err := rows.Scan(&envelopeID, &id, &f.Filename, &f.key, &f.signedKey); err != nil {
			rows.Close()
			return err
		}
		f.Path = path.Join("documents", envelopeID, id[:8]+"-"+safeName(f.Filename))
		if f.signedKey != "" {
			f.SignedPath = path.Join("signed", envelopeID, id[:8]+"-signed-"+safeName(f.Filename))
		}
		e := &export.Envelopes[index[envelopeID]]
		e.Documents = append(e.Documents, f)
	}
	rows.Close()

	rows, err = s.db.Query(ctx, `
SELECT a.envelope_id::text, a.id::text, a.filename, a.object_key FROM envelope_attachments a
JOIN envelopes e ON e.id = a.envelope_id WHERE e.organization_id = $1::uuid AND a.object_key IS NOT NULL`, organizationID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var envelopeID, id string
		var f ExportFile
		if err := rows.Scan(&envelopeID, &id, &f.Filename, &f.key); err != nil {
			rows.Close()
			return err
		}
		f.Path = path.Join("attachments", envelopeID, id[:8]+"-"+safeName(f.Filename))
		e := &export.Envelopes[index[envelopeID]]
		e.Attachments = append(e.Attachments, f)
	}
	rows.Close()

	store, err := s.objects.For(ctx, organizationID)
	if err != nil {
		return fmt.Errorf("open storage: %w", err)
	}
	archive := zip.NewWriter(w)
	copyFile := func(key, name string) error {
		body, err := store.Get(ctx, key)
		if err != nil {
			return err
		}
		defer body.Close()
		out, err := archive.Create(name)
		if err != nil {
			return err
		}
		_, err = io.Copy(out, body)
		return err
	}
	for i := range export.Envelopes {
		e := &export.Envelopes[i]
		for j := range e.Documents {
			f := &e.Documents[j]
			if err := copyFile(f.key, f.Path); err != nil {
				f.Missing, f.Path = "The original file couldn't be read from storage.", ""
			}
			if f.SignedPath != "" {
				if err := copyFile(f.signedKey, f.SignedPath); err != nil {
					f.Missing, f.SignedPath = "The signed copy couldn't be read from storage.", ""
				}
			}
		}
		for j := range e.Attachments {
			f := &e.Attachments[j]
			if err := copyFile(f.key, f.Path); err != nil {
				f.Missing, f.Path = "The file couldn't be read from storage.", ""
			}
		}
	}

	manifest, err := archive.Create("workspace.json")
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(manifest)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(export); err != nil {
		return err
	}
	readme, err := archive.Create("README.txt")
	if err != nil {
		return err
	}
	_, _ = fmt.Fprintf(readme, "Signet export of %q, made %s.\n\nworkspace.json lists members and every envelope with its recipients, audit trail and files.\ndocuments/ holds the files as uploaded, signed/ the sealed signed copies, attachments/ files added to envelopes.\n", export.Workspace.Name, export.ExportedAt.Format(time.RFC1123))
	return archive.Close()
}
