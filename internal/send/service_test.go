package send

import (
	"context"
	"testing"
)

type fakeStore struct{ key string }

func (f *fakeStore) Review(context.Context, string, string) (Review, error) {
	return Review{Ready: true}, nil
}

func (f *fakeStore) Send(_ context.Context, _, _, _, key string, _ func() (Token, error)) (Result, error) {
	f.key = key
	return Result{Status: "in_progress"}, nil
}

func (f *fakeStore) Advance(context.Context, string, func() (Token, error)) (int, error) {
	return 0, nil
}

func (f *fakeStore) Remind(context.Context, string, string, string, func() (Token, error)) (RemindResult, error) {
	return RemindResult{}, nil
}
func (f *fakeStore) ShareLink(context.Context, string, string, string, func() (Token, error)) (string, error) {
	return "token", nil
}

func TestSendRequiresIdempotencyKey(t *testing.T) {
	_, err := NewService(&fakeStore{}, nil).Send(context.Background(), "org", "user", "env", "")
	if err != ErrIdempotencyKey {
		t.Fatalf("error=%v", err)
	}
}

func TestRemindRequiresEnvelopeID(t *testing.T) {
	_, err := NewService(&fakeStore{}, nil).Remind(context.Background(), "org", "user", "  ")
	if err != ErrNotFound {
		t.Fatalf("error=%v", err)
	}
}

func TestSendPassesIdempotencyKey(t *testing.T) {
	store := &fakeStore{}
	_, err := NewService(store, func() (Token, error) { return Token{}, nil }).Send(context.Background(), "org", "user", "env", "request-1")
	if err != nil || store.key != "request-1" {
		t.Fatalf("unexpected result %v %s", err, store.key)
	}
}

func readySnapshot() snapshot {
	return snapshot{
		EnvelopeID: "env",
		Title:      "Agreement",
		Status:     "draft",
		Documents:  []snapshotDocument{{ID: "doc", Filename: "agreement.pdf", PageCount: 2}},
		Recipients: []snapshotRecipient{
			{ID: "signer-1", Name: "Alex", Email: "alex@example.com", Role: "signer", SigningOrder: 1},
		},
		Fields: []snapshotField{
			{DocumentID: "doc", RecipientID: "signer-1", Type: "signature", Page: 1, Required: true},
		},
	}
}

func TestEvaluateReadyDraft(t *testing.T) {
	review := evaluate(readySnapshot())
	if !review.Ready || len(review.Errors) != 0 {
		t.Fatalf("unexpected review %#v", review)
	}
	if review.FieldCounts.Total != 1 || review.FieldCounts.Required != 1 || review.FieldCounts.ByType["signature"] != 1 {
		t.Fatalf("unexpected field counts %#v", review.FieldCounts)
	}
	if len(review.Documents) != 1 || review.Documents[0].FieldCount != 1 {
		t.Fatalf("unexpected documents %#v", review.Documents)
	}
	if len(review.Recipients) != 1 || review.Recipients[0].MissingRequiredFields || !review.Recipients[0].Actionable {
		t.Fatalf("unexpected recipients %#v", review.Recipients)
	}
}

func TestEvaluateRequiresPDFAndActionableRecipient(t *testing.T) {
	value := readySnapshot()
	value.Documents = nil
	value.Recipients = []snapshotRecipient{{ID: "cc", Name: "Pat", Email: "pat@example.com", Role: "cc", SigningOrder: 1}}
	value.Fields = nil
	review := evaluate(value)
	if review.Ready {
		t.Fatal("expected not ready")
	}
	if len(review.Errors) != 2 {
		t.Fatalf("errors=%v", review.Errors)
	}
}

func TestEvaluateSignerMissingRequiredField(t *testing.T) {
	value := readySnapshot()
	value.Fields[0].Required = false
	review := evaluate(value)
	if review.Ready || !review.Recipients[0].MissingRequiredFields {
		t.Fatalf("unexpected review %#v", review)
	}
}

func TestEvaluateDuplicateEmailsAndInvalidFieldRefs(t *testing.T) {
	value := readySnapshot()
	value.Recipients = append(value.Recipients, snapshotRecipient{ID: "other", Name: "Alex", Email: "alex@example.com", Role: "approver", SigningOrder: 2})
	value.Fields = append(value.Fields,
		snapshotField{DocumentID: "missing", RecipientID: "signer-1", Type: "date", Page: 1, Required: true},
		snapshotField{DocumentID: "doc", RecipientID: "unknown", Type: "date", Page: 9, Required: true},
	)
	review := evaluate(value)
	if review.Ready {
		t.Fatal("expected not ready")
	}
	found := map[string]bool{}
	for _, message := range review.Errors {
		found[message] = true
	}
	if !found["Recipient email addresses must be unique"] || !found["All fields must reference a document and recipient on this envelope"] || !found["All fields must reference a valid document page"] {
		t.Fatalf("errors=%v", review.Errors)
	}
}

func TestEvaluateSigningOrder(t *testing.T) {
	value := readySnapshot()
	value.Recipients = []snapshotRecipient{
		{ID: "first", Name: "A", Email: "a@example.com", Role: "signer", SigningOrder: 1},
		{ID: "third", Name: "B", Email: "b@example.com", Role: "approver", SigningOrder: 3},
	}
	value.Fields = []snapshotField{{DocumentID: "doc", RecipientID: "first", Type: "signature", Page: 1, Required: true}}
	review := evaluate(value)
	if review.Ready || review.Errors[len(review.Errors)-1] != "Signing order cannot skip steps" {
		t.Fatalf("errors=%v", review.Errors)
	}

	value.Recipients[0].SigningOrder = 2
	value.Recipients[1].SigningOrder = 2
	review = evaluate(value)
	if review.Ready || review.Errors[len(review.Errors)-1] != "Signing order must start at 1" {
		t.Fatalf("errors=%v", review.Errors)
	}
}

func TestEvaluateAllowsParallelOrderAndCC(t *testing.T) {
	value := readySnapshot()
	value.Recipients = []snapshotRecipient{
		{ID: "signer-1", Name: "A", Email: "a@example.com", Role: "signer", SigningOrder: 1},
		{ID: "approver", Name: "B", Email: "b@example.com", Role: "approver", SigningOrder: 1},
		{ID: "cc", Name: "C", Email: "c@example.com", Role: "cc", SigningOrder: 9},
	}
	review := evaluate(value)
	if !review.Ready {
		t.Fatalf("expected ready, errors=%v", review.Errors)
	}
}

func TestEvaluateWarnsWhenNoFields(t *testing.T) {
	value := readySnapshot()
	value.Recipients[0].Role = "viewer"
	value.Fields = nil
	review := evaluate(value)
	if !review.Ready || len(review.Warnings) != 1 {
		t.Fatalf("unexpected review %#v", review)
	}
}

func TestEvaluateAllowsSoloSelfSignWithoutFields(t *testing.T) {
	value := readySnapshot()
	value.Fields = nil
	review := evaluate(value)
	if !review.Ready {
		t.Fatalf("expected solo self-sign draft to be sendable, errors=%v", review.Errors)
	}
	if review.Recipients[0].MissingRequiredFields {
		t.Fatalf("solo self-sign signer should not be marked missing fields")
	}
	if len(review.Warnings) != 1 || review.Warnings[0] != "No document fields have been placed" {
		t.Fatalf("unexpected warnings %#v", review.Warnings)
	}
}
