package pdfutil

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	_ "image/png"
	"math"
	"strings"

	"github.com/fogleman/gg"
)

// OverlayScale renders stamp overlays above native PDF point density for sharper output.
const OverlayScale = 3.0

func fieldRect(pageW, pageH, xPct, yPct, wPct, hPct float64) (x, y, w, h float64) {
	return pageW * xPct / 100, pageH * yPct / 100, pageW * wPct / 100, pageH * hPct / 100
}

func fitImageSize(imgW, imgH, boxW, boxH float64) (float64, float64) {
	if imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0 {
		return boxW, boxH
	}
	scale := math.Min(boxW/imgW, boxH/imgH)
	if scale > 1 {
		scale = 1
	}
	return imgW * scale, imgH * scale
}

func drawStampImage(dc *gg.Context, img image.Image, boxX, boxY, boxW, boxH float64) {
	bounds := img.Bounds()
	imgW := float64(bounds.Dx())
	imgH := float64(bounds.Dy())
	drawW, drawH := fitImageSize(imgW, imgH, boxW, boxH)
	x := boxX + (boxW-drawW)/2
	y := boxY + (boxH-drawH)/2
	dc.Push()
	dc.Translate(x, y)
	dc.Scale(drawW/imgW, drawH/imgH)
	dc.DrawImage(img, 0, 0)
	dc.Pop()
}

func drawStampText(dc *gg.Context, text string, boxX, boxY, boxW, boxH float64) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	minSize := 8.0
	maxSize := math.Max(minSize, boxH*0.72)
	size := maxSize
	for size >= minSize {
		if err := dc.LoadFontFace(fontRegularPath, size); err != nil {
			return err
		}
		w, h := dc.MeasureString(text)
		if w <= boxW && h <= boxH {
			break
		}
		size -= 0.5
	}
	if err := dc.LoadFontFace(fontRegularPath, size); err != nil {
		return err
	}
	dc.SetColor(color.RGBA{R: 17, G: 24, B: 39, A: 255})
	dc.DrawStringAnchored(text, boxX+boxW/2, boxY+boxH/2, 0.5, 0.5)
	return nil
}

func renderPageOverlay(pageW, pageH float64, stamps []Stamp) ([]byte, error) {
	if len(stamps) == 0 {
		return nil, nil
	}
	width := int(math.Round(pageW * OverlayScale))
	height := int(math.Round(pageH * OverlayScale))
	if width < 1 || height < 1 {
		return nil, fmt.Errorf("invalid page dimensions")
	}

	dc := gg.NewContext(width, height)
	dc.Scale(OverlayScale, OverlayScale)
	dc.SetColor(color.Transparent)
	dc.Clear()

	for _, stamp := range stamps {
		boxX, boxY, boxW, boxH := fieldRect(pageW, pageH, stamp.X, stamp.Y, stamp.Width, stamp.Height)
		if len(stamp.Image) > 0 {
			img, _, err := image.Decode(bytes.NewReader(stamp.Image))
			if err != nil {
				return nil, fmt.Errorf("decode stamp image: %w", err)
			}
			drawStampImage(dc, img, boxX, boxY, boxW, boxH)
			continue
		}
		if err := drawStampText(dc, stamp.Text, boxX, boxY, boxW, boxH); err != nil {
			return nil, err
		}
	}

	var buf bytes.Buffer
	if err := dc.EncodePNG(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
