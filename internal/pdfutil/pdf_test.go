package pdfutil

import (
	"testing"
)

func TestSamplePageCount(t *testing.T) {
	data, err := Sample(3)
	if err != nil {
		t.Fatal(err)
	}
	count, err := CountPages(data)
	if err != nil {
		t.Fatal(err)
	}
	if count != 3 {
		t.Fatalf("page count = %d", count)
	}
}

func TestStampKeepsPageCount(t *testing.T) {
	data, err := Sample(2)
	if err != nil {
		t.Fatal(err)
	}
	stamped, err := StampFields(data, []Stamp{
		{Page: 1, X: 10, Y: 20, Width: 30, Height: 6, Text: "Ada Lovelace"},
		{Page: 2, X: 12, Y: 40, Width: 18, Height: 5, Text: "X"},
	})
	if err != nil {
		t.Fatal(err)
	}
	count, err := CountPages(stamped)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("stamped page count = %d", count)
	}
}

func TestEvidenceHasPages(t *testing.T) {
	data, err := Evidence("Agreement", []string{"Envelope completed", "Document sha256=abc"})
	if err != nil {
		t.Fatal(err)
	}
	count, err := CountPages(data)
	if err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("evidence page count = %d", count)
	}
}
