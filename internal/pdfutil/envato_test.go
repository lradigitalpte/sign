package pdfutil

import (
	"os"
	"testing"
)

func TestStampEnvatoLicense(t *testing.T) {
	data, err := os.ReadFile("testdata/envato.pdf")
	if err != nil {
		t.Skip(err)
	}
	png := transparentSignaturePNG(758, 320)
	stamped, err := StampFields(data, []Stamp{
		{Page: 1, X: 14.45, Y: 83.32, Width: 20.22, Height: 5.19, Image: png, Text: "Henry"},
		{Page: 1, X: 72.12, Y: 82.71, Width: 19.21, Height: 5.55, Text: "2026-08-31"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(stamped) <= len(data)+500 {
		t.Fatalf("stamped pdf too small: %d -> %d", len(data), len(stamped))
	}
}
