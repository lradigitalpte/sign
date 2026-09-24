package pdfutil

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func pngBytes(width, height int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 17, G: 24, B: 39, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

func transparentSignaturePNG(width, height int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			if x > 20 && x < width-20 && y > height/3 && y < 2*height/3 {
				img.Set(x, y, color.RGBA{R: 17, G: 24, B: 39, A: 255})
			}
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		panic(err)
	}
	return buf.Bytes()
}

func TestStampSignatureImageVisible(t *testing.T) {
	data, err := Sample(1)
	if err != nil {
		t.Fatal(err)
	}
	before, err := CountPages(data)
	if err != nil {
		t.Fatal(err)
	}
	png := pngBytes(758, 320)
	stamped, err := StampFields(data, []Stamp{
		{Page: 1, X: 14.45, Y: 83.32, Width: 20.22, Height: 5.19, Image: png, Text: "Henry"},
		{Page: 1, X: 18.45, Y: 89.96, Width: 12.66, Height: 3.96, Text: "2026-08-31"},
	})
	if err != nil {
		t.Fatal(err)
	}
	after, err := CountPages(stamped)
	if err != nil {
		t.Fatal(err)
	}
	if after != before {
		t.Fatalf("page count changed %d -> %d", before, after)
	}
	if len(stamped) <= len(data)+100 {
		t.Fatalf("expected stamped PDF to grow noticeably, got %d -> %d", len(data), len(stamped))
	}
}

func TestImageOnlyStampAddsContent(t *testing.T) {
	data, err := Sample(1)
	if err != nil {
		t.Fatal(err)
	}
	png := pngBytes(758, 320)
	imgOnly, err := StampFields(data, []Stamp{{Page: 1, X: 14, Y: 83, Width: 20, Height: 5, Image: png}})
	if err != nil {
		t.Fatal(err)
	}
	textOnly, err := StampFields(data, []Stamp{{Page: 1, X: 14, Y: 83, Width: 20, Height: 5, Text: "Henry"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(imgOnly) <= len(data) {
		t.Fatalf("image stamp should modify pdf: orig=%d img=%d", len(data), len(imgOnly))
	}
	if len(textOnly) <= len(data) {
		t.Fatalf("text stamp should modify pdf: orig=%d text=%d", len(data), len(textOnly))
	}
}

func TestTransparentSignaturePNG(t *testing.T) {
	data, err := Sample(1)
	if err != nil {
		t.Fatal(err)
	}
	png := transparentSignaturePNG(758, 320)
	stamped, err := StampFields(data, []Stamp{{Page: 1, X: 14, Y: 83, Width: 20, Height: 5, Image: png, Text: "Henry"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(stamped) <= len(data)+100 {
		t.Fatalf("transparent png stamp did not modify pdf enough: %d -> %d", len(data), len(stamped))
	}
}
