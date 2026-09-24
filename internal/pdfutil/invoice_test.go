package pdfutil

import (
	"bytes"
	"os"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
)

func TestStampInvoiceFromMinIO(t *testing.T) {
	data, err := os.ReadFile("../../tmp/invoice-orig.pdf")
	if err != nil {
		t.Skip(err)
	}
	comp, err := os.ReadFile("../../tmp/invoice-comp.pdf")
	if err != nil {
		t.Skip(err)
	}
	dims, err := api.PageDims(bytes.NewReader(data), nil)
	if err != nil {
		t.Fatal(err)
	}
	for i, dim := range dims {
		t.Logf("page %d: %.2f x %.2f pts", i+1, dim.Width, dim.Height)
	}

	png := transparentSignaturePNG(758, 320)
	stamped, err := StampFields(data, []Stamp{
		{Page: 1, X: 7.90, Y: 86.08, Width: 30.34, Height: 5.79, Image: png, Text: "Henry"},
		{Page: 1, X: 38.98, Y: 87.46, Width: 19.85, Height: 2.92, Text: "Henry"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("../../tmp/invoice-restamped.pdf", stamped, 0o644); err != nil {
		t.Fatal(err)
	}
	t.Logf("sizes orig=%d comp=%d restamped=%d", len(data), len(comp), len(stamped))
	if len(stamped) < len(data)+500 {
		t.Fatalf("restamped pdf suspiciously small")
	}
}
