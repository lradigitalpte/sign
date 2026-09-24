package email

import (
	"context"
	"html"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Preview struct {
	dir    string
	logger *slog.Logger
	relay  Mailer
	mu     sync.Mutex
}

func NewPreview(dir string, logger *slog.Logger, relay Mailer) (*Preview, error) {
	if dir == "" {
		dir = "var/email-previews"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Preview{dir: dir, logger: logger, relay: relay}, nil
}

func (p *Preview) Send(_ context.Context, message Message) (Result, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	name := time.Now().UTC().Format("20060102T150405.000000000") + ".html"
	path := filepath.Join(p.dir, name)
	body := previewHTML(message)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		return Result{}, err
	}
	p.logger.Info("stored email preview", "to", message.To, "file", name)

	result := Result{Provider: "preview", MessageID: name}
	if p.relay != nil {
		if relayed, err := p.relay.Send(context.Background(), message); err != nil {
			p.logger.Warn("optional SMTP relay failed", "error", err)
		} else {
			result.Provider = relayed.Provider
			if relayed.MessageID != "" {
				result.MessageID = relayed.MessageID
			}
		}
	}
	return result, nil
}

func (p *Preview) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		entries, err := os.ReadDir(p.dir)
		if err != nil {
			http.Error(w, "unable to list previews", http.StatusInternalServerError)
			return
		}
		names := []string{}
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".html") {
				names = append(names, entry.Name())
			}
		}
		sort.Sort(sort.Reverse(sort.StringSlice(names)))
		var b strings.Builder
		b.WriteString("<html><body><h1>Email previews</h1><ul>")
		if len(names) == 0 {
			b.WriteString("<li>No messages yet.</li>")
		}
		for _, name := range names {
			b.WriteString(`<li><a href="/messages/` + html.EscapeString(name) + `">` + html.EscapeString(name) + `</a></li>`)
		}
		b.WriteString("</ul></body></html>")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(b.String()))
	})
	mux.Handle("/messages/", http.StripPrefix("/messages/", http.FileServer(http.Dir(p.dir))))
	return mux
}

func (p *Preview) ListenAndServe(ctx context.Context, address string) error {
	if address == "" {
		address = ":8090"
	}
	server := &http.Server{Addr: address, Handler: p.Handler()}
	errCh := make(chan error, 1)
	go func() {
		p.logger.Info("email preview listening", "address", address)
		errCh <- server.ListenAndServe()
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownCtx)
		err := <-errCh
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	case err := <-errCh:
		if err == http.ErrServerClosed {
			return nil
		}
		return err
	}
}

func previewHTML(message Message) string {
	htmlBody := message.HTML
	if htmlBody == "" {
		htmlBody = "<pre>" + html.EscapeString(message.Text) + "</pre>"
	}
	return "<html><body><p><strong>To:</strong> " + html.EscapeString(message.To) + "</p><p><strong>Subject:</strong> " + html.EscapeString(message.Subject) + "</p><hr>" + htmlBody + "</body></html>"
}
