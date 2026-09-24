package pdfutil

import (
	_ "embed"
	"os"
	"path/filepath"
	"runtime"
)

//go:embed fonts/Arial.ttf
var embeddedRegularFont []byte

var fontRegularPath = initFontRegularPath()

func initFontRegularPath() string {
	if len(embeddedRegularFont) == 0 {
		return ""
	}
	dir, err := os.MkdirTemp("", "signing-platform-fonts-*")
	if err != nil {
		return ""
	}
	path := filepath.Join(dir, "Arial.ttf")
	if err := os.WriteFile(path, embeddedRegularFont, 0o600); err != nil {
		return ""
	}
	return path
}

func init() {
	if fontRegularPath != "" {
		return
	}
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return
	}
	fontRegularPath = filepath.Join(filepath.Dir(file), "fonts", "Arial.ttf")
}
