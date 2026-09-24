package pdfutil

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

type Stamp struct {
	Page   int
	X      float64
	Y      float64
	Width  float64
	Height float64
	Text   string
	Image  []byte
}

func CountPages(data []byte) (int, error) {
	if len(data) == 0 {
		return 0, fmt.Errorf("empty PDF")
	}
	count, err := api.PageCount(bytes.NewReader(data), nil)
	if err != nil {
		return 0, err
	}
	if count < 1 {
		return 0, fmt.Errorf("PDF has no pages")
	}
	return count, nil
}

func Sample(pages int) ([]byte, error) {
	if pages < 1 {
		pages = 1
	}
	content := map[string]any{}
	for i := 1; i <= pages; i++ {
		content[strconv.Itoa(i)] = map[string]any{
			"content": map[string]any{
				"text": []any{
					map[string]any{
						"value":  fmt.Sprintf("Page %d", i),
						"anchor": "c",
						"font":   map[string]any{"name": "Helvetica", "size": 18},
					},
				},
			},
		}
	}
	raw, err := json.Marshal(map[string]any{"paper": "A4", "pages": content})
	if err != nil {
		return nil, err
	}
	var out bytes.Buffer
	if err := api.Create(nil, bytes.NewReader(raw), &out, nil); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func StampFields(data []byte, stamps []Stamp) ([]byte, error) {
	if len(stamps) == 0 {
		return data, nil
	}
	dims, err := api.PageDims(bytes.NewReader(data), nil)
	if err != nil {
		return nil, err
	}
	grouped := map[int][]*model.Watermark{}
	for pageNumber, dim := range dims {
		page := pageNumber + 1
		pageStamps := []Stamp{}
		for _, stamp := range stamps {
			if stamp.Page == page {
				pageStamps = append(pageStamps, stamp)
			}
		}
		if len(pageStamps) == 0 {
			continue
		}
		overlayPNG, err := renderPageOverlay(dim.Width, dim.Height, pageStamps)
		if err != nil {
			return nil, err
		}
		// Overlay PNG uses OverlayScale pixels per PDF point; map it back to page size in points.
		pixelWidth := float64(int(math.Round(dim.Width * OverlayScale)))
		desc := fmt.Sprintf("pos:tl, off:0 0, rot:0, scale:%.6f abs, op:1", dim.Width/pixelWidth)
		watermark, err := api.ImageWatermarkForReader(bytes.NewReader(overlayPNG), desc, true, false, types.POINTS)
		if err != nil {
			return nil, fmt.Errorf("stamp overlay page %d: %w", page, err)
		}
		grouped[page] = append(grouped[page], watermark)
	}
	if len(grouped) == 0 {
		return data, nil
	}
	var out bytes.Buffer
	if err := api.AddWatermarksSliceMap(bytes.NewReader(data), &out, grouped, nil); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func Evidence(title string, lines []string) ([]byte, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		title = "Evidence certificate"
	}
	const perPage = 36
	if len(lines) == 0 {
		lines = []string{"No events recorded."}
	}
	pages := map[string]any{}
	page := 1
	for start := 0; start < len(lines); start += perPage {
		end := start + perPage
		if end > len(lines) {
			end = len(lines)
		}
		heading := title
		if page > 1 {
			heading = fmt.Sprintf("%s (page %d)", title, page)
		}
		pages[strconv.Itoa(page)] = map[string]any{
			"content": map[string]any{
				"text": []any{
					map[string]any{
						"value":  heading,
						"anchor": "tl",
						"dx":     36,
						"dy":     36,
						"font":   map[string]any{"name": "Helvetica-Bold", "size": 14},
					},
					map[string]any{
						"value":  strings.Join(lines[start:end], "\n"),
						"anchor": "tl",
						"dx":     36,
						"dy":     64,
						"font":   map[string]any{"name": "Courier", "size": 8},
					},
				},
			},
		}
		page++
	}
	raw, err := json.Marshal(map[string]any{"paper": "A4", "pages": pages})
	if err != nil {
		return nil, err
	}
	var out bytes.Buffer
	if err := api.Create(nil, bytes.NewReader(raw), &out, nil); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
