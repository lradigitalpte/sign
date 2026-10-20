package lifecycle

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// RetentionPolicy is a workspace's "retention" settings section. Auto-delete is off unless the workspace turns it on.
type RetentionPolicy struct {
	AutoDelete bool `json:"autoDelete"`
	Months     int  `json:"retentionMonths"`
	LegalHold  bool `json:"legalHold"`
}

// Active reports whether the job would delete anything for this policy.
func (p RetentionPolicy) Active() bool {
	return p.AutoDelete && !p.LegalHold && p.Months >= MinRetentionMonths && p.Months <= MaxRetentionMonths
}

func LoadRetention(ctx context.Context, q querier, organizationID string) (RetentionPolicy, error) {
	var p RetentionPolicy
	err := q.QueryRow(ctx, `
SELECT COALESCE((config->>'autoDelete')::boolean, false),
       COALESCE((config->>'retentionMonths')::int, 0),
       COALESCE((config->>'legalHold')::boolean, false)
FROM organization_settings WHERE organization_id = $1::uuid AND section = 'retention'`, organizationID).Scan(&p.AutoDelete, &p.Months, &p.LegalHold)
	if errors.Is(err, pgx.ErrNoRows) {
		return RetentionPolicy{}, nil
	}
	return p, err
}

// retentionBatch caps how many envelopes one workspace loses per run, so one large backlog can't stall the job.
const retentionBatch = 200

// Finished envelopes count from when they finished; voided and expired ones from their last change.
const retentionAge = `COALESCE(e.completed_at, e.updated_at)`

// RunRetention deletes finished envelopes older than each workspace's retention period.
func (s *Service) RunRetention(ctx context.Context) (int, error) {
	orgs, err := textColumn(ctx, s.db, `
SELECT organization_id::text FROM organization_settings
WHERE section = 'retention' AND COALESCE((config->>'autoDelete')::boolean, false)
  AND NOT COALESCE((config->>'legalHold')::boolean, false)`)
	if err != nil {
		return 0, err
	}
	total := 0
	for _, orgID := range orgs {
		n, err := s.applyRetention(ctx, orgID)
		total += n
		if err != nil {
			s.logger.Error("lifecycle: retention for workspace", "organizationId", orgID, "error", err)
		}
	}
	return total, nil
}

// DueForRetention lists the envelopes the job would delete next for a workspace (up to one batch).
func DueForRetention(ctx context.Context, q querier, organizationID string, months int) ([]string, error) {
	return textColumn(ctx, q, `
SELECT e.id::text FROM envelopes e
WHERE e.organization_id = $1::uuid AND NOT e.is_template AND e.status IN ('completed', 'voided', 'expired')
  AND `+retentionAge+` < now() - make_interval(months => $2)
ORDER BY `+retentionAge+` LIMIT $3`, organizationID, months, retentionBatch)
}

func (s *Service) applyRetention(ctx context.Context, orgID string) (int, error) {
	policy, err := LoadRetention(ctx, s.db, orgID)
	if err != nil || !policy.Active() {
		return 0, err
	}
	record := func(envelopes, files int, cause error) {
		var message *string
		if cause != nil {
			text := cause.Error()
			message = &text
		}
		_, _ = s.db.Exec(ctx, `INSERT INTO retention_runs (organization_id, envelopes_deleted, files_deleted, error) VALUES ($1::uuid, $2, $3, $4)`, orgID, envelopes, files, message)
	}

	// The envelopes stay locked while their files are deleted, so nothing (an admin reopening one, say)
	// can change them halfway; locked ones are skipped until the next run.
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	ids, err := textColumn(ctx, tx, `
SELECT e.id::text FROM envelopes e
WHERE e.organization_id = $1::uuid AND NOT e.is_template AND e.status IN ('completed', 'voided', 'expired')
  AND `+retentionAge+` < now() - make_interval(months => $2)
ORDER BY `+retentionAge+` LIMIT $3 FOR UPDATE SKIP LOCKED`, orgID, policy.Months, retentionBatch)
	if err != nil || len(ids) == 0 {
		return 0, err
	}
	keys, err := envelopeKeys(ctx, tx, ids)
	if err != nil {
		return 0, err
	}
	files, err := s.deleteObjects(ctx, orgID, keys)
	if err != nil {
		record(0, files, err)
		return 0, err
	}
	tag, err := tx.Exec(ctx, `DELETE FROM envelopes WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		record(0, files, err)
		return 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		record(0, files, err)
		return 0, err
	}
	deleted := int(tag.RowsAffected())
	record(deleted, files, nil)
	return deleted, nil
}

// RetentionRun is one pass of the job over a workspace.
type RetentionRun struct {
	EnvelopesDeleted int       `json:"envelopesDeleted"`
	FilesDeleted     int       `json:"filesDeleted"`
	Error            *string   `json:"error"`
	RanAt            time.Time `json:"ranAt"`
}
