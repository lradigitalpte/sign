package envelope

import (
	"context"
	"encoding/json"
	"regexp"
	"time"
	// Embedded timezone data, so timezone preferences validate even on images without /usr/share/zoneinfo.
	_ "time/tzdata"
)

// Defaults are the settings a new envelope starts with: its team's Preferences and Notifications (the
// organization's, with any the team customized on top), falling back to the built-in defaults. Each
// envelope can still change them.
type Defaults struct {
	Language           string
	Timezone           string
	DateFormat         string
	AutoReminders      bool
	FirstReminderDays  int
	RepeatReminderDays int
	NotifyOnView       bool
	NotifyOnSign       bool
}

var builtInDefaults = Defaults{
	Language: "en", Timezone: "Etc/UTC", DateFormat: "YYYY-MM-DD",
	AutoReminders: true, FirstReminderDays: 3, RepeatReminderDays: 2,
	NotifyOnView: true, NotifyOnSign: true,
}

var languageCode = regexp.MustCompile(`^[a-z]{2,3}(-[A-Z]{2})?$`)

// workspaceDefaults reads the settings that apply to the team (the workspace's default team when teamID
// is empty or not in the workspace). Values that don't make sense (a timezone that doesn't exist, a
// reminder of 500 days) are ignored rather than copied onto envelopes.
func (s *PostgresStore) workspaceDefaults(ctx context.Context, organizationID, teamID string) (Defaults, error) {
	var preferencesRaw, notificationsRaw []byte
	err := s.db.QueryRow(ctx, `
WITH team AS (
  SELECT COALESCE((SELECT id FROM teams WHERE id::text = $2 AND organization_id = $1::uuid),
                  (SELECT id FROM teams WHERE organization_id = $1::uuid AND is_default)) AS id
)
SELECT effective_settings($1::uuid, (SELECT id FROM team), 'preferences'),
       effective_settings($1::uuid, (SELECT id FROM team), 'notifications')`, organizationID, teamID).
		Scan(&preferencesRaw, &notificationsRaw)
	if err != nil {
		return builtInDefaults, err
	}
	var prefs struct {
		Language           *string  `json:"language"`
		Timezone           *string  `json:"timezone"`
		DateFormat         *string  `json:"dateFormat"`
		AutoReminders      *bool    `json:"automaticReminders"`
		FirstReminderDays  *float64 `json:"firstReminderDays"`
		RepeatReminderDays *float64 `json:"repeatReminderDays"`
	}
	var notifications struct {
		RecipientViewed *bool `json:"recipientViewed"`
		RecipientSigned *bool `json:"recipientSigned"`
	}
	// Settings saved by older versions of the page may hold other types; ignore what doesn't decode.
	_ = json.Unmarshal(preferencesRaw, &prefs)
	_ = json.Unmarshal(notificationsRaw, &notifications)

	d := builtInDefaults
	if prefs.Language != nil && languageCode.MatchString(*prefs.Language) {
		d.Language = *prefs.Language
	}
	if prefs.Timezone != nil && *prefs.Timezone != "" {
		if _, err := time.LoadLocation(*prefs.Timezone); err == nil {
			d.Timezone = *prefs.Timezone
		}
	}
	if prefs.DateFormat != nil && *prefs.DateFormat != "" && len(*prefs.DateFormat) <= 40 {
		d.DateFormat = *prefs.DateFormat
	}
	if prefs.AutoReminders != nil {
		d.AutoReminders = *prefs.AutoReminders
	}
	if days := prefs.FirstReminderDays; days != nil && *days >= 1 && *days <= 90 {
		d.FirstReminderDays = int(*days)
	}
	if days := prefs.RepeatReminderDays; days != nil && *days >= 1 && *days <= 90 {
		d.RepeatReminderDays = int(*days)
	}
	if notifications.RecipientViewed != nil {
		d.NotifyOnView = *notifications.RecipientViewed
	}
	if notifications.RecipientSigned != nil {
		d.NotifyOnSign = *notifications.RecipientSigned
	}
	return d, nil
}
